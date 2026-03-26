/**
 * 15b_wire_campaign_direct.js
 *
 * Completes wiring for the campaign deployed by 15_redeploy_campaign_direct.js.
 * Run this after the deployment tx is confirmed.
 *
 * Usage:
 *   npx hardhat run deploy/15b_wire_campaign_direct.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

const FUND_BRAVE_BRIDGE = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const NEW_CAMPAIGN      = "0xE0ad5594028c4BA3be3a4E0d4657412AF184266d";

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log("Deployer:    ", deployer.address);
  console.log("New campaign:", NEW_CAMPAIGN);

  const depPath = path.join(__dirname, `../deployments/${chainId}.json`);
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));

  const OLD_CAMPAIGN = dep.AbeokutaCampaign;
  const STAKING      = dep.AbeokutaStaking;

  const campaign = await ethers.getContractAt([
    "function setBridgeContract(address) external",
    "function setStakingPool(address) external",
    "function setWatcher(address) external",
    "function bridgeContract() view returns (address)",
    "function stakingPool() view returns (address)",
    "function watcher() view returns (address)",
  ], NEW_CAMPAIGN, deployer);

  const bridge = await ethers.getContractAt([
    "function localFundraiserFactory() view returns (address)",
    "function setLocalFactory(address) external",
  ], FUND_BRAVE_BRIDGE, deployer);

  const staking = await ethers.getContractAt([
    "function campaignContract() view returns (address)",
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
    "function proposeCampaignContract(address) external",
    "function cancelCampaignContractChange() external",
  ], STAKING, deployer);

  // ── Step 1: setBridgeContract = FundBraveBridge ───────────────────────────

  const bc = await campaign.bridgeContract();
  if (bc.toLowerCase() === FUND_BRAVE_BRIDGE.toLowerCase()) {
    console.log("\n1. bridgeContract already = FundBraveBridge ✓");
  } else {
    console.log("\n1. Setting bridgeContract = FundBraveBridge...");
    const tx = await campaign.setBridgeContract(FUND_BRAVE_BRIDGE);
    await tx.wait();
    console.log("   ✓ done");
  }

  // ── Step 2: setStakingPool ────────────────────────────────────────────────

  const sp = await campaign.stakingPool();
  if (sp.toLowerCase() === STAKING.toLowerCase()) {
    console.log("2. stakingPool already set ✓");
  } else {
    console.log("2. Setting stakingPool...");
    const tx = await campaign.setStakingPool(STAKING);
    await tx.wait();
    console.log("   ✓ done");
  }

  // ── Step 3: setWatcher ────────────────────────────────────────────────────

  // Read watcher from env; fall back to deployer (testnet convention)
  const watcherAddr = process.env.WATCHER_ADDRESS || deployer.address;

  const wt = await campaign.watcher();
  if (watcherAddr && watcherAddr !== ethers.ZeroAddress && wt.toLowerCase() !== watcherAddr.toLowerCase()) {
    console.log("3. Setting watcher...");
    const tx = await campaign.setWatcher(watcherAddr);
    await tx.wait();
    console.log("   ✓ watcher =", watcherAddr);
  } else {
    console.log("3. Watcher already set ✓");
  }

  // ── Step 4: setLocalFactory on FundBraveBridge ────────────────────────────

  const factory = await bridge.localFundraiserFactory();
  if (factory.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("4. bridge.localFactory already = newCampaign ✓");
  } else {
    console.log("4. Pointing FundBraveBridge → new campaign...");
    const tx = await bridge.setLocalFactory(NEW_CAMPAIGN);
    await tx.wait();
    console.log("   ✓ done");
  }

  // ── Step 5: proposeCampaignContract on staking ────────────────────────────

  const sc = await staking.campaignContract();
  const pc = await staking.pendingCampaignContract();

  if (sc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("5. Staking already points to new campaign ✓");
  } else if (pc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    const at = await staking.campaignActivationTime();
    console.log("5. Proposal already pending. Execute after:", new Date(Number(at) * 1000).toISOString());
  } else {
    // Cancel old pending proposal if any
    if (pc !== ethers.ZeroAddress) {
      console.log("5. Cancelling old staking proposal...");
      const tx = await staking.cancelCampaignContractChange();
      await tx.wait();
      console.log("   ✓ cancelled");
    }
    console.log("5. Proposing new campaign on staking (48h timelock)...");
    const tx = await staking.proposeCampaignContract(NEW_CAMPAIGN);
    await tx.wait();
    const at = await staking.campaignActivationTime();
    console.log("   ✓ Execute after:", new Date(Number(at) * 1000).toISOString());
    console.log("   Run: npx hardhat run deploy/14_execute_staking_campaign.js --network baseSepolia");
  }

  // ── Verify ────────────────────────────────────────────────────────────────

  console.log("\n=== Verification ===");
  const [fbc, fsp, fwt, ffactory, fsc, fpc] = await Promise.all([
    campaign.bridgeContract(),
    campaign.stakingPool(),
    campaign.watcher(),
    bridge.localFundraiserFactory(),
    staking.campaignContract(),
    staking.pendingCampaignContract(),
  ]);

  const ok = (v, label) => console.log(v ? "  ✓" : "  ✗", label);
  ok(fbc.toLowerCase() === FUND_BRAVE_BRIDGE.toLowerCase(), `campaign.bridgeContract = FundBraveBridge (${fbc.slice(0,10)}…)`);
  ok(fsp.toLowerCase() === STAKING.toLowerCase(),           `campaign.stakingPool = Staking           (${fsp.slice(0,10)}…)`);
  ok(ffactory.toLowerCase() === NEW_CAMPAIGN.toLowerCase(), `bridge.localFactory = newCampaign        (${ffactory.slice(0,10)}…)`);
  if (fsc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("  ✓ staking.campaignContract = newCampaign (live)");
  } else if (fpc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("  ⏰ staking.pendingCampaignContract = newCampaign (48h timelock)");
  } else {
    console.log("  ✗ staking campaign not yet updated");
  }

  // ── Update deployments JSON ───────────────────────────────────────────────

  dep.AbeokutaCampaignPrev2 = dep.AbeokutaCampaignPrev || dep.AbeokutaCampaign;
  dep.AbeokutaCampaignPrev  = OLD_CAMPAIGN;
  dep.AbeokutaCampaign      = NEW_CAMPAIGN;
  dep.deployedAt = new Date().toISOString();
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log("\nDeployment file updated:", depPath);

  console.log("\n✓ Done. New campaign:", NEW_CAMPAIGN);
  console.log("\nNext steps:");
  console.log("  1. frontend/.env.local → NEXT_PUBLIC_CAMPAIGN_ADDRESS=" + NEW_CAMPAIGN);
  console.log("  2. watcher/.env        → CAMPAIGN_ADDRESS=" + NEW_CAMPAIGN);
  console.log("  3. In 48h: run deploy/14_execute_staking_campaign.js");
}

main().catch(e => { console.error(e); process.exit(1); });
