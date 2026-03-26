/**
 * 20_redeploy_campaign_v4.js
 *
 * Deploys AbeokutaCampaign v4 with the CORRECT 5-param handleCrossChainDonation signature:
 *   handleCrossChainDonation(address donor, uint256 fundraiserId, uint256 amount, bytes32 messageHash, uint32 srcEid)
 *
 * This matches ILocalFundraiserFactory so FundBraveBridge can use campaign as localFundraiserFactory
 * directly (no receiver hop), fitting within the 200k gasLimit executor restriction.
 *
 * Wires:
 *   bridge.setLocalFactory(campaign_v4)   — bridge calls campaign directly
 *   campaign_v4.setBridgeContract(bridge)  — only bridge can call handleCrossChainDonation
 *   campaign_v4.setStakingPool(staking)
 *   campaign_v4.setWatcher(deployer)
 *   staking.cancelCampaignContractChange() — cancel pending v3 proposal
 *   staking.proposeCampaignContract(campaign_v4) — start new 48h timelock
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const STAKING  = "0x6F4AF3663bfC775E00c05F2539C5341F4118D341";
const RECEIVER = "0x4B30d1460a643A253cdD40bD1E1AD1fEC9e9b006";

// Base Sepolia addresses (from existing deployment)
const USDC      = "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE";
const SWAP      = "0x0000000000000000000000000000000000000000"; // no swap adapter on testnet
const TREASURY  = "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e"; // deployer as treasury on testnet

const GOAL_MIN  = 1_000n * 1_000_000n;   // $1,000 USDC
const GOAL_MAX  = 2_500n * 1_000_000n;   // $2,500 USDC
const DEADLINE  = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days from now

async function send(fn, label) {
  process.stdout.write(`  ${label}... `);
  const tx = await fn();
  const receipt = await tx.wait();
  console.log(`✓ (gas: ${receipt.gasUsed.toLocaleString()})`);
  return receipt;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Network: baseSepolia");

  // ── 1. Deploy campaign v4 ──────────────────────────────────────────────────
  console.log("\n1. Deploying AbeokutaCampaign v4...");
  const Campaign = await ethers.getContractFactory("AbeokutaCampaign");
  const campaign = await Campaign.deploy(USDC, SWAP, TREASURY, GOAL_MIN, GOAL_MAX, DEADLINE);
  await campaign.waitForDeployment();
  const campaignAddr = await campaign.getAddress();
  console.log("   AbeokutaCampaign v4:", campaignAddr);

  // ── 2. Wire campaign ───────────────────────────────────────────────────────
  console.log("\n2. Wiring campaign...");
  await send(() => campaign.setBridgeContract(BRIDGE),    "setBridgeContract(BRIDGE)");
  await send(() => campaign.setStakingPool(STAKING),      "setStakingPool(STAKING)");
  await send(() => campaign.setWatcher(deployer.address), "setWatcher(deployer)");

  // ── 3. Point bridge directly at campaign v4 ────────────────────────────────
  console.log("\n3. Pointing bridge to campaign v4...");
  const bridge = await ethers.getContractAt([
    "function setLocalFundraiserFactory(address) external",
    "function localFundraiserFactory() view returns (address)",
  ], BRIDGE, deployer);
  await send(() => bridge.setLocalFundraiserFactory(campaignAddr), "bridge.setLocalFundraiserFactory(campaign_v4)");
  const factory = await bridge.localFundraiserFactory();
  console.log("   bridge.localFundraiserFactory =", factory, factory.toLowerCase() === campaignAddr.toLowerCase() ? "✓" : "✗");

  // ── 4. Update staking to point to campaign v4 (48h timelock) ──────────────
  console.log("\n4. Updating staking campaign pointer (48h timelock)...");
  const staking = await ethers.getContractAt([
    "function proposeCampaignContract(address) external",
    "function cancelCampaignContractChange() external",
    "function pendingCampaign() view returns (address)",
    "function pendingCampaignActivationTime() view returns (uint256)",
  ], STAKING, deployer);

  const pending = await staking.pendingCampaign();
  if (pending !== ethers.ZeroAddress) {
    await send(() => staking.cancelCampaignContractChange(), "staking.cancelCampaignContractChange()");
  }
  await send(() => staking.proposeCampaignContract(campaignAddr), "staking.proposeCampaignContract(campaign_v4)");
  const activationTime = await staking.pendingCampaignActivationTime();
  console.log("   Staking activation time:", new Date(Number(activationTime) * 1000).toISOString());
  console.log("   (Run deploy/14_execute_staking_campaign.js after this time)");

  // ── 5. Save addresses ──────────────────────────────────────────────────────
  const deploymentsPath = path.join(__dirname, "..", "deployments", "84532.json");
  let deployments = {};
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  deployments.AbeokutaCampaignPrev3 = deployments.AbeokutaCampaignPrev2;
  deployments.AbeokutaCampaignPrev2 = deployments.AbeokutaCampaignPrev;
  deployments.AbeokutaCampaignPrev  = deployments.AbeokutaCampaign;
  deployments.AbeokutaCampaign      = campaignAddr;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("\n5. Saved to deployments/84532.json");

  // ── 6. Summary ─────────────────────────────────────────────────────────────
  console.log("\n=== Campaign v4 Deployed ===");
  console.log("  AbeokutaCampaign v4:", campaignAddr);
  console.log("  bridgeContract:     ", BRIDGE);
  console.log("  stakingPool:        ", STAKING);
  console.log("\nNext steps:");
  console.log("  1. Update frontend: NEXT_PUBLIC_CAMPAIGN_ADDRESS=" + campaignAddr);
  console.log("  2. Update watcher:  CAMPAIGN_ADDRESS=" + campaignAddr);
  console.log("  3. Run deploy/21_retry_nonce8.js to manually deliver nonce 8");
  console.log("  4. Run deploy/14_execute_staking_campaign.js after", new Date(Number(activationTime) * 1000).toISOString());
}

main().catch(e => { console.error(e); process.exit(1); });
