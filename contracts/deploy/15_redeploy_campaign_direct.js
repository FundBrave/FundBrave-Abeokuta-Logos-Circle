/**
 * 15_redeploy_campaign_direct.js
 *
 * Deploys a new AbeokutaCampaign with handleCrossChainDonation and wires
 * FundBraveBridge to call it directly (bypassing the receiver entirely).
 *
 * Why: Even with creditDonation optimized, the full path
 *   FundBraveBridge → receiver → campaign.creditDonation
 * costs ~258k gas for a new donor (two cold 0→nonzero SSTOREs + safeTransferFrom).
 * FundBraveBridge hardcodes gasLimit=200k, so this always fails for new donors.
 *
 * Fix: Add handleCrossChainDonation to campaign — no safeTransferFrom, no _isDonor
 * SSTORE (uses donorTotalContributed as new-donor sentinel). Gas: ~179k for new donor.
 *
 * New routing:
 *   FundBraveBridge → (safeTransfer USDC to campaign) → campaign.handleCrossChainDonation
 *
 * Wiring:
 *   campaign.setBridgeContract(FundBraveBridge)    ← bridge calls campaign directly
 *   FundBraveBridge.setLocalFactory(campaign)      ← bridge pushes to campaign, not receiver
 *   campaign.setStakingPool(staking)
 *   campaign.setWatcher(watcher)
 *   staking.proposeCampaignContract(campaign)      ← 48h timelock
 *
 * Usage:
 *   npx hardhat run deploy/15_redeploy_campaign_direct.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

const FUND_BRAVE_BRIDGE = "0xb3C210cB2075e72B10f00c41e30120480017a136";

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);
  console.log("Chain:   ", chainId);

  const depPath = path.join(__dirname, `../deployments/${chainId}.json`);
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));

  const OLD_CAMPAIGN = dep.AbeokutaCampaign;
  const STAKING      = dep.AbeokutaStaking;
  const USDC         = dep.USDC;
  const SWAP_ADAPTER = dep.SwapAdapter || dep.MockSwapAdapter;
  const TREASURY     = dep.Treasury;

  console.log("\nExisting:");
  console.log("  OldCampaign:  ", OLD_CAMPAIGN);
  console.log("  Staking:      ", STAKING);
  console.log("  FundBraveBridge:", FUND_BRAVE_BRIDGE);

  // Reuse deadline/goals from existing deployment
  const oldCampaign = await ethers.getContractAt([
    "function goalMin() view returns (uint256)",
    "function goalMax() view returns (uint256)",
    "function deadline() view returns (uint256)",
    "function watcher() view returns (address)",
  ], OLD_CAMPAIGN, deployer);

  const [goalMin, goalMax, deadline, oldWatcher] = await Promise.all([
    oldCampaign.goalMin(),
    oldCampaign.goalMax(),
    oldCampaign.deadline(),
    oldCampaign.watcher(),
  ]);

  console.log("\nReusing params:");
  console.log("  goalMin: ", goalMin.toString());
  console.log("  goalMax: ", goalMax.toString());
  console.log("  deadline:", new Date(Number(deadline) * 1000).toISOString());
  console.log("  watcher: ", oldWatcher);

  // ── 1. Deploy new campaign ────────────────────────────────────────────────

  console.log("\n1. Deploying AbeokutaCampaign v3 (direct bridge path)...");
  const CF = await ethers.getContractFactory("AbeokutaCampaign");
  const campaign = await CF.deploy(USDC, SWAP_ADAPTER, TREASURY, goalMin, goalMax, deadline);
  await campaign.waitForDeployment();
  const NEW_CAMPAIGN = await campaign.getAddress();
  console.log("   New campaign:", NEW_CAMPAIGN);

  // ── 2. Wire new campaign ──────────────────────────────────────────────────

  console.log("\n2. Wiring new campaign...");

  // bridgeContract = FundBraveBridge (not receiver!) — handles onlyBridgeOrStaking for creditDonation
  // and the msg.sender check in handleCrossChainDonation
  let tx = await campaign.setBridgeContract(FUND_BRAVE_BRIDGE);
  await tx.wait();
  console.log("   setBridgeContract(FundBraveBridge) ✓");

  tx = await campaign.setStakingPool(STAKING);
  await tx.wait();
  console.log("   setStakingPool(staking) ✓");

  const watcherAddr = process.env.WATCHER_ADDRESS || (oldWatcher !== ethers.ZeroAddress ? oldWatcher : null);
  if (watcherAddr && watcherAddr !== ethers.ZeroAddress) {
    tx = await campaign.setWatcher(watcherAddr);
    await tx.wait();
    console.log("   setWatcher(", watcherAddr, ") ✓");
  } else {
    console.warn("   ⚠  No watcher — BTC/SOL disabled until setWatcher() called");
  }

  // ── 3. Point FundBraveBridge directly to new campaign ─────────────────────

  console.log("\n3. Pointing FundBraveBridge.localFactory → new campaign...");
  const bridge = await ethers.getContractAt([
    "function localFundraiserFactory() view returns (address)",
    "function setLocalFactory(address) external",
  ], FUND_BRAVE_BRIDGE, deployer);

  const currentFactory = await bridge.localFundraiserFactory();
  if (currentFactory.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("   Already pointing to new campaign ✓");
  } else {
    tx = await bridge.setLocalFactory(NEW_CAMPAIGN);
    await tx.wait();
    console.log("   setLocalFactory(newCampaign) ✓");
  }

  // ── 4. Propose new campaign on staking (48h timelock) ────────────────────

  console.log("\n4. Proposing campaign update on staking (48h timelock)...");
  const staking = await ethers.getContractAt([
    "function campaignContract() view returns (address)",
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
    "function proposeCampaignContract(address) external",
  ], STAKING, deployer);

  const currentCampaign = await staking.campaignContract();
  const pending = await staking.pendingCampaignContract();

  if (currentCampaign.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("   Already live ✓");
  } else if (pending.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    const at = await staking.campaignActivationTime();
    console.log("   Already proposed. Execute after:", new Date(Number(at) * 1000).toISOString());
  } else {
    // Cancel old pending proposal if it exists
    if (pending !== ethers.ZeroAddress) {
      const cancel = await ethers.getContractAt([
        "function cancelCampaignContractChange() external",
      ], STAKING, deployer);
      tx = await cancel.cancelCampaignContractChange();
      await tx.wait();
      console.log("   Cancelled old pending proposal ✓");
    }
    tx = await staking.proposeCampaignContract(NEW_CAMPAIGN);
    await tx.wait();
    const at = await staking.campaignActivationTime();
    console.log("   Proposed ✓ — execute after:", new Date(Number(at) * 1000).toISOString());
    console.log("   Run: npx hardhat run deploy/14_execute_staking_campaign.js --network baseSepolia");
  }

  // ── 5. Verify ─────────────────────────────────────────────────────────────

  console.log("\n=== Verification ===");
  const [bc, sp, wt, factory, sc, pc] = await Promise.all([
    campaign.bridgeContract(),
    campaign.stakingPool(),
    campaign.watcher(),
    bridge.localFundraiserFactory(),
    staking.campaignContract(),
    staking.pendingCampaignContract(),
  ]);

  const ok = (v, label) => console.log(v ? "  ✓" : "  ✗", label);
  ok(bc.toLowerCase() === FUND_BRAVE_BRIDGE.toLowerCase(),  `campaign.bridgeContract = FundBraveBridge (${bc.slice(0,10)}…)`);
  ok(sp.toLowerCase() === STAKING.toLowerCase(),            `campaign.stakingPool = Staking           (${sp.slice(0,10)}…)`);
  ok(factory.toLowerCase() === NEW_CAMPAIGN.toLowerCase(),  `bridge.localFactory = newCampaign        (${factory.slice(0,10)}…)`);
  if (sc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("  ✓ staking.campaignContract = newCampaign (live)");
  } else if (pc.toLowerCase() === NEW_CAMPAIGN.toLowerCase()) {
    console.log("  ⏰ staking.pendingCampaignContract = newCampaign (48h timelock)");
  } else {
    console.log("  ✗ staking campaign not updated");
  }

  // ── 6. Update deployments JSON ────────────────────────────────────────────

  dep.AbeokutaCampaignPrev2 = dep.AbeokutaCampaignPrev;
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
  console.log("\nNOTE: FundBraveBridge now calls campaign.handleCrossChainDonation directly.");
  console.log("      AbeokutaBridgeReceiver is bypassed for LZ donations (still deployed, unused).");
}

main().catch(e => { console.error(e); process.exit(1); });
