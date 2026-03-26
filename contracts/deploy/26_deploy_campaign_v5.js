/**
 * 26_deploy_campaign_v5.js
 *
 * Campaign v5 — includes:
 *   - GoalReached error blocking donations once goalMax is hit
 *   - Swap adapter set in constructor (no 48h wait for ETH/ERC20 donations)
 *   - Correct 5-param handleCrossChainDonation signature
 *
 * Wiring:
 *   campaign.setBridgeContract(BRIDGE)
 *   campaign.setStakingPool(STAKING)
 *   campaign.setWatcher(deployer)
 *   bridge.setLocalFactory(campaign_v5)
 *   staking: cancel v4 proposal → propose v5 (new 48h timelock)
 *   campaign.proposeSwapAdapter / executeSwapAdapter → NOT needed (set in constructor)
 */
const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

const BRIDGE       = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const STAKING      = "0x6F4AF3663bfC775E00c05F2539C5341F4118D341";
const USDC         = "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE";
const SWAP_ADAPTER = "0x79e9a0367c741274E1f3D14811FAf1f515a568dC";
const TREASURY     = "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e";

const GOAL_MIN = 1_000n * 1_000_000n;   // $1,000 USDC
const GOAL_MAX = 2_500n * 1_000_000n;   // $2,500 USDC
const DEADLINE = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90 days

async function send(label, fn) {
  process.stdout.write(`  ${label}... `);
  const tx = await fn();
  const r  = await tx.wait();
  console.log(`✓  (gas: ${r.gasUsed.toLocaleString()})`);
  return r;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Network : baseSepolia\n");

  // ── 1. Deploy campaign v5 ──────────────────────────────────────────────────
  console.log("1. Deploying AbeokutaCampaign v5...");
  const Campaign = await ethers.getContractFactory("AbeokutaCampaign");
  const campaign = await Campaign.deploy(
    USDC, SWAP_ADAPTER, TREASURY, GOAL_MIN, GOAL_MAX, DEADLINE
  );
  await campaign.waitForDeployment();
  const CAMPAIGN_V5 = await campaign.getAddress();
  console.log("   AbeokutaCampaign v5:", CAMPAIGN_V5, "\n");

  // ── 2. Wire campaign ───────────────────────────────────────────────────────
  console.log("2. Wiring campaign...");
  await send("setBridgeContract(BRIDGE)",    () => campaign.setBridgeContract(BRIDGE));
  await send("setStakingPool(STAKING)",      () => campaign.setStakingPool(STAKING));
  await send("setWatcher(deployer)",         () => campaign.setWatcher(deployer.address));

  // ── 3. Point bridge at v5 ─────────────────────────────────────────────────
  console.log("\n3. Pointing bridge to campaign v5...");
  const bridge = await ethers.getContractAt([
    "function setLocalFactory(address) external",
    "function localFundraiserFactory() view returns (address)",
  ], BRIDGE, deployer);
  await send("bridge.setLocalFactory(v5)", () => bridge.setLocalFactory(CAMPAIGN_V5));
  const factory = await bridge.localFundraiserFactory();
  console.log("   bridge.localFundraiserFactory:", factory,
    factory.toLowerCase() === CAMPAIGN_V5.toLowerCase() ? "✓" : "✗");

  // ── 4. Update staking campaign pointer ────────────────────────────────────
  console.log("\n4. Updating staking campaign pointer (48h timelock)...");
  const staking = await ethers.getContractAt([
    "function proposeCampaignContract(address) external",
    "function cancelCampaignContractChange() external",
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
  ], STAKING, deployer);

  const pending = await staking.pendingCampaignContract();
  if (pending !== ethers.ZeroAddress) {
    await send("staking.cancelCampaignContractChange()", () => staking.cancelCampaignContractChange());
  }
  await send("staking.proposeCampaignContract(v5)", () => staking.proposeCampaignContract(CAMPAIGN_V5));
  const activationTime = await staking.campaignActivationTime();
  console.log("   Activation time:", new Date(Number(activationTime) * 1000).toISOString());

  // ── 5. Verify swap adapter is set (from constructor) ──────────────────────
  console.log("\n5. Verifying swap adapter...");
  const swapAdapter = await campaign.swapAdapter();
  console.log("   swapAdapter:", swapAdapter,
    swapAdapter.toLowerCase() === SWAP_ADAPTER.toLowerCase() ? "✓" : "✗");

  // ── 6. Save addresses ─────────────────────────────────────────────────────
  const depPath = path.join(__dirname, "..", "deployments", "84532.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  dep.AbeokutaCampaignPrev4 = dep.AbeokutaCampaignPrev3;
  dep.AbeokutaCampaignPrev3 = dep.AbeokutaCampaignPrev2;
  dep.AbeokutaCampaignPrev2 = dep.AbeokutaCampaignPrev;
  dep.AbeokutaCampaignPrev  = dep.AbeokutaCampaign;
  dep.AbeokutaCampaign      = CAMPAIGN_V5;
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log("\n6. Saved to deployments/84532.json");

  // ── 7. Summary ────────────────────────────────────────────────────────────
  console.log("\n=== Campaign v5 deployed ===");
  console.log("  Address:      ", CAMPAIGN_V5);
  console.log("  swapAdapter:  ", SWAP_ADAPTER, "(set in constructor — no 48h wait)");
  console.log("  bridgeContract:", BRIDGE);
  console.log("  stakingPool:  ", STAKING);
  console.log("\nUpdate env vars:");
  console.log("  frontend/.env.local  → NEXT_PUBLIC_CAMPAIGN_ADDRESS=" + CAMPAIGN_V5);
  console.log("  watcher/.env         → CAMPAIGN_ADDRESS=" + CAMPAIGN_V5);
  console.log("\nStaking timelock: run deploy/14_execute_staking_campaign.js after",
    new Date(Number(activationTime) * 1000).toISOString());
}

main().catch(e => { console.error(e); process.exit(1); });
