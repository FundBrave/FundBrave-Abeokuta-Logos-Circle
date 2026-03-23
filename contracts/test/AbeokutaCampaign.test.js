/**
 * AbeokutaCampaign Tests
 * Covers all donation paths, circuit breaker, withdrawal, and admin functions.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AbeokutaCampaign", function () {
  let campaign, mockUSDC, mockSwap;
  let owner, donor1, donor2, treasury, bridge, stakingPool, other;

  const USDC_DECIMALS = 6;
  const ONE_USDC      = 10n ** BigInt(USDC_DECIMALS);
  const GOAL_MIN      = 1_000n * ONE_USDC;
  const GOAL_MAX      = 2_500n * ONE_USDC;

  let deadline;

  beforeEach(async function () {
    [owner, donor1, donor2, treasury, bridge, stakingPool, other] =
      await ethers.getSigners();

    // Deploy mock USDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    const usdcAddress = await mockUSDC.getAddress();

    // Deploy mock swap adapter
    const MockSwap = await ethers.getContractFactory("MockSwapAdapter");
    mockSwap = await MockSwap.deploy(usdcAddress);
    const swapAddress = await mockSwap.getAddress();

    // Fund the swap adapter so it can "swap" tokens
    await mockUSDC.mint(swapAddress, 100_000n * ONE_USDC);

    // Set deadline 60 days from now
    const now = await time.latest();
    deadline = now + 60 * 86400;

    // Deploy campaign
    const CampaignFactory = await ethers.getContractFactory("AbeokutaCampaign");
    campaign = await CampaignFactory.deploy(
      usdcAddress,
      swapAddress,
      treasury.address,
      GOAL_MIN,
      GOAL_MAX,
      deadline
    );

    const campaignAddress = await campaign.getAddress();

    // Authorise bridge and staking pool
    await campaign.setBridgeContract(bridge.address);
    await campaign.setStakingPool(stakingPool.address);

    // Mint USDC to donors
    await mockUSDC.mint(donor1.address, 10_000n * ONE_USDC);
    await mockUSDC.mint(donor2.address, 10_000n * ONE_USDC);

    // Approve campaign for donors
    await mockUSDC.connect(donor1).approve(campaignAddress, ethers.MaxUint256);
    await mockUSDC.connect(donor2).approve(campaignAddress, ethers.MaxUint256);
  });

  // ──────────────────────────────────────────────
  // Deployment
  // ──────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets correct initial state", async function () {
      expect(await campaign.goalMin()).to.equal(GOAL_MIN);
      expect(await campaign.goalMax()).to.equal(GOAL_MAX);
      expect(await campaign.treasury()).to.equal(treasury.address);
      expect(await campaign.totalRaised()).to.equal(0);
      expect(await campaign.donorCount()).to.equal(0);
    });

    it("reverts with zero goal", async function () {
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const now = await time.latest();
      await expect(
        CF.deploy(
          await mockUSDC.getAddress(),
          await mockSwap.getAddress(),
          treasury.address,
          0,
          GOAL_MAX,
          now + 86400
        )
      ).to.be.revertedWith("Invalid goal range");
    });

    it("reverts with past deadline", async function () {
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const now = await time.latest();
      await expect(
        CF.deploy(
          await mockUSDC.getAddress(),
          await mockSwap.getAddress(),
          treasury.address,
          GOAL_MIN,
          GOAL_MAX,
          now - 1
        )
      ).to.be.revertedWith("Deadline in past");
    });
  });

  // ──────────────────────────────────────────────
  // Direct USDC donation
  // ──────────────────────────────────────────────

  describe("donateUSDC", function () {
    it("accepts USDC and updates state", async function () {
      const amount = 100n * ONE_USDC;
      await expect(campaign.connect(donor1).donateUSDC(amount))
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, await mockUSDC.getAddress(), "base");

      expect(await campaign.totalRaised()).to.equal(amount);
      expect(await campaign.donorCount()).to.equal(1);
      expect(await campaign.donorTotalContributed(donor1.address)).to.equal(amount);
    });

    it("accumulates multiple donations from same donor", async function () {
      const a1 = 200n * ONE_USDC;
      const a2 = 300n * ONE_USDC;
      await campaign.connect(donor1).donateUSDC(a1);
      await campaign.connect(donor1).donateUSDC(a2);

      expect(await campaign.totalRaised()).to.equal(a1 + a2);
      expect(await campaign.donorCount()).to.equal(1); // same donor
    });

    it("counts unique donors correctly", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await campaign.connect(donor2).donateUSDC(100n * ONE_USDC);
      expect(await campaign.donorCount()).to.equal(2);
    });

    it("reverts with zero amount", async function () {
      await expect(campaign.connect(donor1).donateUSDC(0))
        .to.be.revertedWithCustomError(campaign, "ZeroAmount");
    });

    it("reverts after deadline", async function () {
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(donor1).donateUSDC(100n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "CampaignEnded");
    });

    it("reverts when paused", async function () {
      await campaign.pause();
      await expect(campaign.connect(donor1).donateUSDC(100n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "EnforcedPause");
    });
  });

  // ──────────────────────────────────────────────
  // ERC20 donation (auto-swap)
  // ──────────────────────────────────────────────

  describe("donateERC20", function () {
    let mockDAI;

    beforeEach(async function () {
      // Deploy a "DAI" mock (18 decimals but mock adapter handles it 1:1)
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      mockDAI = await MockUSDC.deploy(); // reuse mock, just treated as different token
      await mockDAI.mint(donor1.address, 1_000n * ONE_USDC);
      await mockDAI
        .connect(donor1)
        .approve(await campaign.getAddress(), ethers.MaxUint256);
    });

    it("swaps ERC20 to USDC and records donation", async function () {
      const amount = 50n * ONE_USDC;
      const daiAddress = await mockDAI.getAddress();
      await expect(campaign.connect(donor1).donateERC20(daiAddress, amount))
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, daiAddress, "base");

      expect(await campaign.totalRaised()).to.equal(amount);
    });

    it("handles USDC donation without swap", async function () {
      const amount = 75n * ONE_USDC;
      await expect(
        campaign.connect(donor1).donateERC20(await mockUSDC.getAddress(), amount)
      )
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, await mockUSDC.getAddress(), "base");
    });
  });

  // ──────────────────────────────────────────────
  // Cross-chain credit (bridge/staking)
  // ──────────────────────────────────────────────

  describe("creditDonation", function () {
    it("bridge can credit a cross-chain donation", async function () {
      const amount = 500n * ONE_USDC;

      // Simulate bridge transferring USDC to campaign first
      await mockUSDC.mint(await campaign.getAddress(), amount);

      await expect(
        campaign.connect(bridge).creditDonation(donor1.address, amount, "ethereum")
      )
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, await mockUSDC.getAddress(), "ethereum");

      expect(await campaign.totalRaised()).to.equal(amount);
    });

    it("staking pool can credit yield as donation", async function () {
      const amount = 25n * ONE_USDC;
      await mockUSDC.mint(await campaign.getAddress(), amount);

      await campaign
        .connect(stakingPool)
        .creditDonation(stakingPool.address, amount, "staking-yield");

      expect(await campaign.totalRaised()).to.equal(amount);
    });

    it("reverts for unauthorized callers", async function () {
      await expect(
        campaign.connect(other).creditDonation(donor1.address, 100n * ONE_USDC, "base")
      ).to.be.revertedWithCustomError(campaign, "Unauthorized");
    });
  });

  // ──────────────────────────────────────────────
  // Recent donations feed
  // ──────────────────────────────────────────────

  describe("getRecentDonations", function () {
    it("returns donations newest-first", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await campaign.connect(donor2).donateUSDC(200n * ONE_USDC);

      const records = await campaign.getRecentDonations(0, 10);
      expect(records.length).to.equal(2);
      // Newest first: donor2 was last
      expect(records[0].donor).to.equal(donor2.address);
      expect(records[1].donor).to.equal(donor1.address);
    });

    it("respects pagination", async function () {
      for (let i = 0; i < 5; i++) {
        await campaign.connect(donor1).donateUSDC(10n * ONE_USDC);
      }
      const page1 = await campaign.getRecentDonations(0, 3);
      const page2 = await campaign.getRecentDonations(3, 3);
      expect(page1.length).to.equal(3);
      expect(page2.length).to.equal(2);
    });

    it("returns empty array when no donations", async function () {
      const records = await campaign.getRecentDonations(0, 10);
      expect(records.length).to.equal(0);
    });
  });

  // ──────────────────────────────────────────────
  // Campaign stats
  // ──────────────────────────────────────────────

  describe("getCampaignStats", function () {
    it("returns correct stats after donations", async function () {
      const amount = 500n * ONE_USDC;
      await campaign.connect(donor1).donateUSDC(amount);

      const stats = await campaign.getCampaignStats();
      expect(stats._totalRaised).to.equal(amount);
      expect(stats._donorCount).to.equal(1);
      expect(stats._isActive).to.equal(true);
      expect(stats._minGoalReached).to.equal(false);
    });

    it("minGoalReached is true when goal met", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      const stats = await campaign.getCampaignStats();
      expect(stats._minGoalReached).to.equal(true);
    });
  });

  // ──────────────────────────────────────────────
  // Progress
  // ──────────────────────────────────────────────

  describe("progressBps", function () {
    it("returns 0 initially", async function () {
      expect(await campaign.progressBps()).to.equal(0);
    });

    it("returns correct bps at half max goal", async function () {
      const halfMax = GOAL_MAX / 2n;
      await campaign.connect(donor1).donateUSDC(halfMax);
      expect(await campaign.progressBps()).to.equal(5000);
    });

    it("caps at 10000 bps (100%)", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MAX + 1n * ONE_USDC);
      expect(await campaign.progressBps()).to.equal(10000);
    });
  });

  // ──────────────────────────────────────────────
  // Withdrawal
  // ──────────────────────────────────────────────

  describe("withdrawToTreasury", function () {
    it("treasury can withdraw after deadline", async function () {
      const amount = 500n * ONE_USDC;
      await campaign.connect(donor1).donateUSDC(amount);

      await time.increaseTo(deadline + 1);

      const before = await mockUSDC.balanceOf(treasury.address);
      await campaign.connect(treasury).withdrawToTreasury();
      const after = await mockUSDC.balanceOf(treasury.address);

      expect(after - before).to.equal(amount);
    });

    it("owner can withdraw after deadline", async function () {
      await campaign.connect(donor1).donateUSDC(500n * ONE_USDC);
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(owner).withdrawToTreasury()).to.not.be.reverted;
    });

    it("treasury can withdraw early if min goal is reached", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await expect(campaign.connect(treasury).withdrawToTreasury()).to.not.be.reverted;
    });

    it("reverts if called by non-treasury/non-owner", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await expect(campaign.connect(other).withdrawToTreasury())
        .to.be.revertedWithCustomError(campaign, "Unauthorized");
    });

    it("reverts if active campaign has not reached min goal", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC); // below min goal
      await expect(campaign.connect(treasury).withdrawToTreasury())
        .to.be.revertedWithCustomError(campaign, "GoalNotReached");
    });
  });

  // ──────────────────────────────────────────────
  // Circuit breaker
  // ──────────────────────────────────────────────

  describe("Circuit breaker", function () {
    it("allows transactions within limits", async function () {
      const amount = 100n * ONE_USDC;
      await expect(campaign.connect(donor1).donateUSDC(amount)).to.not.be.reverted;
    });

    it("blocks single transaction above limit (5k USDC)", async function () {
      const bigAmount = 6_000n * ONE_USDC;
      await mockUSDC.mint(donor1.address, bigAmount);
      await mockUSDC.connect(donor1).approve(await campaign.getAddress(), bigAmount);

      await expect(campaign.connect(donor1).donateUSDC(bigAmount))
        .to.be.revertedWithCustomError(campaign, "TransactionBlocked");
    });

    it("owner can reset circuit breaker", async function () {
      await expect(campaign.resetCircuitBreaker()).to.not.be.reverted;
    });
  });

  // ──────────────────────────────────────────────
  // Admin functions
  // ──────────────────────────────────────────────

  describe("Admin", function () {
    it("owner can extend deadline", async function () {
      const newDeadline = deadline + 30 * 86400;
      await campaign.extendDeadline(newDeadline);
      expect(await campaign.deadline()).to.equal(newDeadline);
    });

    it("reverts deadline extension that is not later", async function () {
      await expect(campaign.extendDeadline(deadline - 1)).to.be.revertedWith(
        "Must be later"
      );
    });

    it("non-owner cannot pause", async function () {
      await expect(campaign.connect(other).pause()).to.be.reverted;
    });
  });
});
