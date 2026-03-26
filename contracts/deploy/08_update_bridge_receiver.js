/**
 * 08_update_bridge_receiver.js
 *
 * The FundBraveBridge on Base Sepolia has its localFundraiserFactory hardcoded
 * in the constructor — no setter exists. After a campaign redeploy the bridge
 * still calls the OLD AbeokutaBridgeReceiver.
 *
 * Fix (no bridge redeploy needed):
 *   1. Call oldReceiver.setCampaign(newCampaign)
 *      → routes old receiver → new campaign (also re-approves USDC)
 *   2. Call newCampaign.setBridgeContract(oldReceiver)
 *      → grants onlyBridgeOrStaking access to the old receiver
 *
 * Usage:
 *   npx hardhat run deploy/08_update_bridge_receiver.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

// The FundBraveBridge will always call this receiver — we cannot change it.
const OLD_RECEIVER = "0x47D884D6681986bF889D2ab3AA673d9Ded840817";

const DEPLOYMENT_FILE = path.join(__dirname, "../deployments/84532.json");

const RECEIVER_ABI = [
  "function campaign() view returns (address)",
  "function bridge() view returns (address)",
  "function setCampaign(address _campaign) external",
  "function owner() view returns (address)",
];

const CAMPAIGN_ABI = [
  "function bridgeContract() view returns (address)",
  "function setBridgeContract(address _bridge) external",
  "function owner() view returns (address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  if (!fs.existsSync(DEPLOYMENT_FILE)) {
    throw new Error(`Deployment file not found: ${DEPLOYMENT_FILE}`);
  }
  const dep = JSON.parse(fs.readFileSync(DEPLOYMENT_FILE, "utf8"));
  const newCampaign = dep.AbeokutaCampaign;

  if (!newCampaign) throw new Error("AbeokutaCampaign missing from deployment file");

  console.log("\nOld receiver (FundBraveBridge → here):", OLD_RECEIVER);
  console.log("New campaign (target):                 ", newCampaign);

  const receiver = await ethers.getContractAt(RECEIVER_ABI, OLD_RECEIVER, deployer);
  const campaign = await ethers.getContractAt(CAMPAIGN_ABI, newCampaign, deployer);

  // ── Step 1: Point old receiver at new campaign ───────────────────────────
  const currentCampaign = await receiver.campaign();
  console.log("\nReceiver's current campaign:", currentCampaign);

  if (currentCampaign.toLowerCase() === newCampaign.toLowerCase()) {
    console.log("  → Already pointing to new campaign ✓");
  } else {
    console.log("  → Calling setCampaign...");
    const tx1 = await receiver.setCampaign(newCampaign);
    console.log("    tx:", tx1.hash);
    await tx1.wait();
    const updated = await receiver.campaign();
    console.log("  → New campaign:", updated, "✓");
  }

  // ── Step 2: Grant old receiver access to new campaign ────────────────────
  const currentBridge = await campaign.bridgeContract();
  console.log("\nCampaign's current bridgeContract:", currentBridge);

  if (currentBridge.toLowerCase() === OLD_RECEIVER.toLowerCase()) {
    console.log("  → Already set to old receiver ✓");
  } else {
    console.log("  → Calling setBridgeContract...");
    const tx2 = await campaign.setBridgeContract(OLD_RECEIVER);
    console.log("    tx:", tx2.hash);
    await tx2.wait();
    const updatedBridge = await campaign.bridgeContract();
    console.log("  → bridgeContract:", updatedBridge, "✓");
  }

  console.log("\n✓ Done. Cross-chain donation routing:");
  console.log(`  FundBraveBridge (${(await receiver.bridge()).slice(0, 10)}…)`);
  console.log(`    → OldReceiver  (${OLD_RECEIVER.slice(0, 10)}…)`);
  console.log(`    → NewCampaign  (${newCampaign.slice(0, 10)}…)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
