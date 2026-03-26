/**
 * 11_point_bridge_to_new_receiver.js
 *
 * Root cause of "Factory execution failed":
 *   OldReceiver (0x47D884D6…) was deployed with a different code version that
 *   tries to PULL USDC from FundBraveBridge via transferFrom(), but the bridge
 *   never approved the receiver, so allowance[Bridge][OldReceiver] = 0 → revert.
 *
 * Fix:
 *   Call FundBraveBridge.setLocalFactory(newReceiver) to use the newly deployed
 *   receiver (0x4B30d1…) which has the correct code:
 *     - Bridge pushes USDC to receiver first (via safeTransfer)
 *     - Campaign then pulls USDC from receiver (pull pattern, pre-approved)
 *
 * Also verifies:
 *   - NewReceiver.bridge = FundBraveBridge (onlyBridge check will pass)
 *   - NewReceiver.campaign = NewCampaign
 *   - NewCampaign.bridgeContract = NewReceiver (onlyBridgeOrStaking check)
 *
 * Usage:
 *   npx hardhat run deploy/11_point_bridge_to_new_receiver.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

const BRIDGE = "0xb3C210cB2075e72B10f00c41e30120480017a136";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const dep = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../deployments/84532.json"), "utf8"
  ));
  const NEW_RECV = dep.AbeokutaBridgeReceiver;
  const NEW_CAMP = dep.AbeokutaCampaign;

  console.log("NewReceiver:", NEW_RECV);
  console.log("NewCampaign:", NEW_CAMP);

  // ── Read on-chain state ────────────────────────────────────────────────────

  const bridge = await ethers.getContractAt([
    "function localFundraiserFactory() view returns (address)",
    "function setLocalFactory(address) external",
    "function owner() view returns (address)",
  ], BRIDGE, deployer);

  const recv = await ethers.getContractAt([
    "function bridge() view returns (address)",
    "function campaign() view returns (address)",
    "function setBridge(address) external",
  ], NEW_RECV, deployer);

  const camp = await ethers.getContractAt([
    "function bridgeContract() view returns (address)",
    "function setBridgeContract(address) external",
  ], NEW_CAMP, deployer);

  const usdc = await ethers.getContractAt([
    "function allowance(address,address) view returns (uint256)",
  ], dep.USDC, deployer);

  const currentFactory = await bridge.localFundraiserFactory();
  const recvBridge     = await recv.bridge();
  const recvCampaign   = await recv.campaign();
  const campBridge     = await camp.bridgeContract();
  const allowance      = await usdc.allowance(NEW_RECV, NEW_CAMP);

  console.log("\nCurrent state:");
  console.log("  Bridge.localFactory:    ", currentFactory);
  console.log("  NewReceiver.bridge:     ", recvBridge);
  console.log("  NewReceiver.campaign:   ", recvCampaign);
  console.log("  NewCampaign.bridgeContract:", campBridge);
  console.log("  allowance[NewRecv][NewCamp]:", allowance === ethers.MaxUint256 ? "maxUint256" : allowance.toString());

  // ── Step 1: Fix NewReceiver.bridge if needed ───────────────────────────────

  if (recvBridge.toLowerCase() !== BRIDGE.toLowerCase()) {
    console.log("\n1. Setting NewReceiver.bridge = FundBraveBridge...");
    const tx = await recv.setBridge(BRIDGE);
    console.log("   tx:", tx.hash);
    await tx.wait();
    console.log("   ✓ done");
  } else {
    console.log("\n1. NewReceiver.bridge already = FundBraveBridge ✓");
  }

  // ── Step 2: Fix NewCampaign.bridgeContract if needed ──────────────────────

  if (campBridge.toLowerCase() !== NEW_RECV.toLowerCase()) {
    console.log("\n2. Setting NewCampaign.bridgeContract = NewReceiver...");
    const tx = await camp.setBridgeContract(NEW_RECV);
    console.log("   tx:", tx.hash);
    await tx.wait();
    console.log("   ✓ done");
  } else {
    console.log("\n2. NewCampaign.bridgeContract already = NewReceiver ✓");
  }

  // ── Step 3: Point FundBraveBridge to NewReceiver ───────────────────────────

  if (currentFactory.toLowerCase() === NEW_RECV.toLowerCase()) {
    console.log("\n3. Bridge.localFactory already = NewReceiver ✓");
  } else {
    console.log("\n3. Setting FundBraveBridge.localFactory = NewReceiver...");
    const tx = await bridge.setLocalFactory(NEW_RECV);
    console.log("   tx:", tx.hash);
    await tx.wait();
    const updated = await bridge.localFundraiserFactory();
    console.log("   New factory:", updated, updated.toLowerCase() === NEW_RECV.toLowerCase() ? "✓" : "✗");
  }

  // ── Verify ─────────────────────────────────────────────────────────────────

  console.log("\n=== Final routing chain ===");
  const f = await bridge.localFundraiserFactory();
  const rb = await recv.bridge();
  const rc = await recv.campaign();
  const cb = await camp.bridgeContract();
  const al = await usdc.allowance(NEW_RECV, NEW_CAMP);

  const ok = (v, label) => console.log(v ? "  ✓" : "  ✗", label);
  ok(f.toLowerCase()  === NEW_RECV.toLowerCase(), `Bridge.localFactory = NewReceiver  (${f.slice(0,10)}…)`);
  ok(rb.toLowerCase() === BRIDGE.toLowerCase(),   `NewReceiver.bridge = Bridge        (${rb.slice(0,10)}…)`);
  ok(rc.toLowerCase() === NEW_CAMP.toLowerCase(), `NewReceiver.campaign = NewCampaign (${rc.slice(0,10)}…)`);
  ok(cb.toLowerCase() === NEW_RECV.toLowerCase(), `NewCampaign.bridgeContract = NewRecv (${cb.slice(0,10)}…)`);
  ok(al === ethers.MaxUint256,                    `allowance[NewRecv][NewCamp] = maxUint256`);

  console.log("\n✓ Done. Cross-chain path:");
  console.log(`  FundBraveBridge (${BRIDGE.slice(0,10)}…)`);
  console.log(`    → safeTransfer USDC + call handleCrossChainDonation`);
  console.log(`    → NewReceiver (${NEW_RECV.slice(0,10)}…)`);
  console.log(`      → creditDonation (campaign pulls USDC from NewReceiver)`);
  console.log(`      → NewCampaign (${NEW_CAMP.slice(0,10)}…)`);
}

main().catch(e => { console.error(e); process.exit(1); });
