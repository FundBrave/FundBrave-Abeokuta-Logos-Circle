/**
 * AbeokutaBridgeReceiver Tests
 * Full coverage: cross-chain donation handling, all chain mappings, access control,
 * USDC flow verification, admin functions, and emergency withdrawal.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AbeokutaBridgeReceiver", function () {
  let receiver, campaign, mockUSDC, mockSwap;
  let owner, bridge, donor1, donor2, treasury, other;

  const USDC_DECIMALS = 6;
  const ONE_USDC      = 10n ** BigInt(USDC_DECIMALS);
  const GOAL_MIN      = 1_000n * ONE_USDC;
  const GOAL_MAX      = 2_500n * ONE_USDC;

  let usdcAddress, campaignAddress, receiverAddress;

  beforeEach(async function () {
    [owner, bridge, donor1, donor2, treasury, other] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    usdcAddress = await mockUSDC.getAddress();

    const MockSwap = await ethers.getContractFactory("MockSwapAdapter");
    mockSwap = await MockSwap.deploy(usdcAddress);
    await mockUSDC.mint(await mockSwap.getAddress(), 100_000n * ONE_USDC);

    const now = await time.latest();
    const deadline = now + 60 * 86400;
    const Campaign = await ethers.getContractFactory("AbeokutaCampaign");
    campaign = await Campaign.deploy(
      usdcAddress, await mockSwap.getAddress(), treasury.address, GOAL_MIN, GOAL_MAX, deadline
    );
    campaignAddress = await campaign.getAddress();

    const Receiver = await ethers.getContractFactory("AbeokutaBridgeReceiver");
    receiver = await Receiver.deploy(usdcAddress, campaignAddress, bridge.address);
    receiverAddress = await receiver.getAddress();

    await campaign.setBridgeContract(receiverAddress);

    // Pre-fund receiver with USDC (simulates bridge depositing before calling handler)
    await mockUSDC.mint(receiverAddress, 50_000n * ONE_USDC);
  });

  // Helper for making a cross-chain donation call
  function makeDonation(donor, amount, eid, hashSeed) {
    const messageHash = ethers.keccak256(ethers.toUtf8Bytes(hashSeed || "test"));
    return receiver.connect(bridge).handleCrossChainDonation(donor, 0, amount, messageHash, eid);
  }

  // ─── Deployment ──────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets correct initial state", async function () {
      expect(await receiver.usdc()).to.equal(usdcAddress);
      expect(await receiver.campaign()).to.equal(campaignAddress);
      expect(await receiver.bridge()).to.equal(bridge.address);
    });

    it("has default EID chain name mappings — mainnet", async function () {
      expect(await receiver.eidToChainName(30101)).to.equal("ethereum");
      expect(await receiver.eidToChainName(30109)).to.equal("polygon");
      expect(await receiver.eidToChainName(30110)).to.equal("arbitrum");
      expect(await receiver.eidToChainName(30111)).to.equal("optimism");
      expect(await receiver.eidToChainName(30184)).to.equal("base");
      expect(await receiver.eidToChainName(30294)).to.equal("rootstock");
    });

    it("has default EID chain name mappings — testnet", async function () {
      expect(await receiver.eidToChainName(40245)).to.equal("base-sepolia");
      expect(await receiver.eidToChainName(40161)).to.equal("ethereum-sepolia");
      expect(await receiver.eidToChainName(40109)).to.equal("polygon-amoy");
    });

    it("reverts with zero USDC address", async function () {
      const Receiver = await ethers.getContractFactory("AbeokutaBridgeReceiver");
      await expect(
        Receiver.deploy(ethers.ZeroAddress, campaignAddress, bridge.address)
      ).to.be.revertedWith("Invalid USDC");
    });

    it("reverts with zero campaign address", async function () {
      const Receiver = await ethers.getContractFactory("AbeokutaBridgeReceiver");
      await expect(
        Receiver.deploy(usdcAddress, ethers.ZeroAddress, bridge.address)
      ).to.be.revertedWith("Invalid campaign");
    });

    it("allows zero bridge address at deploy (can be set later)", async function () {
      const Receiver = await ethers.getContractFactory("AbeokutaBridgeReceiver");
      await expect(
        Receiver.deploy(usdcAddress, campaignAddress, ethers.ZeroAddress)
      ).to.not.be.reverted;
    });
  });

  // ─── handleCrossChainDonation ─────────────────────────────────────────────

  describe("handleCrossChainDonation", function () {
    it("processes a cross-chain donation from Ethereum (30101)", async function () {
      const amount = 100n * ONE_USDC;
      await expect(makeDonation(donor1.address, amount, 30101, "eth"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, amount, 30101, "ethereum");

      expect(await campaign.totalRaised()).to.equal(amount);
      expect(await campaign.donorTotalContributed(donor1.address)).to.equal(amount);
    });

    it("correctly identifies Polygon source chain (30109)", async function () {
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 30109, "poly"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 30109, "polygon");
    });

    it("correctly identifies Arbitrum source chain (30110)", async function () {
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 30110, "arb"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 30110, "arbitrum");
    });

    it("correctly identifies Optimism source chain (30111)", async function () {
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 30111, "op"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 30111, "optimism");
    });

    it("correctly identifies Base source chain (30184)", async function () {
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 30184, "base"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 30184, "base");
    });

    it("correctly identifies Base Sepolia testnet (40245)", async function () {
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 40245, "baseSep"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 40245, "base-sepolia");
    });

    it("correctly identifies Ethereum Sepolia testnet (40161)", async function () {
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 40161, "ethSep"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 40161, "ethereum-sepolia");
    });

    it("correctly identifies Polygon Amoy testnet (40109)", async function () {
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 40109, "polyAmoy"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 40109, "polygon-amoy");
    });

    it("uses 'unknown' for unmapped EID", async function () {
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 99999, "unknown"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 99999, "unknown");
    });

    it("USDC flows from receiver to campaign", async function () {
      const amount = 100n * ONE_USDC;
      const receiverBefore = await mockUSDC.balanceOf(receiverAddress);
      const campaignBefore = await mockUSDC.balanceOf(campaignAddress);

      await makeDonation(donor1.address, amount, 30101, "flow");

      expect(await mockUSDC.balanceOf(receiverAddress)).to.equal(receiverBefore - amount);
      expect(await mockUSDC.balanceOf(campaignAddress)).to.equal(campaignBefore + amount);
    });

    it("reverts with zero amount", async function () {
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("zero"));
      await expect(
        receiver.connect(bridge).handleCrossChainDonation(donor1.address, 0, 0, messageHash, 30101)
      ).to.be.revertedWithCustomError(receiver, "ZeroAmount");
    });

    it("reverts when called by non-bridge", async function () {
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("nonbridge"));
      await expect(
        receiver.connect(other).handleCrossChainDonation(donor1.address, 0, 100n * ONE_USDC, messageHash, 30101)
      ).to.be.revertedWithCustomError(receiver, "OnlyBridge");
    });

    it("reverts when paused", async function () {
      await receiver.pause();
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("paused"));
      await expect(
        receiver.connect(bridge).handleCrossChainDonation(donor1.address, 0, 100n * ONE_USDC, messageHash, 30101)
      ).to.be.revertedWithCustomError(receiver, "EnforcedPause");
    });

    it("accumulates multiple donations from the same donor", async function () {
      await makeDonation(donor1.address, 200n * ONE_USDC, 30101, "d1a");
      await makeDonation(donor1.address, 300n * ONE_USDC, 30110, "d1b");

      expect(await campaign.totalRaised()).to.equal(500n * ONE_USDC);
      expect(await campaign.donorTotalContributed(donor1.address)).to.equal(500n * ONE_USDC);
    });

    it("counts different donors correctly", async function () {
      await makeDonation(donor1.address, 100n * ONE_USDC, 30101, "dd1");
      await makeDonation(donor2.address, 100n * ONE_USDC, 30101, "dd2");
      expect(await campaign.donorCount()).to.equal(2);
    });
  });

  // ─── handleCrossChainStake ──────────────────────────────────────────────

  describe("handleCrossChainStake", function () {
    it("emits UnsupportedStakeReceived event", async function () {
      const amount = 500n * ONE_USDC;
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("stake1"));
      await expect(
        receiver.connect(bridge).handleCrossChainStake(donor1.address, 0, amount, messageHash, 30101)
      )
        .to.emit(receiver, "UnsupportedStakeReceived")
        .withArgs(donor1.address, amount, 30101);
    });

    it("does NOT forward USDC to campaign (funds stay in receiver)", async function () {
      const campaignBefore = await mockUSDC.balanceOf(campaignAddress);
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("stake2"));
      await receiver.connect(bridge).handleCrossChainStake(donor1.address, 0, 200n * ONE_USDC, messageHash, 30101);
      expect(await mockUSDC.balanceOf(campaignAddress)).to.equal(campaignBefore);
    });

    it("reverts when called by non-bridge", async function () {
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("stake3"));
      await expect(
        receiver.connect(other).handleCrossChainStake(donor1.address, 0, 100n * ONE_USDC, messageHash, 30101)
      ).to.be.revertedWithCustomError(receiver, "OnlyBridge");
    });

    it("reverts when paused (L6)", async function () {
      await receiver.pause();
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("stakepaused"));
      await expect(
        receiver.connect(bridge).handleCrossChainStake(donor1.address, 0, 100n * ONE_USDC, messageHash, 30101)
      ).to.be.revertedWithCustomError(receiver, "EnforcedPause");
    });
  });

  // ─── Admin functions ─────────────────────────────────────────────────────

  describe("Admin", function () {
    it("owner can update bridge address and emits BridgeUpdated", async function () {
      await expect(receiver.setBridge(other.address))
        .to.emit(receiver, "BridgeUpdated")
        .withArgs(other.address);
      expect(await receiver.bridge()).to.equal(other.address);
    });

    it("setBridge reverts with zero address", async function () {
      await expect(receiver.setBridge(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid bridge");
    });

    it("non-owner cannot set bridge", async function () {
      await expect(receiver.connect(other).setBridge(other.address)).to.be.reverted;
    });

    it("owner can update campaign and emits CampaignUpdated", async function () {
      await expect(receiver.setCampaign(other.address))
        .to.emit(receiver, "CampaignUpdated")
        .withArgs(other.address);
    });

    it("setCampaign reverts with zero address", async function () {
      await expect(receiver.setCampaign(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid");
    });

    it("non-owner cannot call setCampaign", async function () {
      await expect(receiver.connect(other).setCampaign(other.address)).to.be.reverted;
    });

    it("setCampaign revokes old approval and grants new one", async function () {
      const oldCampaignAddr = await campaign.getAddress();
      // Old campaign has max approval from receiver
      expect(await mockUSDC.allowance(receiverAddress, oldCampaignAddr)).to.equal(ethers.MaxUint256);

      await receiver.setCampaign(other.address);

      // Old campaign approval revoked, new one granted
      expect(await mockUSDC.allowance(receiverAddress, oldCampaignAddr)).to.equal(0);
      expect(await mockUSDC.allowance(receiverAddress, other.address)).to.equal(ethers.MaxUint256);
    });

    it("owner can set a custom EID chain name mapping", async function () {
      await receiver.setEidChainName(12345, "custom-chain");
      expect(await receiver.eidToChainName(12345)).to.equal("custom-chain");
    });

    it("custom EID is used in subsequent donations", async function () {
      await receiver.setEidChainName(55555, "my-chain");
      await expect(makeDonation(donor1.address, 50n * ONE_USDC, 55555, "custom"))
        .to.emit(receiver, "CrossChainDonationReceived")
        .withArgs(donor1.address, 50n * ONE_USDC, 55555, "my-chain");
    });

    it("setEidChainName reverts with empty string (SC-M2)", async function () {
      await expect(receiver.setEidChainName(12345, ""))
        .to.be.revertedWith("Empty chain name");
    });

    it("non-owner cannot call setEidChainName", async function () {
      await expect(receiver.connect(other).setEidChainName(99999, "test")).to.be.reverted;
    });

    it("owner can pause and unpause", async function () {
      await receiver.pause();
      const messageHash = ethers.keccak256(ethers.toUtf8Bytes("p1"));
      await expect(
        receiver.connect(bridge).handleCrossChainDonation(donor1.address, 0, 100n * ONE_USDC, messageHash, 30101)
      ).to.be.reverted;

      await receiver.unpause();
      const messageHash2 = ethers.keccak256(ethers.toUtf8Bytes("p2"));
      await expect(
        receiver.connect(bridge).handleCrossChainDonation(donor1.address, 0, 100n * ONE_USDC, messageHash2, 30101)
      ).to.not.be.reverted;
    });

    it("non-owner cannot pause", async function () {
      await expect(receiver.connect(other).pause()).to.be.reverted;
    });

    it("non-owner cannot unpause", async function () {
      await receiver.pause();
      await expect(receiver.connect(other).unpause()).to.be.reverted;
    });
  });

  // ─── Emergency withdrawal ─────────────────────────────────────────────────

  describe("emergencyWithdraw", function () {
    it("owner can rescue stuck USDC", async function () {
      const balBefore = await mockUSDC.balanceOf(receiverAddress);
      expect(balBefore).to.be.gt(0);

      const ownerBefore = await mockUSDC.balanceOf(owner.address);
      await receiver.emergencyWithdraw(usdcAddress, owner.address);
      const ownerAfter = await mockUSDC.balanceOf(owner.address);

      expect(ownerAfter - ownerBefore).to.equal(balBefore);
      expect(await mockUSDC.balanceOf(receiverAddress)).to.equal(0);
    });

    it("reverts when no tokens to rescue", async function () {
      const MockUSDC2 = await ethers.getContractFactory("MockUSDC");
      const otherToken = await MockUSDC2.deploy();
      await expect(
        receiver.emergencyWithdraw(await otherToken.getAddress(), owner.address)
      ).to.be.revertedWith("Nothing to rescue");
    });

    it("reverts with zero recipient address", async function () {
      await expect(
        receiver.emergencyWithdraw(usdcAddress, ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid recipient");
    });

    it("non-owner cannot call emergencyWithdraw", async function () {
      await expect(
        receiver.connect(other).emergencyWithdraw(usdcAddress, other.address)
      ).to.be.reverted;
    });
  });
});
