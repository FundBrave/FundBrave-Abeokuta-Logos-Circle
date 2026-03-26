/**
 * 06_configure_new_campaign.js
 * Wires up the freshly deployed contracts and saves the deployment file.
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const CAMPAIGN  = "0x79B4FB16D6b56e5518449EFc8f204Db1f97db4C7";
const STAKING   = "0x2511b9574c51Ab2F718617c76987b3fea82401FF";
const RECEIVER  = "0x84694C3c404D5c2d187cc230705fD9305Ad7A0f8";
const WATCHER   = process.env.WATCHER_ADDRESS || "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  let nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  const send = async (fn) => {
    const tx = await fn(nonce);
    nonce++;
    const receipt = await tx.wait();
    console.log("  tx:", receipt.hash);
  };

  const campaign = await ethers.getContractAt([
    "function setStakingPool(address) external",
    "function setBridgeContract(address) external",
    "function setWatcher(address) external",
  ], CAMPAIGN);

  const staking = await ethers.getContractAt([
    "function setStakingDeadline(uint256) external",
    "function setCampaign(address) external",
  ], STAKING);

  console.log("\n1. campaign.setStakingPool...");
  await send(n => campaign.setStakingPool(STAKING, { nonce: n }));

  console.log("2. campaign.setBridgeContract...");
  await send(n => campaign.setBridgeContract(RECEIVER, { nonce: n }));

  console.log("3. campaign.setWatcher...");
  await send(n => campaign.setWatcher(WATCHER, { nonce: n }));

  // Save deployments
  const deployment = {
    network: "Base Sepolia",
    chainId: 84532,
    deployedAt: new Date().toISOString(),
    AbeokutaCampaign:        CAMPAIGN,
    AbeokutaStaking:         STAKING,
    AbeokutaBridgeReceiver:  RECEIVER,
    FundBraveBridge:         "0xb3C210cB2075e72B10f00c41e30120480017a136",
    USDC:                    "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE",
    AavePool:                "0xA14694B3a1788D22c660C837842B2d22E24983B4",
    aUSDC:                   "0xCdF55352fa73B548d81E57f2Ebb691462bD4a95F",
    SwapAdapter:             "0x5708A691d0242899Ae12dD8F47876319730F5987",
    MockSwapAdapter:         "0x5708A691d0242899Ae12dD8F47876319730F5987",
    Treasury:                "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e",
    PlatformWallet:          "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e",
    Deployer:                deployer.address,
    GoalMinUSDC:             1000,
    GoalMaxUSDC:             2500,
  };

  const outPath = path.join(__dirname, "../deployments/84532.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log("\nSaved to", outPath);
  console.log("\nUpdate frontend/.env.local:");
  console.log(`  NEXT_PUBLIC_CAMPAIGN_ADDRESS=${CAMPAIGN}`);
  console.log(`  NEXT_PUBLIC_STAKING_ADDRESS=${STAKING}`);
}

main().catch(e => { console.error(e); process.exit(1); });
