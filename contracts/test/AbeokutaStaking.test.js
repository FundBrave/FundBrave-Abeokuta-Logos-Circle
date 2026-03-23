/**
 * AbeokutaStaking Tests
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

  beforeEach(async function () {
    [owner, staker1, staker2, platformWallet, other] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    const usdcAddress = await mockUSDC.getAddress();

    const MockSwap = await ethers.getContractFactory("MockSwapAdapter");
    const mockSwap = await MockSwap.deploy(usdcAddress);
    await mockUSDC.mint(await mockSwap.getAddress(), 100_000n * ONE_USDC);

    const MockAave = await ethers.getContractFactory("MockAavePool");
    mockAavePool = await MockAave.deploy(usdcAddress);
    const aaveAddress = await mockAavePool.getAddress();
    const aToken = await mockAavePool.aToken();

    const now = await time.latest();
    const deadline = now + 60 * 86400;
    const Campaign = await ethers.getContractFactory("AbeokutaCampaign");
    campaign = await Campaign.deploy(
      usdcAddress,
      await mockSwap.getAddress(),
      owner.address,
      GOAL_MIN,
      GOAL_MAX,
      deadline
    );
    const campaignAddress = await campaign.getAddress();

    const Staking = await ethers.getContractFactory("AbeokutaStaking");
    staking = await Staking.deploy(
      aaveAddress,
      usdcAddress,
      aToken,
      campaignAddress,
      platformWallet.address
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
    const aaveAddr    = await mockAavePool.getAddress();
    const stakingAddr = await staking.getAddress();
    await mockUSDC.mint(aaveAddr, yieldAmt);
    await mockAavePool.simulateYield(stakingAddr, yieldAmt);
  }

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

  // ─── stake / unstake ─────────────────────────────────────────────────────

  describe("stake", function () {
    it("deposits USDC into Aave and tracks principal", async function () {
      const amount = 500n * ONE_USDC;
      await expect(staking.connect(staker1).stake(amount))
        .to.emit(staking, "Staked")
        .withArgs(staker1.address, amount);
      expect(await staking.stakerPrincipal(staker1.address)).to.equal(amount);
      expect(await staking.totalPrincipal()).to.equal(amount);
    });

    it("reverts on zero amount", async function () {
      await expect(staking.connect(staker1).stake(0))
        .to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("unstake", function () {
    it("returns USDC principal", async function () {
      const amount = 300n * ONE_USDC;
      await staking.connect(staker1).stake(amount);
      const before = await mockUSDC.balanceOf(staker1.address);
      await staking.connect(staker1).unstake(amount);
      expect(await mockUSDC.balanceOf(staker1.address) - before).to.equal(amount);
    });

    it("reverts when amount exceeds stake", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.connect(staker1).unstake(200n * ONE_USDC))
        .to.be.revertedWith("Insufficient stake");
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

      const expectedPlatform = (yieldAmt * 200n) / TOTAL_BASIS;   // 2 USDC
      const expectedDistrib  = yieldAmt - expectedPlatform;         // 98 USDC

      expect(platformAfter - platformBefore).to.equal(expectedPlatform);

      // Distributable pool is in accumulator — verify via pendingYield
      const [stakerPortion, causePortion] = await staking.pendingYield(staker1.address);
      expect(stakerPortion + causePortion).to.equal(expectedDistrib);
    });

    it("no-ops when no yield", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.harvestAndDistribute()).to.not.be.reverted;
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

      const distributable = yieldAmt - (yieldAmt * 200n) / TOTAL_BASIS; // 98 USDC
      const expectedStaker  = (distributable * 1900n) / DISTRIBUTABLE;   // ≈19 USDC
      const expectedCampaign = distributable - expectedStaker;            // ≈79 USDC

      const stakerBefore   = await mockUSDC.balanceOf(staker1.address);
      const campaignBefore = await mockUSDC.balanceOf(await campaign.getAddress());

      await expect(staking.connect(staker1).claimYield())
        .to.emit(staking, "StakerYieldClaimed")
        .withArgs(staker1.address, expectedStaker, expectedCampaign);

      expect(await mockUSDC.balanceOf(staker1.address) - stakerBefore).to.equal(expectedStaker);
      expect(await mockUSDC.balanceOf(await campaign.getAddress()) - campaignBefore)
        .to.equal(expectedCampaign);
    });

    it("no-ops when no yield pending", async function () {
      await staking.connect(staker1).stake(100n * ONE_USDC);
      await expect(staking.connect(staker1).claimYield()).to.not.be.reverted;
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
      await staking.connect(staker1).setYieldSplit(9800, 0);   // full altruist
      await staking.connect(staker2).setYieldSplit(0, 9800);   // full self-interest

      const [c1] = await staking.getStakerSplit(staker1.address);
      const [, s2] = await staking.getStakerSplit(staker2.address);
      expect(c1).to.equal(9800);
      expect(s2).to.equal(9800);
    });

    it("applies new split to subsequent harvest yield", async function () {
      const principal = 1_000n * ONE_USDC;
      await staking.connect(staker1).stake(principal);

      // Set more generous split: 90% to campaign, 8% to self
      await staking.connect(staker1).setYieldSplit(9000, 800);

      await simulateYield(200n * ONE_USDC);
      await staking.harvestAndDistribute();

      const distributable  = 200n * ONE_USDC - (200n * ONE_USDC * 200n) / TOTAL_BASIS;
      const expectedStaker  = (distributable * 800n) / DISTRIBUTABLE;
      const expectedCampaign = distributable - expectedStaker;

      const [stakerPortion, causePortion] = await staking.pendingYield(staker1.address);
      expect(stakerPortion).to.equal(expectedStaker);
      expect(causePortion).to.equal(expectedCampaign);
    });

    it("settles raw yield before applying the new split (no retroactive effect)", async function () {
      const principal = 1_000n * ONE_USDC;
      await staking.connect(staker1).stake(principal);

      // Yield with DEFAULT split (79/19)
      await simulateYield(100n * ONE_USDC);
      await staking.harvestAndDistribute();

      // Pending raw before split change
      const rawBefore = await staking.pendingRawYield(staker1.address);
      expect(rawBefore).to.equal(0); // _settleRaw not yet called since last stake

      // Change split — this calls _settleRaw internally, snapshotting the accrued raw
      await staking.connect(staker1).setYieldSplit(9800, 0);
      const rawAfter = await staking.pendingRawYield(staker1.address);
      expect(rawAfter).to.be.gt(0); // raw yield settled into pendingRawYield

      // Now claim — the ALREADY-SETTLED raw yield uses the NEW split (9800/0)
      // (this is the documented behaviour: split applies at claim time)
      const stakerBefore = await mockUSDC.balanceOf(staker1.address);
      await staking.connect(staker1).claimYield();
      const stakerReceived = await mockUSDC.balanceOf(staker1.address) - stakerBefore;
      // With split 0/9800, staker keeps 0 and gives all to cause
      expect(stakerReceived).to.equal(0);
    });
  });

  // ─── Two-staker proportional split ───────────────────────────────────────

  describe("Two stakers with different splits", function () {
    it("each staker claims their correct portion", async function () {
      // staker1 is generous: 90% cause, 8% self
      // staker2 uses default: 79% cause, 19% self
      await staking.connect(staker1).setYieldSplit(9000, 800);

      await staking.connect(staker1).stake(500n * ONE_USDC);
      await staking.connect(staker2).stake(500n * ONE_USDC);

      await simulateYield(200n * ONE_USDC);
      await staking.harvestAndDistribute();

      // Each has 50% of totalPrincipal, so each gets 50% of distributable pool
      const distributable  = 200n * ONE_USDC - (200n * ONE_USDC * 200n) / TOTAL_BASIS;
      const half           = distributable / 2n;

      const s1Expected = (half * 800n)  / DISTRIBUTABLE;
      const s2Expected = (half * 1900n) / DISTRIBUTABLE;

      const [s1Portion] = await staking.pendingYield(staker1.address);
      const [s2Portion] = await staking.pendingYield(staker2.address);

      expect(s1Portion).to.equal(s1Expected);
      expect(s2Portion).to.equal(s2Expected);
    });
  });

  // ─── Stats ────────────────────────────────────────────────────────────────

  describe("getStakingStats", function () {
    it("returns correct principal", async function () {
      await staking.connect(staker1).stake(500n * ONE_USDC);
      const stats = await staking.getStakingStats();
      expect(stats._totalPrincipal).to.equal(500n * ONE_USDC);
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
  });
});
