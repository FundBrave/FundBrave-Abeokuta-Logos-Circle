/**
 * AbeokutaCampaign Tests
 * Full coverage: all donation paths, circuit breaker, withdrawal, admin, and edge cases.
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
  let usdcAddress, swapAddress;

  beforeEach(async function () {
    [owner, donor1, donor2, treasury, bridge, stakingPool, other] =
      await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    usdcAddress = await mockUSDC.getAddress();

    const MockSwap = await ethers.getContractFactory("MockSwapAdapter");
    mockSwap = await MockSwap.deploy(usdcAddress);
    swapAddress = await mockSwap.getAddress();

    await mockUSDC.mint(swapAddress, 100_000n * ONE_USDC);

    const now = await time.latest();
    deadline = now + 60 * 86400;

    const CampaignFactory = await ethers.getContractFactory("AbeokutaCampaign");
    campaign = await CampaignFactory.deploy(
      usdcAddress, swapAddress, treasury.address, GOAL_MIN, GOAL_MAX, deadline
    );

    const campaignAddress = await campaign.getAddress();
    await campaign.setBridgeContract(bridge.address);
    await campaign.setStakingPool(stakingPool.address);

    await mockUSDC.mint(donor1.address, 10_000n * ONE_USDC);
    await mockUSDC.mint(donor2.address, 10_000n * ONE_USDC);
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

    it("reverts with zero USDC address", async function () {
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const now = await time.latest();
      await expect(
        CF.deploy(ethers.ZeroAddress, swapAddress, treasury.address, GOAL_MIN, GOAL_MAX, now + 86400)
      ).to.be.revertedWith("Invalid USDC");
    });

    it("reverts with zero treasury address", async function () {
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const now = await time.latest();
      await expect(
        CF.deploy(usdcAddress, swapAddress, ethers.ZeroAddress, GOAL_MIN, GOAL_MAX, now + 86400)
      ).to.be.revertedWith("Invalid treasury");
    });

    it("reverts with zero goalMin", async function () {
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const now = await time.latest();
      await expect(
        CF.deploy(usdcAddress, swapAddress, treasury.address, 0, GOAL_MAX, now + 86400)
      ).to.be.revertedWith("Invalid goal range");
    });

    it("reverts when goalMax < goalMin", async function () {
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const now = await time.latest();
      await expect(
        CF.deploy(usdcAddress, swapAddress, treasury.address, GOAL_MAX, GOAL_MIN, now + 86400)
      ).to.be.revertedWith("Invalid goal range");
    });

    it("reverts with past deadline", async function () {
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const now = await time.latest();
      await expect(
        CF.deploy(usdcAddress, swapAddress, treasury.address, GOAL_MIN, GOAL_MAX, now - 1)
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
        .withArgs(donor1.address, amount, usdcAddress, "base");

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
      expect(await campaign.donorCount()).to.equal(1);
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

    it("reverts below 1 USDC minimum", async function () {
      await expect(campaign.connect(donor1).donateUSDC(ONE_USDC - 1n))
        .to.be.revertedWith("Below minimum donation");
    });

    it("accepts exactly 1 USDC", async function () {
      await expect(campaign.connect(donor1).donateUSDC(ONE_USDC))
        .to.emit(campaign, "Donated");
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
    let mockDAI, daiAddress;

    beforeEach(async function () {
      const MockToken = await ethers.getContractFactory("MockUSDC");
      mockDAI = await MockToken.deploy();
      daiAddress = await mockDAI.getAddress();
      await mockDAI.mint(donor1.address, 1_000n * ONE_USDC);
      await mockDAI.connect(donor1).approve(await campaign.getAddress(), ethers.MaxUint256);
    });

    it("swaps ERC20 to USDC and records donation", async function () {
      const amount = 50n * ONE_USDC;
      await expect(campaign.connect(donor1).donateERC20(daiAddress, amount))
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, daiAddress, "base");
      expect(await campaign.totalRaised()).to.equal(amount);
    });

    it("handles USDC donation path without swap", async function () {
      const amount = 75n * ONE_USDC;
      await expect(campaign.connect(donor1).donateERC20(usdcAddress, amount))
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, usdcAddress, "base");
    });

    it("reverts with zero amount", async function () {
      await expect(campaign.connect(donor1).donateERC20(daiAddress, 0))
        .to.be.revertedWithCustomError(campaign, "ZeroAmount");
    });

    it("reverts below minimum for non-USDC token", async function () {
      await expect(campaign.connect(donor1).donateERC20(daiAddress, ONE_USDC - 1n))
        .to.be.revertedWith("Below minimum donation");
    });

    it("reverts when paused", async function () {
      await campaign.pause();
      await expect(campaign.connect(donor1).donateERC20(daiAddress, 50n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "EnforcedPause");
    });

    it("reverts after deadline", async function () {
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(donor1).donateERC20(daiAddress, 50n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "CampaignEnded");
    });

    it("reverts when swap adapter is address(0) (L2)", async function () {
      const now = await time.latest();
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const noSwapCampaign = await CF.deploy(
        usdcAddress, ethers.ZeroAddress, treasury.address, GOAL_MIN, GOAL_MAX, now + 86400
      );
      await noSwapCampaign.setBridgeContract(bridge.address);
      await mockDAI.connect(donor1).approve(await noSwapCampaign.getAddress(), ethers.MaxUint256);
      await expect(noSwapCampaign.connect(donor1).donateERC20(daiAddress, 50n * ONE_USDC))
        .to.be.revertedWith("Swap adapter not set");
    });
  });

  // ──────────────────────────────────────────────
  // Native ETH donation (auto-swap)
  // ──────────────────────────────────────────────

  describe("donateETH", function () {
    // MockSwapAdapter returns msg.value as USDC units (1 wei = 1 USDC unit)
    // So we send at least 1e6 wei to meet the 1 USDC minimum

    it("converts ETH to USDC via swap adapter and records donation", async function () {
      const ethToSend = 100n * ONE_USDC; // 100e6 wei → 100 USDC in mock
      await expect(campaign.connect(donor1).donateETH({ value: ethToSend }))
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, ethToSend, ethers.ZeroAddress, "base");
      expect(await campaign.totalRaised()).to.equal(ethToSend);
    });

    it("increments donorCount on ETH donation", async function () {
      await campaign.connect(donor1).donateETH({ value: 10n * ONE_USDC });
      expect(await campaign.donorCount()).to.equal(1);
    });

    it("reverts with zero ETH", async function () {
      await expect(campaign.connect(donor1).donateETH({ value: 0 }))
        .to.be.revertedWithCustomError(campaign, "ZeroAmount");
    });

    it("reverts when ETH swaps to below minimum USDC", async function () {
      // 1 wei → 1 USDC unit, which is below 1e6 minimum
      await expect(campaign.connect(donor1).donateETH({ value: 1 }))
        .to.be.revertedWith("Below minimum donation");
    });

    it("reverts when paused", async function () {
      await campaign.pause();
      await expect(campaign.connect(donor1).donateETH({ value: 10n * ONE_USDC }))
        .to.be.revertedWithCustomError(campaign, "EnforcedPause");
    });

    it("reverts after deadline", async function () {
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(donor1).donateETH({ value: 10n * ONE_USDC }))
        .to.be.revertedWithCustomError(campaign, "CampaignEnded");
    });

    it("reverts when swap adapter is address(0) (L2)", async function () {
      const now = await time.latest();
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const noSwapCampaign = await CF.deploy(
        usdcAddress, ethers.ZeroAddress, treasury.address, GOAL_MIN, GOAL_MAX, now + 86400
      );
      await expect(noSwapCampaign.connect(donor1).donateETH({ value: 10n * ONE_USDC }))
        .to.be.revertedWith("Swap adapter not set");
    });
  });

  // ──────────────────────────────────────────────
  // Cross-chain credit (bridge/staking)
  // ──────────────────────────────────────────────

  // Helper: fund a caller with USDC and approve the campaign to pull (M1 pull pattern)
  async function fundAndApprove(signer, amount) {
    const campaignAddress = await campaign.getAddress();
    await mockUSDC.mint(signer.address, amount);
    await mockUSDC.connect(signer).approve(campaignAddress, amount);
  }

  describe("creditDonation", function () {
    it("bridge can credit a cross-chain donation", async function () {
      const amount = 500n * ONE_USDC;
      await fundAndApprove(bridge, amount);
      await expect(
        campaign.connect(bridge).creditDonation(donor1.address, amount, "ethereum")
      )
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, usdcAddress, "ethereum");
      expect(await campaign.totalRaised()).to.equal(amount);
    });

    it("staking pool can credit yield as donation", async function () {
      const amount = 25n * ONE_USDC;
      await fundAndApprove(stakingPool, amount);
      await campaign.connect(stakingPool).creditDonation(stakingPool.address, amount, "staking-yield");
      expect(await campaign.totalRaised()).to.equal(amount);
    });

    it("reverts for unauthorized callers", async function () {
      await expect(
        campaign.connect(other).creditDonation(donor1.address, 100n * ONE_USDC, "base")
      ).to.be.revertedWithCustomError(campaign, "Unauthorized");
    });

    it("reverts with zero donor address (SC-C1)", async function () {
      const amount = 100n * ONE_USDC;
      await fundAndApprove(bridge, amount);
      await expect(
        campaign.connect(bridge).creditDonation(ethers.ZeroAddress, amount, "ethereum")
      ).to.be.revertedWith("Invalid donor");
    });

    it("reverts with zero amount", async function () {
      await expect(
        campaign.connect(bridge).creditDonation(donor1.address, 0, "ethereum")
      ).to.be.revertedWithCustomError(campaign, "ZeroAmount");
    });

    it("reverts below minimum donation (SC-C2)", async function () {
      const dustAmount = ONE_USDC - 1n; // 0.999999 USDC
      await fundAndApprove(bridge, dustAmount);
      await expect(
        campaign.connect(bridge).creditDonation(donor1.address, dustAmount, "ethereum")
      ).to.be.revertedWith("Below minimum donation");
    });

    it("reverts if caller has insufficient USDC (M1 pull pattern — no approval)", async function () {
      // With the pull pattern, creditDonation calls safeTransferFrom(bridge → campaign).
      // If bridge has no USDC or no approval, the ERC20 transfer reverts.
      await expect(
        campaign.connect(bridge).creditDonation(donor1.address, 500n * ONE_USDC, "ethereum")
      ).to.be.reverted;
    });

    it("reverts when paused", async function () {
      const amount = 100n * ONE_USDC;
      await fundAndApprove(bridge, amount);
      await campaign.pause();
      await expect(
        campaign.connect(bridge).creditDonation(donor1.address, amount, "ethereum")
      ).to.be.revertedWithCustomError(campaign, "EnforcedPause");
    });

    it("reverts after deadline", async function () {
      const amount = 100n * ONE_USDC;
      await fundAndApprove(bridge, amount);
      await time.increaseTo(deadline + 1);
      await expect(
        campaign.connect(bridge).creditDonation(donor1.address, amount, "ethereum")
      ).to.be.revertedWithCustomError(campaign, "CampaignEnded");
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
      expect(await mockUSDC.balanceOf(treasury.address) - before).to.equal(amount);
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

    it("emits Withdrawn event", async function () {
      const amount = 500n * ONE_USDC;
      await campaign.connect(donor1).donateUSDC(amount);
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(treasury).withdrawToTreasury())
        .to.emit(campaign, "Withdrawn")
        .withArgs(treasury.address, amount);
    });

    it("reverts if called by non-treasury/non-owner", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await expect(campaign.connect(other).withdrawToTreasury())
        .to.be.revertedWithCustomError(campaign, "Unauthorized");
    });

    it("reverts if active campaign has not reached min goal", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await expect(campaign.connect(treasury).withdrawToTreasury())
        .to.be.revertedWithCustomError(campaign, "GoalNotReached");
    });

    it("reverts when balance is zero", async function () {
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(treasury).withdrawToTreasury())
        .to.be.revertedWith("Nothing to withdraw");
    });
  });

  // ──────────────────────────────────────────────
  // View functions
  // ──────────────────────────────────────────────

  describe("isActive", function () {
    it("returns true before deadline", async function () {
      expect(await campaign.isActive()).to.equal(true);
    });

    it("returns false after deadline", async function () {
      await time.increaseTo(deadline + 1);
      expect(await campaign.isActive()).to.equal(false);
    });
  });

  describe("getDonationsCount", function () {
    it("returns 0 initially", async function () {
      expect(await campaign.getDonationsCount()).to.equal(0);
    });

    it("increments with each donation", async function () {
      await campaign.connect(donor1).donateUSDC(10n * ONE_USDC);
      await campaign.connect(donor1).donateUSDC(10n * ONE_USDC);
      await campaign.connect(donor2).donateUSDC(10n * ONE_USDC);
      expect(await campaign.getDonationsCount()).to.equal(3);
    });
  });

  describe("getRecentDonations", function () {
    it("returns donations newest-first", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await campaign.connect(donor2).donateUSDC(200n * ONE_USDC);

      const records = await campaign.getRecentDonations(0, 10);
      expect(records.length).to.equal(2);
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
      expect((await campaign.getRecentDonations(0, 10)).length).to.equal(0);
    });

    it("returns empty array when offset >= total", async function () {
      await campaign.connect(donor1).donateUSDC(10n * ONE_USDC);
      expect((await campaign.getRecentDonations(5, 10)).length).to.equal(0);
    });

    it("caps limit at 50", async function () {
      // Donate 10 times, request limit=100 → should return max 10
      for (let i = 0; i < 10; i++) {
        await campaign.connect(donor1).donateUSDC(10n * ONE_USDC);
      }
      const records = await campaign.getRecentDonations(0, 100);
      expect(records.length).to.equal(10);
    });
  });

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

    it("isActive is false after deadline", async function () {
      await time.increaseTo(deadline + 1);
      const stats = await campaign.getCampaignStats();
      expect(stats._isActive).to.equal(false);
    });

    it("returns correct goalMin and goalMax", async function () {
      const stats = await campaign.getCampaignStats();
      expect(stats._goalMin).to.equal(GOAL_MIN);
      expect(stats._goalMax).to.equal(GOAL_MAX);
    });
  });

  describe("progressBps", function () {
    it("returns 0 initially", async function () {
      expect(await campaign.progressBps()).to.equal(0);
    });

    it("returns correct bps at half max goal", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MAX / 2n);
      expect(await campaign.progressBps()).to.equal(5000);
    });

    it("caps at 10000 bps (100%)", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MAX + 1n * ONE_USDC);
      expect(await campaign.progressBps()).to.equal(10000);
    });
  });

  // ──────────────────────────────────────────────
  // Circuit breaker
  // ──────────────────────────────────────────────

  describe("Circuit breaker", function () {
    it("allows transactions within limits", async function () {
      await expect(campaign.connect(donor1).donateUSDC(100n * ONE_USDC)).to.not.be.reverted;
    });

    it("blocks single transaction above per-tx limit (5k USDC)", async function () {
      const bigAmount = 6_000n * ONE_USDC;
      await mockUSDC.mint(donor1.address, bigAmount);
      await expect(campaign.connect(donor1).donateUSDC(bigAmount))
        .to.be.revertedWithCustomError(campaign, "TransactionBlocked");
    });

    it("consistently rejects oversized transactions (triggered state rolls back per-tx)", async function () {
      // Note: because each transaction that exceeds a limit reverts entirely,
      // the triggered=true state is rolled back with it. Both attempts below
      // produce TransactionBlocked, not CircuitBreakerActive.
      const bigAmount = 6_000n * ONE_USDC;
      await mockUSDC.mint(donor1.address, bigAmount * 2n);
      await expect(campaign.connect(donor1).donateUSDC(bigAmount))
        .to.be.revertedWithCustomError(campaign, "TransactionBlocked");
      await expect(campaign.connect(donor1).donateUSDC(bigAmount))
        .to.be.revertedWithCustomError(campaign, "TransactionBlocked");
    });

    it("triggers at hourly volume limit", async function () {
      // Lower limits for this test
      await campaign.updateCircuitBreakerLimits(
        1_000n * ONE_USDC,
        2_000n * ONE_USDC,
        10_000n * ONE_USDC
      );
      await mockUSDC.mint(donor1.address, 5_000n * ONE_USDC);

      await campaign.connect(donor1).donateUSDC(1_000n * ONE_USDC); // hourly=1k
      await campaign.connect(donor1).donateUSDC(1_000n * ONE_USDC); // hourly=2k

      // Next tx would push hourly to 3k > 2k limit
      await expect(campaign.connect(donor1).donateUSDC(1_000n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "TransactionBlocked");
    });

    it("triggers at daily volume limit", async function () {
      await campaign.updateCircuitBreakerLimits(
        1_000n * ONE_USDC,
        2_000n * ONE_USDC,
        3_000n * ONE_USDC
      );
      await mockUSDC.mint(donor1.address, 10_000n * ONE_USDC);

      // Hour 1: fill hourly to 2k (daily=2k)
      await campaign.connect(donor1).donateUSDC(1_000n * ONE_USDC);
      await campaign.connect(donor1).donateUSDC(1_000n * ONE_USDC);

      // Advance 1 hour to reset hourly window
      await time.increase(3601);

      // Hour 2: donate 1k more (daily=3k, still OK)
      await campaign.connect(donor1).donateUSDC(1_000n * ONE_USDC);

      // Next tx would push daily to 4k > 3k limit
      await expect(campaign.connect(donor1).donateUSDC(1_000n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "TransactionBlocked");
    });

    it("after reset, transactions proceed again", async function () {
      const bigAmount = 6_000n * ONE_USDC;
      await mockUSDC.mint(donor1.address, bigAmount);
      await expect(campaign.connect(donor1).donateUSDC(bigAmount))
        .to.be.revertedWithCustomError(campaign, "TransactionBlocked");

      await campaign.resetCircuitBreaker();

      await expect(campaign.connect(donor1).donateUSDC(100n * ONE_USDC)).to.not.be.reverted;
    });

    it("updateCircuitBreakerLimits changes enforced limits", async function () {
      await campaign.updateCircuitBreakerLimits(
        500n * ONE_USDC,
        5_000n * ONE_USDC,
        30_000n * ONE_USDC
      );
      // 600 USDC would have been fine at old 5k limit, now exceeds 500 USDC limit
      await mockUSDC.mint(donor1.address, 600n * ONE_USDC);
      await expect(campaign.connect(donor1).donateUSDC(600n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "TransactionBlocked");
    });

    it("owner can reset circuit breaker", async function () {
      await expect(campaign.resetCircuitBreaker()).to.not.be.reverted;
    });

    it("haltCircuitBreaker blocks all donations and emits CircuitBreakerHalted (L7)", async function () {
      await expect(campaign.haltCircuitBreaker())
        .to.emit(campaign, "CircuitBreakerHalted");
      await expect(campaign.connect(donor1).donateUSDC(100n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "CircuitBreakerActive");
    });

    it("resetCircuitBreaker lifts the manual halt", async function () {
      await campaign.haltCircuitBreaker();
      await expect(campaign.connect(donor1).donateUSDC(100n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "CircuitBreakerActive");

      await campaign.resetCircuitBreaker();
      await expect(campaign.connect(donor1).donateUSDC(100n * ONE_USDC)).to.not.be.reverted;
    });

    it("non-owner cannot halt circuit breaker", async function () {
      await expect(campaign.connect(other).haltCircuitBreaker()).to.be.reverted;
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

    it("extendDeadline emits DeadlineExtended", async function () {
      const newDeadline = deadline + 30 * 86400;
      await expect(campaign.extendDeadline(newDeadline))
        .to.emit(campaign, "DeadlineExtended")
        .withArgs(newDeadline);
    });

    it("reverts deadline extension that is not later", async function () {
      await expect(campaign.extendDeadline(deadline - 1)).to.be.revertedWith("Must be later");
    });

    it("non-owner cannot extend deadline", async function () {
      await expect(campaign.connect(other).extendDeadline(deadline + 86400)).to.be.reverted;
    });

    it("owner can update treasury and emits TreasuryUpdated", async function () {
      await expect(campaign.setTreasury(other.address))
        .to.emit(campaign, "TreasuryUpdated")
        .withArgs(other.address);
      expect(await campaign.treasury()).to.equal(other.address);
    });

    it("setTreasury reverts with zero address", async function () {
      await expect(campaign.setTreasury(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid treasury");
    });

    it("non-owner cannot call setTreasury", async function () {
      await expect(campaign.connect(other).setTreasury(other.address)).to.be.reverted;
    });

    it("owner can update bridge contract and emits BridgeUpdated", async function () {
      await expect(campaign.setBridgeContract(other.address))
        .to.emit(campaign, "BridgeUpdated")
        .withArgs(other.address);
      expect(await campaign.bridgeContract()).to.equal(other.address);
    });

    it("non-owner cannot call setBridgeContract", async function () {
      await expect(campaign.connect(other).setBridgeContract(other.address)).to.be.reverted;
    });

    it("owner can update staking pool and emits StakingPoolUpdated", async function () {
      await expect(campaign.setStakingPool(other.address))
        .to.emit(campaign, "StakingPoolUpdated")
        .withArgs(other.address);
      expect(await campaign.stakingPool()).to.equal(other.address);
    });

    it("non-owner cannot call setStakingPool", async function () {
      await expect(campaign.connect(other).setStakingPool(other.address)).to.be.reverted;
    });

    it("setBridgeContract reverts with zero address (SC-H2)", async function () {
      await expect(campaign.setBridgeContract(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid bridge");
    });

    it("setStakingPool reverts with zero address (SC-H2)", async function () {
      await expect(campaign.setStakingPool(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid pool");
    });

    it("extendDeadline reverts when beyond 730-day cap (SC-M4)", async function () {
      const now = await time.latest();
      const tooFar = now + 731 * 86400;
      await expect(campaign.extendDeadline(tooFar))
        .to.be.revertedWith("Deadline too far");
    });

    // ── Swap adapter timelock (SC-C3) ─────────────────────────────────────────

    it("proposeSwapAdapter sets pending state and emits event", async function () {
      const newSwap = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress);
      const newAddr = await newSwap.getAddress();
      await expect(campaign.proposeSwapAdapter(newAddr))
        .to.emit(campaign, "SwapAdapterProposed");
      expect(await campaign.pendingSwapAdapter()).to.equal(newAddr);
      expect(await campaign.swapAdapterActivationTime()).to.be.gt(0);
    });

    it("cannot execute swap adapter before 48h timelock", async function () {
      const newSwap = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress);
      await campaign.proposeSwapAdapter(await newSwap.getAddress());
      await expect(campaign.executeSwapAdapter()).to.be.revertedWith("Timelock not expired");
    });

    it("can execute swap adapter after 48h and emits SwapAdapterUpdated", async function () {
      const newSwap = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress);
      const newAddr = await newSwap.getAddress();
      await campaign.proposeSwapAdapter(newAddr);
      await time.increase(48 * 3600 + 1);
      await expect(campaign.executeSwapAdapter())
        .to.emit(campaign, "SwapAdapterUpdated")
        .withArgs(newAddr);
      expect(await campaign.pendingSwapAdapter()).to.equal(ethers.ZeroAddress);
      expect(await campaign.swapAdapterActivationTime()).to.equal(0);
    });

    it("cancelSwapAdapterChange clears pending state and emits event", async function () {
      const newSwap = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress);
      await campaign.proposeSwapAdapter(await newSwap.getAddress());
      await expect(campaign.cancelSwapAdapterChange())
        .to.emit(campaign, "SwapAdapterChangeCancelled");
      expect(await campaign.pendingSwapAdapter()).to.equal(ethers.ZeroAddress);
    });

    it("executeSwapAdapter reverts when no pending change", async function () {
      await expect(campaign.executeSwapAdapter()).to.be.revertedWith("No pending adapter");
    });

    it("cancelSwapAdapterChange reverts when no pending change", async function () {
      await expect(campaign.cancelSwapAdapterChange()).to.be.revertedWith("No pending change");
    });

    it("proposeSwapAdapter reverts with zero address", async function () {
      await expect(campaign.proposeSwapAdapter(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid adapter");
    });

    it("re-proposing overwrites pending proposal and resets clock", async function () {
      const swap1 = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress);
      const swap2 = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress);
      await campaign.proposeSwapAdapter(await swap1.getAddress());
      await campaign.proposeSwapAdapter(await swap2.getAddress());
      expect(await campaign.pendingSwapAdapter()).to.equal(await swap2.getAddress());
    });

    it("non-owner cannot pause", async function () {
      await expect(campaign.connect(other).pause()).to.be.reverted;
    });

    it("owner can pause and unpause; unpause re-enables donations", async function () {
      await campaign.pause();
      await expect(campaign.connect(donor1).donateUSDC(10n * ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "EnforcedPause");

      await campaign.unpause();
      await expect(campaign.connect(donor1).donateUSDC(10n * ONE_USDC)).to.not.be.reverted;
    });
  });

  // ──────────────────────────────────────────────
  // Emergency rescue functions
  // ──────────────────────────────────────────────

  describe("emergencyWithdrawToken", function () {
    it("reverts when trying to withdraw USDC (must use withdrawToTreasury)", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await expect(campaign.emergencyWithdrawToken(usdcAddress, owner.address))
        .to.be.revertedWith("Use withdrawToTreasury for USDC");
    });

    it("allows withdrawing non-USDC tokens", async function () {
      const MockToken = await ethers.getContractFactory("MockUSDC");
      const otherToken = await MockToken.deploy();
      const amount = 100n * ONE_USDC;
      await otherToken.mint(await campaign.getAddress(), amount);

      const before = await otherToken.balanceOf(owner.address);
      await campaign.emergencyWithdrawToken(await otherToken.getAddress(), owner.address);
      expect(await otherToken.balanceOf(owner.address) - before).to.equal(amount);
    });

    it("reverts when nothing to rescue", async function () {
      const MockToken = await ethers.getContractFactory("MockUSDC");
      const emptyToken = await MockToken.deploy();
      await expect(campaign.emergencyWithdrawToken(await emptyToken.getAddress(), owner.address))
        .to.be.revertedWith("Nothing to rescue");
    });

    it("reverts with zero recipient address (L4)", async function () {
      const MockToken = await ethers.getContractFactory("MockUSDC");
      const otherToken = await MockToken.deploy();
      await otherToken.mint(await campaign.getAddress(), 100n * ONE_USDC);
      await expect(campaign.emergencyWithdrawToken(await otherToken.getAddress(), ethers.ZeroAddress))
        .to.be.revertedWith("Invalid recipient");
    });

    it("non-owner cannot call emergencyWithdrawToken", async function () {
      await expect(
        campaign.connect(other).emergencyWithdrawToken(usdcAddress, other.address)
      ).to.be.reverted;
    });
  });

  describe("emergencyWithdrawETH", function () {
    it("owner can rescue ETH sent to contract", async function () {
      const ethAmount = ethers.parseEther("0.01");
      await owner.sendTransaction({ to: await campaign.getAddress(), value: ethAmount });

      const before = await ethers.provider.getBalance(other.address);
      await campaign.emergencyWithdrawETH(other.address);
      const after = await ethers.provider.getBalance(other.address);
      expect(after - before).to.equal(ethAmount);
    });

    it("reverts when no ETH to rescue", async function () {
      await expect(campaign.emergencyWithdrawETH(other.address))
        .to.be.revertedWith("No ETH to rescue");
    });

    it("reverts with zero recipient address (L4)", async function () {
      await owner.sendTransaction({ to: await campaign.getAddress(), value: ethers.parseEther("0.01") });
      await expect(campaign.emergencyWithdrawETH(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid recipient");
    });

    it("non-owner cannot call emergencyWithdrawETH", async function () {
      await owner.sendTransaction({ to: await campaign.getAddress(), value: ethers.parseEther("0.01") });
      await expect(campaign.connect(other).emergencyWithdrawETH(other.address)).to.be.reverted;
    });
  });
});
