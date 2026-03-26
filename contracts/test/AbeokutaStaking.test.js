/**
 * AbeokutaStaking Tests
 * Full coverage: staking, unstaking, yield harvest/claim, split configuration, admin.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AbeokutaStaking", function () {
  let staking, campaign, mockUSDC, mockAavePool;
  let owner, staker1, staker2, platformWallet, other;

  const USDC_DECIMALS   = 6;
  const ONE_USDC        = 10n ** BigInt(USDC_DECIMALS);
  const GOAL_MIN        = 1_000n * ONE_USDC;
  const GOAL_MAX        = 2_500n * ONE_USDC;
  const DISTRIBUTABLE   = 9800n;
  const TOTAL_BASIS     = 10000n;

  // Captured in beforeEach for use in constructor tests
  let usdcAddress, aaveAddress, aTokenAddress, campaignAddress;

  beforeEach(async function () {
    [owner, staker1, staker2, platformWallet, other] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    usdcAddress = await mockUSDC.getAddress();

    const MockSwap = await ethers.getContractFactory("MockSwapAdapter");
    const mockSwap = await MockSwap.deploy(usdcAddress, ethers.ZeroAddress);
    await mockUSDC.mint(await mockSwap.getAddress(), 100_000n * ONE_USDC);

    const MockAave = await ethers.getContractFactory("MockAavePool");
    mockAavePool = await MockAave.deploy(usdcAddress);
    aaveAddress = await mockAavePool.getAddress();
    aTokenAddress = await mockAavePool.aToken();

    const now = await time.latest();
    const deadline = now + 60 * 86400;
    const Campaign = await ethers.getContractFactory("AbeokutaCampaign");
    campaign = await Campaign.deploy(
      usdcAddress, await mockSwap.getAddress(), owner.address, GOAL_MIN, GOAL_MAX, deadline
    );
    campaignAddress = await campaign.getAddress();

    const Staking = await ethers.getContractFactory("AbeokutaStaking");
    staking = await Staking.deploy(
      aaveAddress, usdcAddress, aTokenAddress, campaignAddress, platformWallet.address
    );
    const stakingAddress = await staking.getAddress();

    await campaign.setStakingPool(stakingAddress);

    await mockUSDC.mint(staker1.address, 10_000n * ONE_USDC);
    await mockUSDC.mint(staker2.address, 10_000n * ONE_USDC);
    await mockUSDC.connect(staker1).approve(stakingAddress, ethers.MaxUint256);
    await mockUSDC.connect(staker2).approve(stakingAddress, ethers.MaxUint256);
  });

  // ─── helpers ─────────────────────────────────────────────────────────────

  async function simulateYield(yieldAmt) {
    await mockUSDC.mint(aaveAddress, yieldAmt);
    await mockAavePool.simulateYield(await staking.getAddress(), yieldAmt);
  }

  // ─── Constructor ─────────────────────────────────────────────────────────

  describe("Constructor", function () {
    it("reverts with zero aavePool", async function () {
      const Staking = await ethers.getContractFactory("AbeokutaStaking");
      await expect(
        Staking.deploy(ethers.ZeroAddress, usdcAddress, aTokenAddress, campaignAddress, platformWallet.address)
      ).to.be.revertedWith("Invalid Aave pool");
    });

    it("reverts with zero usdc", async function () {
      const Staking = await ethers.getContractFactory("AbeokutaStaking");
      await expect(
        Staking.deploy(aaveAddress, ethers.ZeroAddress, aTokenAddress, campaignAddress, platformWallet.address)
      ).to.be.revertedWith("Invalid USDC");
    });

    it("reverts with zero aUsdc", async function () {
      const Staking = await ethers.getContractFactory("AbeokutaStaking");
      await expect(
        Staking.deploy(aaveAddress, usdcAddress, ethers.ZeroAddress, campaignAddress, platformWallet.address)
      ).to.be.revertedWith("Invalid aUSDC");
    });

    it("reverts with zero campaign", async function () {
      const Staking = await ethers.getContractFactory("AbeokutaStaking");
      await expect(
        Staking.deploy(aaveAddress, usdcAddress, aTokenAddress, ethers.ZeroAddress, platformWallet.address)
      ).to.be.revertedWith("Invalid campaign");
    });

    it("reverts with zero platform wallet", async function () {
      const Staking = await ethers.getContractFactory("AbeokutaStaking");
      await expect(
        Staking.deploy(aaveAddress, usdcAddress, aTokenAddress, campaignAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid platform wallet");
    });
  });

  // ─── Deployment ──────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("has correct constants", async function () {
      expect(await staking.PLATFORM_SHARE()).to.equal(200);
      expect(await staking.DISTRIBUTABLE_BPS()).to.equal(9800);
      expect(await staking.DEFAULT_CAUSE_SHARE()).to.equal(7900);
      expect(await staking.DEFAULT_STAKER_SHARE()).to.equal(1900);
    });

    it("returns default 79/19 split for a new staker", async function () {
      const [causeShare, stakerShare] = await staking.getStakerSplit(staker1.address);
      expect(causeShare).to.equal(7900);
      expect(stakerShare).to.equal(1900);
    });
  });

  // ─── stake ───────────────────────────────────────────────────────────────

  describe("stake", function () {
    it("deposits USDC into Aave and tracks principal", async function () {
      const amount = 500n * ONE_USDC;
      await expect(staking.connect(staker1).stake(amount))
        .to.emit(staking, "Staked")
        .withArgs(staker1.address, amount);
      expect(await staking.stakerPrincipal(staker1.address)).to.equal(amount);
      expect(await staking.totalPrincipal()).to.equal(amount);
    });

    it("second stake by same staker accumulates principal correctly", async function () {
      await staking.connect(staker1).stake(300n * ONE_USDC);
      await staking.connect(staker1).stake(200n * ONE_USDC);
      expect(await staking.stakerPrincipal(staker1.address)).to.equal(500n * ONE_USDC);
      expect(await staking.totalPrincipal()).to.equal(500n * ONE_USDC);
    });

    it("reverts on zero amount", async function () {
      await expect(staking.connect(staker1).stake(0))
        .to.be.revertedWith("Amount must be > 0");
    });

    it("reverts below 1 USDC minimum", async function () {
      await expect(staking.connect(staker1).stake(ONE_USDC - 1n))
        .to.be.revertedWith("Minimum stake is 1 USDC");
    });

    it("accepts exactly 1 USDC", async function () {
      await expect(staking.connect(staker1).stake(ONE_USDC))
        .to.emit(staking, "Staked")
        .withArgs(staker1.address, ONE_USDC);
    });

    it("reverts when paused", async function () {
      await staking.pause();
      await expect(staking.connect(staker1).stake(100n * ONE_USDC))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ─── unstake ─────────────────────────────────────────────────────────────

  describe("unstake", function () {
    it("returns USDC principal and emits Unstaked", async function () {
      const amount = 300n * ONE_USDC;
      await staking.connect(staker1).stake(amount);
      const before = await mockUSDC.balanceOf(staker1.address);
      await expect(staking.connect(staker1).unstake(amount))
        .to.emit(staking, "Unstaked")
        .withArgs(staker1.address, amount);
      expect(await mockUSDC.balanceOf(staker1.address) - before).to.equal(amount);
    });

    it("decrements stakerPrincipal and totalPrincipal", async function () {
      await staking.connect(staker1).stake(500n * ONE_USDC);
      await staking.connect(staker1).unstake(200n * ONE_USDC);
      expect(await staking.stakerPrincipal(staker1.address)).to.equal(300n * ONE_USDC);
      expect(await staking.totalPrincipal()).to.equal(300n * ONE_USDC);
    });

    it("reverts on zero amount", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.connect(staker1).unstake(0))
        .to.be.revertedWith("Amount must be > 0");
    });

    it("reverts when amount exceeds stake", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.connect(staker1).unstake(200n * ONE_USDC))
        .to.be.revertedWith("Insufficient stake");
    });

    it("reverts when paused", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await staking.pause();
      await expect(staking.connect(staker1).unstake(100n * ONE_USDC))
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ─── harvestAndDistribute ─────────────────────────────────────────────────

  describe("harvestAndDistribute", function () {
    it("pays 2% platform fee and accumulates the rest", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      const yieldAmt = 100n * ONE_USDC;
      await simulateYield(yieldAmt);

      const platformBefore = await mockUSDC.balanceOf(platformWallet.address);
      await staking.harvestAndDistribute();
      const platformAfter = await mockUSDC.balanceOf(platformWallet.address);

      const expectedPlatform = (yieldAmt * 200n) / TOTAL_BASIS;
      const expectedDistrib  = yieldAmt - expectedPlatform;

      expect(platformAfter - platformBefore).to.equal(expectedPlatform);

      const [stakerPortion, causePortion] = await staking.pendingYield(staker1.address);
      expect(stakerPortion + causePortion).to.equal(expectedDistrib);
    });

    it("emits YieldHarvested with correct amounts", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      const yieldAmt = 100n * ONE_USDC;
      await simulateYield(yieldAmt);

      const platformAmount = (yieldAmt * 200n) / TOTAL_BASIS;
      const distributable  = yieldAmt - platformAmount;

      await expect(staking.harvestAndDistribute())
        .to.emit(staking, "YieldHarvested")
        .withArgs(yieldAmt, platformAmount, distributable);
    });

    it("updates lastHarvestTimestamp", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await simulateYield(10n * ONE_USDC);
      const before = await time.latest();
      await staking.harvestAndDistribute();
      expect(await staking.lastHarvestTimestamp()).to.be.gte(before);
    });

    it("updates totalYieldGenerated", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      await staking.harvestAndDistribute();
      expect(await staking.totalYieldGenerated()).to.equal(50n * ONE_USDC);
    });

    it("accumulates totalYieldGenerated across multiple harvests", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      await staking.harvestAndDistribute();
      // SC-H2: advance past MIN_HARVEST_INTERVAL (1 hour) before second harvest
      await time.increase(3601);
      await simulateYield(50n * ONE_USDC);
      await staking.harvestAndDistribute();
      expect(await staking.totalYieldGenerated()).to.equal(100n * ONE_USDC);
    });

    it("SC-H2: silently returns if called again before MIN_HARVEST_INTERVAL", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      await staking.harvestAndDistribute();
      const tsAfterFirst = await staking.lastHarvestTimestamp();

      // Second harvest immediately — should no-op (rate limit)
      await simulateYield(10n * ONE_USDC);
      await staking.harvestAndDistribute(); // should return early
      expect(await staking.lastHarvestTimestamp()).to.equal(tsAfterFirst);
    });

    it("no-ops when no yield available", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.harvestAndDistribute()).to.not.be.reverted;
      expect(await staking.lastHarvestTimestamp()).to.equal(0); // never harvested
    });

    it("no-ops when totalPrincipal is zero (M2 — prevents orphaned USDC)", async function () {
      // Stake, simulate yield, then unstake everything
      await staking.connect(staker1).stake(500n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      await staking.connect(staker1).unstake(500n * ONE_USDC);
      expect(await staking.totalPrincipal()).to.equal(0);

      const platformBefore = await mockUSDC.balanceOf(platformWallet.address);
      // harvestAndDistribute should return early — no platform fee paid, no USDC moved
      await expect(staking.harvestAndDistribute()).to.not.be.reverted;
      expect(await staking.lastHarvestTimestamp()).to.equal(0);
      expect(await mockUSDC.balanceOf(platformWallet.address)).to.equal(platformBefore);
    });

    it("reverts when paused", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await simulateYield(10n * ONE_USDC);
      await staking.pause();
      await expect(staking.harvestAndDistribute())
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ─── claimYield with default split ───────────────────────────────────────

  describe("claimYield (default 79/19 split)", function () {
    it("transfers 19% to staker and credits 79% to campaign", async function () {
      const principal = 1_000n * ONE_USDC;
      await staking.connect(staker1).stake(principal);
      const yieldAmt = 100n * ONE_USDC;
      await simulateYield(yieldAmt);
      await staking.harvestAndDistribute();

      const distributable   = yieldAmt - (yieldAmt * 200n) / TOTAL_BASIS;
      const expectedStaker  = (distributable * 1900n) / DISTRIBUTABLE;
      const expectedCampaign = distributable - expectedStaker;

      const stakerBefore   = await mockUSDC.balanceOf(staker1.address);
      const campaignBefore = await mockUSDC.balanceOf(campaignAddress);

      await expect(staking.connect(staker1).claimYield())
        .to.emit(staking, "StakerYieldClaimed")
        .withArgs(staker1.address, expectedStaker, expectedCampaign);

      expect(await mockUSDC.balanceOf(staker1.address) - stakerBefore).to.equal(expectedStaker);
      expect(await mockUSDC.balanceOf(campaignAddress) - campaignBefore).to.equal(expectedCampaign);
    });

    it("no-ops when no yield pending", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.connect(staker1).claimYield()).to.not.be.reverted;
    });

    it("reverts when paused", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await simulateYield(10n * ONE_USDC);
      await staking.harvestAndDistribute();
      await staking.pause();
      await expect(staking.connect(staker1).claimYield())
        .to.be.revertedWithCustomError(staking, "EnforcedPause");
    });
  });

  // ─── setYieldSplit ────────────────────────────────────────────────────────

  describe("setYieldSplit", function () {
    it("emits YieldSplitSet and updates stored split", async function () {
      await expect(staking.connect(staker1).setYieldSplit(5000, 4800))
        .to.emit(staking, "YieldSplitSet")
        .withArgs(staker1.address, 5000, 4800);

      const [causeShare, stakerShare] = await staking.getStakerSplit(staker1.address);
      expect(causeShare).to.equal(5000);
      expect(stakerShare).to.equal(4800);
    });

    it("reverts if sum != 9800", async function () {
      await expect(staking.connect(staker1).setYieldSplit(5000, 5000))
        .to.be.revertedWith("causeShare + stakerShare must equal 9800");
    });

    it("allows extreme values: full cause (9800/0)", async function () {
      await staking.connect(staker1).setYieldSplit(9800, 0);
      const [causeShare, stakerShare] = await staking.getStakerSplit(staker1.address);
      expect(causeShare).to.equal(9800);
      expect(stakerShare).to.equal(0);
    });

    it("allows extreme values: full self (0/9800)", async function () {
      await staking.connect(staker1).setYieldSplit(0, 9800);
      const [causeShare, stakerShare] = await staking.getStakerSplit(staker1.address);
      expect(causeShare).to.equal(0);
      expect(stakerShare).to.equal(9800);
    });

    it("each staker has an independent split", async function () {
      await staking.connect(staker1).setYieldSplit(9800, 0);
      await staking.connect(staker2).setYieldSplit(0, 9800);

      const [c1] = await staking.getStakerSplit(staker1.address);
      const [, s2] = await staking.getStakerSplit(staker2.address);
      expect(c1).to.equal(9800);
      expect(s2).to.equal(9800);
    });

    it("applies new split to subsequent harvest yield", async function () {
      const principal = 1_000n * ONE_USDC;
      await staking.connect(staker1).stake(principal);
      await staking.connect(staker1).setYieldSplit(9000, 800);
      await simulateYield(200n * ONE_USDC);
      await staking.harvestAndDistribute();

      const distributable   = 200n * ONE_USDC - (200n * ONE_USDC * 200n) / TOTAL_BASIS;
      const expectedStaker  = (distributable * 800n) / DISTRIBUTABLE;
      const expectedCampaign = distributable - expectedStaker;

      const [stakerPortion, causePortion] = await staking.pendingYield(staker1.address);
      expect(stakerPortion).to.equal(expectedStaker);
      expect(causePortion).to.equal(expectedCampaign);
    });

    it("settles raw yield before applying the new split (no retroactive effect)", async function () {
      const principal = 1_000n * ONE_USDC;
      await staking.connect(staker1).stake(principal);

      await simulateYield(100n * ONE_USDC);
      await staking.harvestAndDistribute();

      // Change split — this calls _settleRaw internally
      await staking.connect(staker1).setYieldSplit(9800, 0);
      const rawAfter = await staking.pendingRawYield(staker1.address);
      expect(rawAfter).to.be.gt(0);

      // With split 9800/0, staker receives 0%
      const stakerBefore = await mockUSDC.balanceOf(staker1.address);
      await staking.connect(staker1).claimYield();
      expect(await mockUSDC.balanceOf(staker1.address) - stakerBefore).to.equal(0);
    });

    it("allows stakers to change split even when contract is paused", async function () {
      await staking.pause();
      await expect(staking.connect(staker1).setYieldSplit(5000, 4800))
        .to.emit(staking, "YieldSplitSet")
        .withArgs(staker1.address, 5000, 4800);
    });
  });

  // ─── claimYield campaign credit (try/catch) ──────────────────────────────

  describe("claimYield campaign credit (try/catch)", function () {
    it("SC-C1: escrows cause yield (not redirect to staker) when campaign creditDonation reverts", async function () {
      const principal = 1_000n * ONE_USDC;
      await staking.connect(staker1).stake(principal);
      const yieldAmt = 100n * ONE_USDC;
      await simulateYield(yieldAmt);
      await staking.harvestAndDistribute();

      const distributable  = yieldAmt - (yieldAmt * 200n) / TOTAL_BASIS;
      const expectedStaker = (distributable * 1900n) / DISTRIBUTABLE;
      const expectedCause  = distributable - expectedStaker;

      // Pause the campaign so creditDonation reverts with EnforcedPause.
      await campaign.pause();

      const stakerBefore   = await mockUSDC.balanceOf(staker1.address);
      const campaignBefore = await mockUSDC.balanceOf(campaignAddress);

      // SC-C1: emits CauseYieldEscrowed — NOT YieldCreditFailed
      await expect(staking.connect(staker1).claimYield())
        .to.emit(staking, "CauseYieldEscrowed")
        .withArgs(staker1.address, expectedCause);

      // Staker only receives their own stakerShare — cause is escrowed, not redirected
      expect(await mockUSDC.balanceOf(staker1.address) - stakerBefore).to.equal(expectedStaker);
      expect(await mockUSDC.balanceOf(campaignAddress)).to.equal(campaignBefore);
      expect(await staking.pendingCauseYield(staker1.address)).to.equal(expectedCause);
    });

    it("SC-C1: retryCauseCredit sends escrowed yield to campaign after it unpauses", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      await simulateYield(100n * ONE_USDC);
      await staking.harvestAndDistribute();
      await campaign.pause();
      await staking.connect(staker1).claimYield();

      const escrowed = await staking.pendingCauseYield(staker1.address);
      expect(escrowed).to.be.gt(0);

      await campaign.unpause();
      const campaignBefore = await mockUSDC.balanceOf(campaignAddress);

      await expect(staking.retryCauseCredit(staker1.address))
        .to.emit(staking, "CauseYieldRetried")
        .withArgs(staker1.address, escrowed);

      expect(await mockUSDC.balanceOf(campaignAddress) - campaignBefore).to.equal(escrowed);
      expect(await staking.pendingCauseYield(staker1.address)).to.equal(0);
    });

    it("SC-C1: rescueEscrowedCause releases funds to staker after 30 days", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      await simulateYield(100n * ONE_USDC);
      await staking.harvestAndDistribute();
      await campaign.pause();
      await staking.connect(staker1).claimYield();

      const escrowed = await staking.pendingCauseYield(staker1.address);
      expect(escrowed).to.be.gt(0);

      // Before 30 days — should revert
      await expect(staking.connect(staker1).rescueEscrowedCause())
        .to.be.revertedWith("Rescue window not yet open");

      // Advance 30 days + 1 second
      await time.increase(30 * 86400 + 1);

      const stakerBefore = await mockUSDC.balanceOf(staker1.address);
      await expect(staking.connect(staker1).rescueEscrowedCause())
        .to.emit(staking, "CauseYieldRescued")
        .withArgs(staker1.address, escrowed);
      expect(await mockUSDC.balanceOf(staker1.address) - stakerBefore).to.equal(escrowed);
      expect(await staking.pendingCauseYield(staker1.address)).to.equal(0);
    });

    it("successfully credits campaign when campaign is valid", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      await simulateYield(100n * ONE_USDC);
      await staking.harvestAndDistribute();

      const campaignBefore = await mockUSDC.balanceOf(campaignAddress);
      await staking.connect(staker1).claimYield();
      expect(await mockUSDC.balanceOf(campaignAddress) - campaignBefore).to.be.gt(0);
    });
  });

  // ─── pendingYield ─────────────────────────────────────────────────────────

  describe("pendingYield", function () {
    it("returns (0, 0) for address with no stake", async function () {
      const [stakerPortion, causePortion] = await staking.pendingYield(other.address);
      expect(stakerPortion).to.equal(0);
      expect(causePortion).to.equal(0);
    });

    it("reflects unsettled yield proportionally", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      const yieldAmt = 100n * ONE_USDC;
      await simulateYield(yieldAmt);
      await staking.harvestAndDistribute();

      const distributable = yieldAmt - (yieldAmt * 200n) / TOTAL_BASIS;
      const [stakerPortion, causePortion] = await staking.pendingYield(staker1.address);
      expect(stakerPortion + causePortion).to.equal(distributable);
    });

    it("returns zero after yield has been claimed", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      await simulateYield(100n * ONE_USDC);
      await staking.harvestAndDistribute();
      await staking.connect(staker1).claimYield();

      const [stakerPortion, causePortion] = await staking.pendingYield(staker1.address);
      expect(stakerPortion).to.equal(0);
      expect(causePortion).to.equal(0);
    });
  });

  // ─── getStakingStats ──────────────────────────────────────────────────────

  describe("getStakingStats", function () {
    it("returns correct principal", async function () {
      await staking.connect(staker1).stake(500n * ONE_USDC);
      const stats = await staking.getStakingStats();
      expect(stats._totalPrincipal).to.equal(500n * ONE_USDC);
    });

    it("shows unrealized yield before harvest", async function () {
      await staking.connect(staker1).stake(500n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);

      const stats = await staking.getStakingStats();
      expect(stats._unrealizedYield).to.equal(50n * ONE_USDC);
      expect(stats._currentAaveBalance).to.equal(550n * ONE_USDC);
    });

    it("unrealizedYield is zero after harvest", async function () {
      await staking.connect(staker1).stake(500n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      await staking.harvestAndDistribute();

      const stats = await staking.getStakingStats();
      expect(stats._unrealizedYield).to.equal(0);
    });
  });

  // ─── Two-staker proportional split ───────────────────────────────────────

  describe("Two stakers with different splits", function () {
    it("each staker claims their correct portion", async function () {
      await staking.connect(staker1).setYieldSplit(9000, 800);

      await staking.connect(staker1).stake(500n * ONE_USDC);
      await staking.connect(staker2).stake(500n * ONE_USDC);

      await simulateYield(200n * ONE_USDC);
      await staking.harvestAndDistribute();

      const distributable = 200n * ONE_USDC - (200n * ONE_USDC * 200n) / TOTAL_BASIS;
      const half = distributable / 2n;

      const s1Expected = (half * 800n)  / DISTRIBUTABLE;
      const s2Expected = (half * 1900n) / DISTRIBUTABLE;

      const [s1Portion] = await staking.pendingYield(staker1.address);
      const [s2Portion] = await staking.pendingYield(staker2.address);
      expect(s1Portion).to.equal(s1Expected);
      expect(s2Portion).to.equal(s2Expected);
    });

    it("larger stake receives proportionally more yield", async function () {
      await staking.connect(staker1).stake(750n * ONE_USDC);
      await staking.connect(staker2).stake(250n * ONE_USDC);

      await simulateYield(100n * ONE_USDC);
      await staking.harvestAndDistribute();

      const [s1Staker] = await staking.pendingYield(staker1.address);
      const [s2Staker] = await staking.pendingYield(staker2.address);

      // staker1 has 3x more principal than staker2
      expect(s1Staker).to.equal(s2Staker * 3n);
    });
  });

  // ─── Minimum stake enforcement ───────────────────────────────────────────

  describe("Minimum stake (1 USDC)", function () {
    it("reverts when staking less than 1 USDC", async function () {
      await expect(staking.connect(staker1).stake(ONE_USDC - 1n))
        .to.be.revertedWith("Minimum stake is 1 USDC");
    });

    it("accepts exactly 1 USDC", async function () {
      await expect(staking.connect(staker1).stake(ONE_USDC))
        .to.emit(staking, "Staked")
        .withArgs(staker1.address, ONE_USDC);
    });
  });

  // ─── Admin ───────────────────────────────────────────────────────────────

  describe("Admin", function () {
    it("owner can pause/unpause", async function () {
      await staking.pause();
      await expect(staking.connect(staker1).stake(100n * ONE_USDC)).to.be.reverted;
      await staking.unpause();
      await expect(staking.connect(staker1).stake(100n * ONE_USDC)).to.not.be.reverted;
    });

    it("non-owner cannot pause", async function () {
      await expect(staking.connect(other).pause()).to.be.reverted;
    });

    it("SC-H3: campaign contract change requires propose/execute timelock", async function () {
      // Propose
      const activation = (await time.latest()) + 48 * 3600;
      await expect(staking.proposeCampaignContract(other.address))
        .to.emit(staking, "CampaignContractProposed")
        .withArgs(other.address, activation + 1); // +1 for block time drift
      expect(await staking.pendingCampaignContract()).to.equal(other.address);

      // Execute before timelock — should revert
      await expect(staking.executeCampaignContract()).to.be.revertedWith("Timelock not expired");

      // Advance 48 hours
      await time.increase(48 * 3600 + 1);

      // Execute after timelock — should succeed
      await expect(staking.executeCampaignContract())
        .to.emit(staking, "CampaignContractUpdated")
        .withArgs(other.address);
      expect(await staking.campaignContract()).to.equal(other.address);
      expect(await staking.pendingCampaignContract()).to.equal(ethers.ZeroAddress);
    });

    it("SC-H3: proposeCampaignContract reverts with zero address", async function () {
      await expect(staking.proposeCampaignContract(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid campaign");
    });

    it("SC-H3: proposeCampaignContract reverts if proposal already pending", async function () {
      await staking.proposeCampaignContract(other.address);
      await expect(staking.proposeCampaignContract(other.address))
        .to.be.revertedWith("Proposal already pending");
    });

    it("SC-H3: cancelCampaignContractChange clears pending proposal", async function () {
      await staking.proposeCampaignContract(other.address);
      await expect(staking.cancelCampaignContractChange())
        .to.emit(staking, "CampaignContractChangeCancelled");
      expect(await staking.pendingCampaignContract()).to.equal(ethers.ZeroAddress);
    });

    it("owner can update platform wallet and emits PlatformWalletUpdated (SC-M1)", async function () {
      await expect(staking.setPlatformWallet(other.address))
        .to.emit(staking, "PlatformWalletUpdated")
        .withArgs(other.address);
      expect(await staking.platformWallet()).to.equal(other.address);
    });

    it("setPlatformWallet reverts with zero address", async function () {
      await expect(staking.setPlatformWallet(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid");
    });

    it("owner can revoke and restore Aave approval", async function () {
      await expect(staking.revokeAaveApproval()).to.not.be.reverted;
      await expect(staking.restoreAaveApproval()).to.not.be.reverted;
    });

    it("SC-H3: executeCampaignContract revokes old approval and grants new one", async function () {
      const stakingAddress = await staking.getAddress();
      // Old campaign has max approval from staking
      expect(await mockUSDC.allowance(stakingAddress, campaignAddress)).to.equal(ethers.MaxUint256);

      await staking.proposeCampaignContract(other.address);
      await time.increase(48 * 3600 + 1);
      await staking.executeCampaignContract();

      // Old campaign approval revoked
      expect(await mockUSDC.allowance(stakingAddress, campaignAddress)).to.equal(0);
      // New campaign approved
      expect(await mockUSDC.allowance(stakingAddress, other.address)).to.equal(ethers.MaxUint256);
    });

    it("non-owner cannot call admin functions", async function () {
      await expect(staking.connect(other).proposeCampaignContract(other.address)).to.be.reverted;
      await expect(staking.connect(other).setPlatformWallet(other.address)).to.be.reverted;
      await expect(staking.connect(other).revokeAaveApproval()).to.be.reverted;
    });
  });

  // ─── emergencyWithdraw (M3 / H-1) ────────────────────────────────────────

  describe("emergencyWithdraw", function () {
    it("owner can rescue stuck aUSDC tokens (M3)", async function () {
      const stakingAddress = await staking.getAddress();
      await staking.connect(staker1).stake(500n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      // aUSDC is in staking; owner rescues it
      const aTokenAddr = aTokenAddress;
      const balBefore = await (await ethers.getContractAt("MockUSDC", aTokenAddr)).balanceOf(stakingAddress);
      expect(balBefore).to.be.gt(0);

      await staking.emergencyWithdraw(aTokenAddr, owner.address);
      expect(await (await ethers.getContractAt("MockUSDC", aTokenAddr)).balanceOf(stakingAddress)).to.equal(0);
    });

    it("H-1: reverts when trying to rescue USDC (protects staker yield)", async function () {
      // Stake some USDC and harvest yield so there's USDC in the contract
      await staking.connect(staker1).stake(500n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      await staking.harvestAndDistribute();
      // There should be some USDC sitting in the contract (harvested yield)
      const stakingBal = await mockUSDC.balanceOf(await staking.getAddress());
      expect(stakingBal).to.be.gt(0);

      await expect(staking.emergencyWithdraw(usdcAddress, owner.address))
        .to.be.revertedWith("Cannot rescue USDC: use claim functions");
    });

    it("reverts with zero recipient (L4)", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.emergencyWithdraw(aTokenAddress, ethers.ZeroAddress))
        .to.be.revertedWith("Invalid recipient");
    });

    it("reverts when nothing to rescue", async function () {
      const MockToken = await ethers.getContractFactory("MockUSDC");
      const emptyToken = await MockToken.deploy();
      await expect(staking.emergencyWithdraw(await emptyToken.getAddress(), owner.address))
        .to.be.revertedWith("Nothing to rescue");
    });

    it("non-owner cannot call emergencyWithdraw", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.connect(other).emergencyWithdraw(aTokenAddress, other.address)).to.be.reverted;
    });
  });

  // ─── compound (Gap #8) ────────────────────────────────────────────────────

  describe("compound (Gap #8)", function () {
    it("re-stakes staker yield back into Aave and credits cause to campaign", async function () {
      const principal = 1_000n * ONE_USDC;
      await staking.connect(staker1).stake(principal);
      await simulateYield(100n * ONE_USDC);
      await staking.harvestAndDistribute();

      const totalBefore    = await staking.totalPrincipal();
      const stakBefore     = await staking.stakerPrincipal(staker1.address);
      const campaignBefore = await mockUSDC.balanceOf(await campaign.getAddress());

      await expect(staking.connect(staker1).compound())
        .to.emit(staking, "YieldCompounded");

      // Staker principal increased (their portion re-staked)
      expect(await staking.stakerPrincipal(staker1.address)).to.be.gt(stakBefore);
      expect(await staking.totalPrincipal()).to.be.gt(totalBefore);
      // Campaign received cause yield credit
      expect(await mockUSDC.balanceOf(await campaign.getAddress())).to.be.gt(campaignBefore);
    });

    it("H-4: compound succeeds only after harvestAndDistribute has deposited USDC", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      // Without harvest, yieldPerTokenStored = 0 → pendingRawYield = 0 → compound no-ops.
      // The H-4 balance check fires when pendingRawYield > 0 but USDC was not deposited.
      // After harvest, USDC lands in the contract and compound proceeds normally.
      await staking.harvestAndDistribute();
      const stakeBefore = await staking.stakerPrincipal(staker1.address);
      await staking.connect(staker1).compound();
      // Principal increased — confirms compound executed with sufficient USDC (H-4 passed)
      expect(await staking.stakerPrincipal(staker1.address)).to.be.gt(stakeBefore);
    });

    it("reverts after staking deadline (Gap #7)", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      await simulateYield(50n * ONE_USDC);
      await staking.harvestAndDistribute();

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await staking.setStakingDeadline(now + 1);
      await time.increase(2);

      await expect(staking.connect(staker1).compound())
        .to.be.revertedWith("Campaign ended: compounding closed");
    });

    it("no-op when pending yield is zero", async function () {
      await staking.connect(staker1).stake(1_000n * ONE_USDC);
      // No yield harvested — compound should not revert, just return
      await staking.connect(staker1).compound();
      expect(await staking.stakerPrincipal(staker1.address)).to.equal(1_000n * ONE_USDC);
    });
  });

  // ─── Staking caps (L-4) ──────────────────────────────────────────────────

  describe("Staking caps (L-4)", function () {
    it("reverts when stake exceeds per-address cap", async function () {
      const cap = 1_000n * ONE_USDC;
      await staking.setStakingCaps(cap, 10_000_000n * ONE_USDC);
      await staking.connect(staker1).stake(cap); // exactly at cap — ok
      await expect(staking.connect(staker1).stake(ONE_USDC))
        .to.be.revertedWith("Exceeds per-address cap");
    });

    it("reverts when stake exceeds global cap", async function () {
      const globalCap = 500n * ONE_USDC;
      await staking.setStakingCaps(10_000_000n * ONE_USDC, globalCap);
      await staking.connect(staker1).stake(globalCap); // exactly at cap
      await expect(staking.connect(staker2).stake(ONE_USDC))
        .to.be.revertedWith("Exceeds global stake cap");
    });

    it("owner can update caps and emits StakingCapsUpdated", async function () {
      await expect(staking.setStakingCaps(50_000n * ONE_USDC, 500_000n * ONE_USDC))
        .to.emit(staking, "StakingCapsUpdated")
        .withArgs(50_000n * ONE_USDC, 500_000n * ONE_USDC);
      expect(await staking.maxStakePerAddress()).to.equal(50_000n * ONE_USDC);
      expect(await staking.maxGlobalStake()).to.equal(500_000n * ONE_USDC);
    });

    it("setStakingCaps reverts when cap is zero", async function () {
      await expect(staking.setStakingCaps(0, 100_000n * ONE_USDC))
        .to.be.revertedWith("Caps must be > 0");
    });

    it("non-owner cannot update caps", async function () {
      await expect(staking.connect(other).setStakingCaps(1n, 1n)).to.be.reverted;
    });
  });
});
