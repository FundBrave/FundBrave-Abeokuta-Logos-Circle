/**
 * 07_full_redeploy.js
 * Full redeploy of all Abeokuta contracts with explicit nonce management.
 * Uses MockSwapAdapter (fixed ETH rate) — testnet only.
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const USDC     = "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE";
const WETH     = "0x8140C9fE21D9639FD69E9eF345Be39d767eE7FE2";
const AAVE     = "0xA14694B3a1788D22c660C837842B2d22E24983B4";
const AUSDC    = "0xCdF55352fa73B548d81E57f2Ebb691462bD4a95F";
const BRIDGE   = process.env.BRIDGE_ADDRESS || "0xb3C210cB2075e72B10f00c41e30120480017a136";
const TREASURY = process.env.TREASURY_MULTISIG || "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e";
const WATCHER  = process.env.WATCHER_ADDRESS  || "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e";

const GOAL_MIN   = 1_000n  * 1_000_000n;
const GOAL_MAX   = 2_500n  * 1_000_000n;
const DURATION   = 60 * 24 * 60 * 60; // 60 days

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  let nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  console.log("Starting nonce:", nonce);

  const deploy = async (factory, args = []) => {
    const tx = await factory.getDeployTransaction(...args);
    const sent = await deployer.sendTransaction({ ...tx, nonce: nonce++ });
    const receipt = await sent.wait();
    const addr = receipt.contractAddress;
    console.log("  deployed:", addr, "| tx:", receipt.hash.slice(0, 18) + "…");
    return addr;
  };

  const call = async (contract, method, args = []) => {
    const tx = await contract[method](...args, { nonce: nonce++ });
    await tx.wait();
  };

  // 1. MockSwapAdapter
  console.log("\n1. MockSwapAdapter...");
  const MockFactory = await ethers.getContractFactory("MockSwapAdapter");
  const mockAdapterAddr = await deploy(MockFactory, [USDC, WETH]);

  // 2. AbeokutaCampaign
  console.log("\n2. AbeokutaCampaign...");
  const deadline = Math.floor(Date.now() / 1000) + DURATION;
  const CampaignFactory = await ethers.getContractFactory("AbeokutaCampaign");
  const campaignAddr = await deploy(CampaignFactory, [
    USDC, mockAdapterAddr, TREASURY, GOAL_MIN, GOAL_MAX, deadline
  ]);

  // 3. AbeokutaStaking
  console.log("\n3. AbeokutaStaking...");
  const StakingFactory = await ethers.getContractFactory("AbeokutaStaking");
  const stakingAddr = await deploy(StakingFactory, [
    AAVE, USDC, AUSDC, campaignAddr, TREASURY
  ]);

  // 4. AbeokutaBridgeReceiver
  console.log("\n4. AbeokutaBridgeReceiver...");
  const ReceiverFactory = await ethers.getContractFactory("AbeokutaBridgeReceiver");
  const receiverAddr = await deploy(ReceiverFactory, [USDC, campaignAddr, BRIDGE]);

  // 5. Wire up
  console.log("\n5. Configuring...");
  const campaign = await ethers.getContractAt([
    "function setStakingPool(address) external",
    "function setBridgeContract(address) external",
    "function setWatcher(address) external",
  ], campaignAddr);

  await call(campaign, "setStakingPool", [stakingAddr]);
  console.log("   setStakingPool ✓");
  await call(campaign, "setBridgeContract", [receiverAddr]);
  console.log("   setBridgeContract ✓");
  await call(campaign, "setWatcher", [WATCHER]);
  console.log("   setWatcher ✓");

  // 6. Fund MockSwapAdapter with test USDC
  console.log("\n6. Funding MockSwapAdapter with 10,000 USDC...");
  const mockUSDC = await ethers.getContractAt([
    "function mint(address,uint256) external",
    "function approve(address,uint256) external",
  ], USDC);
  const mockAdapter = await ethers.getContractAt([
    "function fund(uint256) external",
  ], mockAdapterAddr);

  const fundAmt = 10_000n * 1_000_000n;
  await call(mockUSDC, "mint", [deployer.address, fundAmt]);
  await call(mockUSDC, "approve", [mockAdapterAddr, fundAmt]);
  await call(mockAdapter, "fund", [fundAmt]);
  console.log("   Funded ✓");

  // 7. Save deployment
  const deployment = {
    network: "Base Sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    AbeokutaCampaign:       campaignAddr,
    AbeokutaStaking:        stakingAddr,
    AbeokutaBridgeReceiver: receiverAddr,
    FundBraveBridge:        BRIDGE,
    USDC,
    AavePool:               AAVE,
    aUSDC:                  AUSDC,
    SwapAdapter:            mockAdapterAddr,
    MockSwapAdapter:        mockAdapterAddr,
    Treasury:               TREASURY,
    PlatformWallet:         TREASURY,
    Deployer:               deployer.address,
    GoalMinUSDC:            1000,
    GoalMaxUSDC:            2500,
    DeadlineTs:             deadline,
  };

  const outPath = path.join(__dirname, "../deployments/84532.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log("\n✓ Done. Update frontend/.env.local:");
  console.log(`  NEXT_PUBLIC_CAMPAIGN_ADDRESS=${campaignAddr}`);
  console.log(`  NEXT_PUBLIC_STAKING_ADDRESS=${stakingAddr}`);
}

main().catch(e => { console.error(e); process.exit(1); });
