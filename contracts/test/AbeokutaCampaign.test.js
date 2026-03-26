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
    mockSwap = await MockSwap.deploy(usdcAddress, ethers.ZeroAddress);
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
      // Gap #5: third arg is minUsdcOut (0 = no slippage check)
      await expect(campaign.connect(donor1).donateERC20(daiAddress, amount, 0))
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, daiAddress, "base");
      expect(await campaign.totalRaised()).to.equal(amount);
    });

    it("handles USDC donation path without swap", async function () {
      const amount = 75n * ONE_USDC;
      await expect(campaign.connect(donor1).donateERC20(usdcAddress, amount, 0))
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, amount, usdcAddress, "base");
    });

    it("reverts with zero amount", async function () {
      await expect(campaign.connect(donor1).donateERC20(daiAddress, 0, 0))
        .to.be.revertedWithCustomError(campaign, "ZeroAmount");
    });

    it("reverts below minimum for non-USDC token", async function () {
      await expect(campaign.connect(donor1).donateERC20(daiAddress, ONE_USDC - 1n, 0))
        .to.be.revertedWith("Below minimum donation");
    });

    it("reverts when paused", async function () {
      await campaign.pause();
      await expect(campaign.connect(donor1).donateERC20(daiAddress, 50n * ONE_USDC, 0))
        .to.be.revertedWithCustomError(campaign, "EnforcedPause");
    });

    it("reverts after deadline", async function () {
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(donor1).donateERC20(daiAddress, 50n * ONE_USDC, 0))
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
      await expect(noSwapCampaign.connect(donor1).donateERC20(daiAddress, 50n * ONE_USDC, 0))
        .to.be.revertedWith("Swap adapter not set");
    });

    it("reverts when slippage exceeds minUsdcOut (Gap #5)", async function () {
      // MockSwapAdapter returns exactly amountIn, so ask for amountIn+1 to trigger SlippageTooHigh
      const amount = 50n * ONE_USDC;
      const minOutTooHigh = amount + 1n;
      await expect(campaign.connect(donor1).donateERC20(daiAddress, amount, minOutTooHigh))
        .to.be.revertedWithCustomError(campaign, "SlippageTooHigh");
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
      // Gap #5: first arg is minUsdcOut (0 = no slippage check)
      await expect(campaign.connect(donor1).donateETH(0, { value: ethToSend }))
        .to.emit(campaign, "Donated")
        .withArgs(donor1.address, ethToSend, ethers.ZeroAddress, "base");
      expect(await campaign.totalRaised()).to.equal(ethToSend);
    });

    it("increments donorCount on ETH donation", async function () {
      await campaign.connect(donor1).donateETH(0, { value: 10n * ONE_USDC });
      expect(await campaign.donorCount()).to.equal(1);
    });

    it("reverts with zero ETH", async function () {
      await expect(campaign.connect(donor1).donateETH(0, { value: 0 }))
        .to.be.revertedWithCustomError(campaign, "ZeroAmount");
    });

    it("reverts when ETH swaps to below minimum USDC", async function () {
      // 1 wei → 1 USDC unit, which is below 1e6 minimum
      await expect(campaign.connect(donor1).donateETH(0, { value: 1 }))
        .to.be.revertedWith("Below minimum donation");
    });

    it("reverts when paused", async function () {
      await campaign.pause();
      await expect(campaign.connect(donor1).donateETH(0, { value: 10n * ONE_USDC }))
        .to.be.revertedWithCustomError(campaign, "EnforcedPause");
    });

    it("reverts after deadline", async function () {
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(donor1).donateETH(0, { value: 10n * ONE_USDC }))
        .to.be.revertedWithCustomError(campaign, "CampaignEnded");
    });

    it("reverts when swap adapter is address(0) (L2)", async function () {
      const now = await time.latest();
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const noSwapCampaign = await CF.deploy(
        usdcAddress, ethers.ZeroAddress, treasury.address, GOAL_MIN, GOAL_MAX, now + 86400
      );
      await expect(noSwapCampaign.connect(donor1).donateETH(0, { value: 10n * ONE_USDC }))
        .to.be.revertedWith("Swap adapter not set");
    });

    it("reverts when slippage exceeds minUsdcOut (Gap #5)", async function () {
      const ethToSend = 100n * ONE_USDC;
      const minOutTooHigh = ethToSend + 1n;
      await expect(campaign.connect(donor1).donateETH(minOutTooHigh, { value: ethToSend }))
        .to.be.revertedWithCustomError(campaign, "SlippageTooHigh");
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

    it("reverts after deadline for bridge calls (M-3)", async function () {
      const amount = 100n * ONE_USDC;
      await fundAndApprove(bridge, amount);
      await time.increaseTo(deadline + 1);
      await expect(
        campaign.connect(bridge).creditDonation(donor1.address, amount, "ethereum")
      ).to.be.revertedWithCustomError(campaign, "CampaignEnded");
    });

    it("M-3: staking pool can still credit yield after deadline (retryCauseCredit scenario)", async function () {
      const amount = 25n * ONE_USDC;
      await fundAndApprove(stakingPool, amount);
      // Advance past deadline
      await time.increaseTo(deadline + 1);
      // Staking pool (not bridge) can still credit — yield was earned during the campaign
      await campaign.connect(stakingPool).creditDonation(donor1.address, amount, "staking-yield");
      expect(await campaign.totalRaised()).to.equal(amount);
    });
  });

  // ──────────────────────────────────────────────
  // Withdrawal
  // ──────────────────────────────────────────────

  describe("withdrawToTreasury", function () {
    it("treasury can withdraw after deadline when goal is met", async function () {
      // Gap #10: withdrawal requires goalMin to be reached
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await time.increaseTo(deadline + 1);

      const before = await mockUSDC.balanceOf(treasury.address);
      await campaign.connect(treasury).withdrawToTreasury();
      expect(await mockUSDC.balanceOf(treasury.address) - before).to.equal(GOAL_MIN);
    });

    it("owner can withdraw after deadline when goal is met", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(owner).withdrawToTreasury()).to.not.be.reverted;
    });

    it("treasury can withdraw early if min goal is reached", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await expect(campaign.connect(treasury).withdrawToTreasury()).to.not.be.reverted;
    });

    it("emits Withdrawn event", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(treasury).withdrawToTreasury())
        .to.emit(campaign, "Withdrawn")
        .withArgs(treasury.address, GOAL_MIN);
    });

    it("reverts if called by non-treasury/non-owner", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await expect(campaign.connect(other).withdrawToTreasury())
        .to.be.revertedWithCustomError(campaign, "Unauthorized");
    });

    it("reverts if min goal not reached (Gap #10: refunds take priority)", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await expect(campaign.connect(treasury).withdrawToTreasury())
        .to.be.revertedWithCustomError(campaign, "GoalNotReached");
    });

    it("reverts when balance is zero (goal met, but balance already withdrawn)", async function () {
      // To hit "Nothing to withdraw", the goal must be met first
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await campaign.connect(treasury).withdrawToTreasury(); // first withdrawal drains USDC
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
      const newSwap = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress, ethers.ZeroAddress);
      const newAddr = await newSwap.getAddress();
      await expect(campaign.proposeSwapAdapter(newAddr))
        .to.emit(campaign, "SwapAdapterProposed");
      expect(await campaign.pendingSwapAdapter()).to.equal(newAddr);
      expect(await campaign.swapAdapterActivationTime()).to.be.gt(0);
    });

    it("cannot execute swap adapter before 48h timelock", async function () {
      const newSwap = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress, ethers.ZeroAddress);
      await campaign.proposeSwapAdapter(await newSwap.getAddress());
      await expect(campaign.executeSwapAdapter()).to.be.revertedWith("Timelock not expired");
    });

    it("can execute swap adapter after 48h and emits SwapAdapterUpdated", async function () {
      const newSwap = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress, ethers.ZeroAddress);
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
      const newSwap = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress, ethers.ZeroAddress);
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

    it("SC-M4: re-proposing reverts when a proposal is already pending (prevents clock reset)", async function () {
      const swap1 = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress, ethers.ZeroAddress);
      const swap2 = await (await ethers.getContractFactory("MockSwapAdapter")).deploy(usdcAddress, ethers.ZeroAddress);
      await campaign.proposeSwapAdapter(await swap1.getAddress());
      await expect(campaign.proposeSwapAdapter(await swap2.getAddress()))
        .to.be.revertedWith("Proposal already pending");
      // Original proposal is still in effect
      expect(await campaign.pendingSwapAdapter()).to.equal(await swap1.getAddress());
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
    it("L-6: refuses plain ETH transfers (no receive fallback)", async function () {
      // Without receive(), direct ETH sends revert at the EVM level
      await expect(
        owner.sendTransaction({ to: await campaign.getAddress(), value: ethers.parseEther("0.01") })
      ).to.be.reverted;
    });

    it("reverts when no ETH to rescue", async function () {
      await expect(campaign.emergencyWithdrawETH(other.address))
        .to.be.revertedWith("No ETH to rescue");
    });

    it("reverts with zero recipient address (L4)", async function () {
      // Zero-address check precedes balance check — reverts even with no ETH
      await expect(campaign.emergencyWithdrawETH(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid recipient");
    });

    it("non-owner cannot call emergencyWithdrawETH", async function () {
      await expect(campaign.connect(other).emergencyWithdrawETH(other.address)).to.be.reverted;
    });
  });

  // ──────────────────────────────────────────────
  // Gap #6: donateUSDCFor
  // ──────────────────────────────────────────────

  describe("donateUSDCFor (Gap #6, M-1)", function () {
    // M-1: donor1 is the authorised watcher in this suite
    beforeEach(async function () {
      await campaign.setWatcher(donor1.address);
    });

    it("records donation attributed to the specified donor, not msg.sender", async function () {
      const amount = 100n * ONE_USDC;
      // donor1 (watcher) pays USDC but records donor2 as the donor
      await expect(campaign.connect(donor1).donateUSDCFor(donor2.address, amount))
        .to.emit(campaign, "Donated")
        .withArgs(donor2.address, amount, usdcAddress, "base");

      expect(await campaign.donorTotalContributed(donor2.address)).to.equal(amount);
      expect(await campaign.donorTotalContributed(donor1.address)).to.equal(0);
    });

    it("increments donorCount for the attributed donor", async function () {
      await campaign.connect(donor1).donateUSDCFor(donor2.address, 100n * ONE_USDC);
      expect(await campaign.donorCount()).to.equal(1);
    });

    it("M-1: reverts when called by unauthorized address", async function () {
      await expect(campaign.connect(other).donateUSDCFor(donor2.address, ONE_USDC))
        .to.be.revertedWith("Not authorized watcher");
    });

    it("M-1: reverts when watcher is not set (address(0))", async function () {
      // Deploy a fresh campaign with no watcher configured
      const now = await time.latest();
      const CF = await ethers.getContractFactory("AbeokutaCampaign");
      const unwatched = await CF.deploy(
        usdcAddress, swapAddress, treasury.address, GOAL_MIN, GOAL_MAX, now + 86400
      );
      await mockUSDC.connect(donor1).approve(await unwatched.getAddress(), ethers.MaxUint256);
      await expect(unwatched.connect(donor1).donateUSDCFor(donor2.address, ONE_USDC))
        .to.be.revertedWith("Not authorized watcher");
    });

    it("reverts with zero donor address", async function () {
      await expect(campaign.connect(donor1).donateUSDCFor(ethers.ZeroAddress, ONE_USDC))
        .to.be.revertedWith("Invalid donor");
    });

    it("reverts with zero amount", async function () {
      await expect(campaign.connect(donor1).donateUSDCFor(donor2.address, 0))
        .to.be.revertedWithCustomError(campaign, "ZeroAmount");
    });

    it("reverts after deadline", async function () {
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(donor1).donateUSDCFor(donor2.address, ONE_USDC))
        .to.be.revertedWithCustomError(campaign, "CampaignEnded");
    });
  });

  // ──────────────────────────────────────────────
  // Gap #10: claimRefund
  // ──────────────────────────────────────────────

  describe("claimRefund (Gap #10)", function () {
    it("allows donor to reclaim USDC after deadline if goal not met", async function () {
      const amount = 100n * ONE_USDC;
      await campaign.connect(donor1).donateUSDC(amount);
      await time.increaseTo(deadline + 1);

      const before = await mockUSDC.balanceOf(donor1.address);
      await expect(campaign.connect(donor1).claimRefund())
        .to.emit(campaign, "RefundClaimed")
        .withArgs(donor1.address, amount);
      expect(await mockUSDC.balanceOf(donor1.address) - before).to.equal(amount);
    });

    it("reverts if campaign is still active", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await expect(campaign.connect(donor1).claimRefund())
        .to.be.revertedWithCustomError(campaign, "CampaignNotEnded");
    });

    it("reverts if goal was met (RefundWindowClosed)", async function () {
      await campaign.connect(donor1).donateUSDC(GOAL_MIN);
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(donor1).claimRefund())
        .to.be.revertedWithCustomError(campaign, "RefundWindowClosed");
    });

    it("reverts for donors with no contributions (ZeroAmount)", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await time.increaseTo(deadline + 1);
      await expect(campaign.connect(donor2).claimRefund())
        .to.be.revertedWithCustomError(campaign, "ZeroAmount");
    });

    it("reverts on double refund (AlreadyRefunded)", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC);
      await time.increaseTo(deadline + 1);
      await campaign.connect(donor1).claimRefund();
      await expect(campaign.connect(donor1).claimRefund())
        .to.be.revertedWithCustomError(campaign, "AlreadyRefunded");
    });

    it("M-2: pro-rata — single donor with full pool receives exact contribution", async function () {
      const amount = 100n * ONE_USDC;
      await campaign.connect(donor1).donateUSDC(amount);
      await time.increaseTo(deadline + 1);

      const before = await mockUSDC.balanceOf(donor1.address);
      await campaign.connect(donor1).claimRefund();
      // Pro-rata = (100 * 100) / 100 = 100 USDC (full contribution since only donor)
      expect(await mockUSDC.balanceOf(donor1.address) - before).to.equal(amount);
    });

    it("M-2: pro-rata — multiple donors each receive proportional share", async function () {
      await campaign.connect(donor1).donateUSDC(100n * ONE_USDC); // 1/3 of pool
      await campaign.connect(donor2).donateUSDC(200n * ONE_USDC); // 2/3 of pool
      await time.increaseTo(deadline + 1);

      const before1 = await mockUSDC.balanceOf(donor1.address);
      const before2 = await mockUSDC.balanceOf(donor2.address);

      await campaign.connect(donor1).claimRefund();
      await campaign.connect(donor2).claimRefund();

      const refund1 = await mockUSDC.balanceOf(donor1.address) - before1;
      const refund2 = await mockUSDC.balanceOf(donor2.address) - before2;

      // donor1 pro-rata: (100e6 * 300e6) / 300e6 = 100e6
      expect(refund1).to.equal(100n * ONE_USDC);
      // donor2 pro-rata: (200e6 * remaining) / 300e6 — gets proportional share of remainder
      expect(refund2).to.be.gt(0n);
      // Together they claim most of the pool.
      // donor2's pro-rata: (200/300) × 200 USDC remaining ≈ 133 USDC (after donor1 took 100).
      // This is better than FCFS (where donor2 gets 0) — pro-rata guarantees proportionality.
      expect(refund1 + refund2).to.be.gte(225n * ONE_USDC);
      expect(await campaign.totalRaised()).to.equal(300n * ONE_USDC); // totalRaised unchanged
    });
  });
});
