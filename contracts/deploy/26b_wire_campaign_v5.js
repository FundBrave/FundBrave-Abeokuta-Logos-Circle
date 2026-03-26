const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

const CAMPAIGN_V5  = "0x7681a750C3c24E585642587bE12e62df4202fC14";
const BRIDGE       = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const STAKING      = "0x6F4AF3663bfC775E00c05F2539C5341F4118D341";
const SWAP_ADAPTER = "0x79e9a0367c741274E1f3D14811FAf1f515a568dC";

async function send(label, fn) {
  process.stdout.write(`  ${label}... `);
  const tx = await fn();
  const r  = await tx.wait();
  console.log(`✓  (gas: ${r.gasUsed.toLocaleString()})`);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const campaign = await ethers.getContractAt([
    "function setBridgeContract(address) external",
    "function setStakingPool(address) external",
    "function setWatcher(address) external",
    "function swapAdapter() view returns (address)",
    "function bridgeContract() view returns (address)",
    "function stakingPool() view returns (address)",
    "function watcher() view returns (address)",
  ], CAMPAIGN_V5, deployer);

  const bridge = await ethers.getContractAt([
    "function setLocalFactory(address) external",
    "function localFundraiserFactory() view returns (address)",
  ], BRIDGE, deployer);

  const staking = await ethers.getContractAt([
    "function proposeCampaignContract(address) external",
    "function cancelCampaignContractChange() external",
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
  ], STAKING, deployer);

  // 1. Wire campaign (skip already-set ones)
  console.log("\n1. Wiring campaign...");
  const [bc, sp, wt] = await Promise.all([
    campaign.bridgeContract(), campaign.stakingPool(), campaign.watcher()
  ]);
  if (bc.toLowerCase() !== BRIDGE.toLowerCase())
    await send("setBridgeContract", () => campaign.setBridgeContract(BRIDGE));
  else console.log("  setBridgeContract: already set ✓");

  if (sp.toLowerCase() !== STAKING.toLowerCase())
    await send("setStakingPool", () => campaign.setStakingPool(STAKING));
  else console.log("  setStakingPool: already set ✓");

  if (wt.toLowerCase() !== deployer.address.toLowerCase())
    await send("setWatcher", () => campaign.setWatcher(deployer.address));
  else console.log("  setWatcher: already set ✓");

  // 2. Point bridge at v5
  console.log("\n2. Pointing bridge to v5...");
  const factory = await bridge.localFundraiserFactory();
  if (factory.toLowerCase() !== CAMPAIGN_V5.toLowerCase())
    await send("bridge.setLocalFactory(v5)", () => bridge.setLocalFactory(CAMPAIGN_V5));
  else console.log("  bridge.localFundraiserFactory: already set ✓");

  // 3. Staking timelock
  console.log("\n3. Updating staking campaign pointer...");
  const pending = await staking.pendingCampaignContract();
  if (pending !== ethers.ZeroAddress && pending.toLowerCase() !== CAMPAIGN_V5.toLowerCase())
    await send("cancelCampaignContractChange", () => staking.cancelCampaignContractChange());
  if (pending.toLowerCase() !== CAMPAIGN_V5.toLowerCase())
    await send("proposeCampaignContract(v5)", () => staking.proposeCampaignContract(CAMPAIGN_V5));
  else console.log("  pendingCampaignContract: already set ✓");

  const activationTime = await staking.campaignActivationTime();
  console.log("  Activation time:", new Date(Number(activationTime) * 1000).toISOString());

  // 4. Save addresses
  const depPath = path.join(__dirname, "..", "deployments", "84532.json");
  const dep = JSON.parse(fs.readFileSync(depPath, "utf8"));
  if (dep.AbeokutaCampaign?.toLowerCase() !== CAMPAIGN_V5.toLowerCase()) {
    dep.AbeokutaCampaignPrev4 = dep.AbeokutaCampaignPrev3;
    dep.AbeokutaCampaignPrev3 = dep.AbeokutaCampaignPrev2;
    dep.AbeokutaCampaignPrev2 = dep.AbeokutaCampaignPrev;
    dep.AbeokutaCampaignPrev  = dep.AbeokutaCampaign;
    dep.AbeokutaCampaign      = CAMPAIGN_V5;
    fs.writeFileSync(depPath, JSON.stringify(dep, null, 2));
    console.log("\n4. Saved to deployments/84532.json");
  }

  // 5. Verify
  console.log("\n=== Verification ===");
  const [swp, finalBc, finalFactory] = await Promise.all([
    campaign.swapAdapter(), campaign.bridgeContract(), bridge.localFundraiserFactory()
  ]);
  console.log("  swapAdapter:             ", swp, swp.toLowerCase() === SWAP_ADAPTER.toLowerCase() ? "✓" : "✗");
  console.log("  campaign.bridgeContract: ", finalBc, finalBc.toLowerCase() === BRIDGE.toLowerCase() ? "✓" : "✗");
  console.log("  bridge.localFactory:     ", finalFactory, finalFactory.toLowerCase() === CAMPAIGN_V5.toLowerCase() ? "✓" : "✗");
  console.log("\n  Campaign v5:", CAMPAIGN_V5);
  console.log("\nUpdate env:");
  console.log("  NEXT_PUBLIC_CAMPAIGN_ADDRESS=" + CAMPAIGN_V5);
  console.log("  CAMPAIGN_ADDRESS=" + CAMPAIGN_V5);
}

main().catch(e => { console.error(e); process.exit(1); });
