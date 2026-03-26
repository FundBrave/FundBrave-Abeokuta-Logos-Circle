/**
 * 13b_wire_campaign.js
 *
 * Completes the wiring interrupted by the nonce error in 13_redeploy_campaign.js.
 * The new campaign is already deployed — this script wires it to staking + receiver.
 *
 * Usage:
 *   npx hardhat run deploy/13b_wire_campaign.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

const NEW_CAMPAIGN = "0x3682e59269e73F411b900f3712c3D1DD95703298";

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);

  const depPath = path.join(__dirname, `../deployments/${chainId}.json`);
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));

  const OLD_CAMPAIGN = dep.AbeokutaCampaign;
  const STAKING      = dep.AbeokutaStaking;
  const RECEIVER     = dep.AbeokutaBridgeReceiver;
  const BRIDGE       = dep.FundBraveBridge;

  console.log("New campaign:  ", NEW_CAMPAIGN);
  console.log("Old campaign:  ", OLD_CAMPAIGN);
  console.log("Staking:       ", STAKING);
  console.log("Receiver:      ", RECEIVER);

  const campaign = await ethers.getContractAt([
    "function setStakingPool(address) external",
    "function setBridgeContract(address) external",
    "function setWatcher(address) external",
    "function stakingPool() view returns (address)",
    "function bridgeContract() view returns (address)",
    "function watcher() view returns (address)",
  ], NEW_CAMPAIGN, deployer);

  const staking = await ethers.getContractAt([
    "function campaignContract() view returns (address)",
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
    "function proposeCampaignContract(address) external",
  ], STAKING, deployer);

  const receiver = await ethers.getContractAt([
    "function campaign() view returns (address)",
    "function setCampaign(address) external",
  ], RECEIVER, deployer);

  // ── Step 1: setStakingPool ────────────────────────────────────────────────

  const sp = await campaign.stakingPool();
  if (sp.toLowerCase() === STAKING.toLowerCase()) {
    console.log("\n1. setStakingPool already set ✓");
  } else {
    console.log("\n1. Setting stakingPool...");
    const tx = await campaign.setStakingPool(STAKING);
    await tx.wait();
    console.log("   ✓ done");
  }

  // ── Step 2: setBridgeContract ─────────────────────────────────────────────

  const bc = await campaign.bridgeContract();
  if (bc.toLowerCase() === RECEIVER.toLowerCase()) {
    console.log("2. setBridgeContract already set ✓");
  } else {
    console.log("2. Setting bridgeContract...");
    const tx = await campaign.setBridgeContract(RECEIVER);
    await tx.wait();
    console.log("   ✓ done");
  }

  // ── Step 3: setWatcher ────────────────────────────────────────────────────

  const oldCampaign = await ethers.getContractAt([
    "function watcher() view returns (address)",
  ], OLD_CAMPAIGN, deployer);
  const watcherAddr = process.env.WATCHER_ADDRESS || await oldCampaign.watcher();

  const wt = await campaign.watcher();
  if (watcherAddr && watcherAddr !== ethers.ZeroAddress && wt.toLowerCase() !== watcherAddr.toLowerCase()) {
    console.log("3. Setting watcher...");
    const tx = await campaign.setWatcher(watcherAddr);
    await tx.wait();
    console.log("   ✓ watcher =", watcherAddr);
  } else {
    console.log("3. Watcher already set ✓");
  }

  // ── Step 4: proposeCampaignContract on staking (48h timelock) ────────────

  const sc = await staking.campaignContract();
  const pc = await staking.pendingCampaignContract();
  if (sc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("4. Staking already points to new campaign ✓");
  } else if (pc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    const at = await staking.campaignActivationTime();
    console.log("4. Proposal already pending, execute after:", new Date(Number(at) * 1000).toISOString());
  } else {
    console.log("4. Proposing new campaign on staking (48h timelock)...");
    const tx = await staking.proposeCampaignContract(NEW_CAMPAIGN);
    await tx.wait();
    const at = await staking.campaignActivationTime();
    console.log("   ✓ Execute after:", new Date(Number(at) * 1000).toISOString());
    console.log("   Run: npx hardhat run deploy/14_execute_staking_campaign.js --network baseSepolia");
  }

  // ── Step 5: setCampaign on receiver ───────────────────────────────────────

  const rc = await receiver.campaign();
  if (rc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("5. Receiver already points to new campaign ✓");
  } else {
    console.log("5. Updating receiver.campaign...");
    const tx = await receiver.setCampaign(NEW_CAMPAIGN);
    await tx.wait();
    console.log("   ✓ done");
  }

  // ── Verify ────────────────────────────────────────────────────────────────

  console.log("\n=== Verification ===");
  const [fsp, fbc, fwt, fsc, fpc, frc] = await Promise.all([
    campaign.stakingPool(),
    campaign.bridgeContract(),
    campaign.watcher(),
    staking.campaignContract(),
    staking.pendingCampaignContract(),
    receiver.campaign(),
  ]);

  const ok = (v, label) => console.log(v ? "  ✓" : "  ✗", label);
  ok(fsp.toLowerCase() === STAKING.toLowerCase(),       `campaign.stakingPool = Staking     (${fsp.slice(0,10)}…)`);
  ok(fbc.toLowerCase() === RECEIVER.toLowerCase(),      `campaign.bridgeContract = Receiver  (${fbc.slice(0,10)}…)`);
  ok(frc.toLowerCase() === NEW_CAMPAIGN.toLowerCase(),  `receiver.campaign = newCampaign     (${frc.slice(0,10)}…)`);
  if (fsc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("  ✓ staking.campaignContract = newCampaign (live)");
  } else if (fpc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("  ⏰ staking.pendingCampaignContract = newCampaign (awaiting 48h timelock)");
  } else {
    console.log("  ✗ staking campaign not yet updated");
  }

  // ── Update deployments JSON ───────────────────────────────────────────────

  dep.AbeokutaCampaignPrev = OLD_CAMPAIGN;
  dep.AbeokutaCampaign = NEW_CAMPAIGN;
  dep.deployedAt = new Date().toISOString();
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log("\nDeployment file updated:", depPath);

  console.log("\n✓ Done. New campaign:", NEW_CAMPAIGN);
  console.log("\nNext steps:");
  console.log("  1. frontend/.env.local  → NEXT_PUBLIC_CAMPAIGN_ADDRESS=" + NEW_CAMPAIGN);
  console.log("  2. watcher/.env         → CAMPAIGN_ADDRESS=" + NEW_CAMPAIGN);
  if (BRIDGE && BRIDGE !== ethers.ZeroAddress) {
    console.log("  3. FundBraveBridge → Receiver → newCampaign (no bridge changes needed)");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
