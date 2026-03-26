/**
 * 13_redeploy_campaign.js
 *
 * Deploys only a new AbeokutaCampaign (gas-optimized creditDonation) and
 * rewires the existing AbeokutaStaking + AbeokutaBridgeReceiver to point to it.
 *
 * Why: The original campaign's creditDonation used ~328k gas (5-slot struct push
 * + full CircuitBreaker reads). FundBraveBridge hardcodes gasLimit=200k for
 * ACTION_DONATE, so all cross-chain donations ran out of gas.
 *
 * The new creditDonation skips the array push and replaces the 9-slot
 * CircuitBreaker with a simple per-tx cap — gas drops to ~177k.
 *
 * Wiring after deploy:
 *   newCampaign.setStakingPool(existingStaking)
 *   newCampaign.setBridgeContract(existingReceiver)
 *   newCampaign.setWatcher(existingWatcher)     [if WATCHER_ADDRESS set]
 *   existingStaking.setCampaign(newCampaign)
 *   existingReceiver.setCampaign(newCampaign)
 *
 * Usage:
 *   npx hardhat run deploy/13_redeploy_campaign.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);
  console.log("Chain:   ", chainId);

  const depPath = path.join(__dirname, `../deployments/${chainId}.json`);
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));

  const OLD_CAMPAIGN = dep.AbeokutaCampaign;
  const STAKING      = dep.AbeokutaStaking;
  const RECEIVER     = dep.AbeokutaBridgeReceiver;
  const BRIDGE       = dep.FundBraveBridge;
  const USDC         = dep.USDC;
  const SWAP_ADAPTER = dep.SwapAdapter || dep.MockSwapAdapter;
  const TREASURY     = dep.Treasury;

  console.log("\nExisting addresses:");
  console.log("  OldCampaign:", OLD_CAMPAIGN);
  console.log("  Staking:    ", STAKING);
  console.log("  Receiver:   ", RECEIVER);
  console.log("  Bridge:     ", BRIDGE);

  // ── Read old campaign params to reuse ──────────────────────────────────────

  const oldCampaign = await ethers.getContractAt([
    "function goalMin() view returns (uint256)",
    "function goalMax() view returns (uint256)",
    "function deadline() view returns (uint256)",
    "function watcher() view returns (address)",
  ], OLD_CAMPAIGN, deployer);

  const goalMin  = await oldCampaign.goalMin();
  const goalMax  = await oldCampaign.goalMax();
  const deadline = await oldCampaign.deadline();
  const watcher  = await oldCampaign.watcher();

  console.log("\nReusing campaign params from old deployment:");
  console.log("  goalMin: ", goalMin.toString(), "USDC units");
  console.log("  goalMax: ", goalMax.toString(), "USDC units");
  console.log("  deadline:", new Date(Number(deadline) * 1000).toISOString());
  console.log("  watcher: ", watcher);

  // ── 1. Deploy new AbeokutaCampaign ─────────────────────────────────────────

  console.log("\n1. Deploying new AbeokutaCampaign...");
  const CampaignFactory = await ethers.getContractFactory("AbeokutaCampaign");
  const newCampaign = await CampaignFactory.deploy(
    USDC,
    SWAP_ADAPTER,
    TREASURY,
    goalMin,
    goalMax,
    deadline
  );
  await newCampaign.waitForDeployment();
  const NEW_CAMPAIGN = await newCampaign.getAddress();
  console.log("   New AbeokutaCampaign:", NEW_CAMPAIGN);

  // ── 2. Wire new campaign → existing staking + receiver ────────────────────

  console.log("\n2. Wiring new campaign...");

  const tx1 = await newCampaign.setStakingPool(STAKING);
  await tx1.wait();
  console.log("   newCampaign.setStakingPool(STAKING) ✓");

  const tx2 = await newCampaign.setBridgeContract(RECEIVER);
  await tx2.wait();
  console.log("   newCampaign.setBridgeContract(RECEIVER) ✓");

  const watcherAddr = process.env.WATCHER_ADDRESS || (watcher !== ethers.ZeroAddress ? watcher : null);
  if (watcherAddr && watcherAddr !== ethers.ZeroAddress) {
    const tx3 = await newCampaign.setWatcher(watcherAddr);
    await tx3.wait();
    console.log("   newCampaign.setWatcher(", watcherAddr, ") ✓");
  } else {
    console.warn("   ⚠  No watcher address — BTC/SOL donations disabled until setWatcher() is called");
  }

  // ── 3. Propose new campaign on staking (48h timelock) ────────────────────

  console.log("\n3. Proposing new campaign on AbeokutaStaking (48h timelock)...");
  const staking = await ethers.getContractAt([
    "function campaignContract() view returns (address)",
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
    "function proposeCampaignContract(address) external",
    "function executeCampaignContract() external",
  ], STAKING, deployer);

  const currentStakingCampaign = await staking.campaignContract();
  const pendingStakingCampaign = await staking.pendingCampaignContract();

  if (currentStakingCampaign.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("   staking.campaignContract already = newCampaign ✓");
  } else if (pendingStakingCampaign.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    const activationTime = await staking.campaignActivationTime();
    console.log("   Proposal already submitted. Execute after:", new Date(Number(activationTime) * 1000).toISOString());
    console.log("   Run: npx hardhat run deploy/14_execute_staking_campaign.js --network baseSepolia");
  } else {
    const tx4 = await staking.proposeCampaignContract(NEW_CAMPAIGN);
    await tx4.wait();
    const activationTime = await staking.campaignActivationTime();
    console.log("   proposeCampaignContract() submitted ✓");
    console.log("   ⏰ Execute after:", new Date(Number(activationTime) * 1000).toISOString(), "(48h timelock)");
    console.log("   Run 14_execute_staking_campaign.js after that time.");
  }

  // ── 4. Point existing receiver → new campaign ─────────────────────────────

  console.log("\n4. Updating AbeokutaBridgeReceiver.campaign...");
  const receiver = await ethers.getContractAt([
    "function campaign() view returns (address)",
    "function setCampaign(address) external",
  ], RECEIVER, deployer);

  const currentRecvCampaign = await receiver.campaign();
  if (currentRecvCampaign.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("   Already pointing to new campaign ✓");
  } else {
    const tx5 = await receiver.setCampaign(NEW_CAMPAIGN);
    await tx5.wait();
    console.log("   receiver.setCampaign(newCampaign) ✓");
  }

  // ── 5. Verify final state ─────────────────────────────────────────────────

  console.log("\n=== Verification ===");
  const [sp, bc, wt, sc, pc, rc] = await Promise.all([
    newCampaign.stakingPool(),
    newCampaign.bridgeContract(),
    newCampaign.watcher(),
    staking.campaignContract(),
    staking.pendingCampaignContract(),
    receiver.campaign(),
  ]);

  const ok = (v, label) => console.log(v ? "  ✓" : "  ✗", label);
  ok(sp.toLowerCase() === STAKING.toLowerCase(),      `newCampaign.stakingPool = Staking           (${sp.slice(0,10)}…)`);
  ok(bc.toLowerCase() === RECEIVER.toLowerCase(),     `newCampaign.bridgeContract = Receiver       (${bc.slice(0,10)}…)`);
  ok(rc.toLowerCase() === NEW_CAMPAIGN.toLowerCase(), `receiver.campaign = newCampaign             (${rc.slice(0,10)}…)`);
  if (sc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("  ✓ staking.campaignContract = newCampaign       (already live)");
  } else if (pc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("  ⏰ staking.pendingCampaignContract = newCampaign (awaiting 48h timelock)");
  } else {
    console.log("  ✗ staking.campaignContract not yet updated");
  }

  // ── 6. Update deployments JSON ────────────────────────────────────────────

  dep.AbeokutaCampaign = NEW_CAMPAIGN;
  dep.AbeokutaCampaignPrev = OLD_CAMPAIGN;
  dep.deployedAt = new Date().toISOString();
  fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
  console.log(`\nDeployment file updated: ${depPath}`);

  console.log("\n✓ Done. New campaign:", NEW_CAMPAIGN);
  console.log("\nNext steps:");
  console.log("  1. Update frontend/.env.local: NEXT_PUBLIC_CAMPAIGN_ADDRESS=" + NEW_CAMPAIGN);
  if (BRIDGE && BRIDGE !== ethers.ZeroAddress) {
    console.log("  2. FundBraveBridge already points to Receiver — no bridge changes needed");
    console.log("     (Receiver now forwards to new campaign)");
  }
  console.log("  3. Update watcher/.env: CAMPAIGN_ADDRESS=" + NEW_CAMPAIGN);
}

main().catch(e => { console.error(e); process.exit(1); });
