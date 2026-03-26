/**
 * 20b_wire_campaign_v4.js
 *
 * Completes wiring for AbeokutaCampaign v4 (deployed at 0x862958E6cc42181d3bF75F83f482390317850C08).
 * Run after 20_redeploy_campaign_v4.js fails mid-run due to nonce caching.
 */
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const CAMPAIGN_V4 = "0x862958E6cc42181d3bF75F83f482390317850C08";
const BRIDGE      = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const STAKING     = "0x6F4AF3663bfC775E00c05F2539C5341F4118D341";

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

  const campaign = await ethers.getContractAt([
    "function setBridgeContract(address) external",
    "function setStakingPool(address) external",
    "function setWatcher(address) external",
    "function bridgeContract() view returns (address)",
    "function stakingPool() view returns (address)",
  ], CAMPAIGN_V4, deployer);

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

  // 1. Wire campaign
  console.log("\n1. Wiring campaign...");
  const bc = await campaign.bridgeContract();
  if (bc.toLowerCase() !== BRIDGE.toLowerCase()) {
    await send(() => campaign.setBridgeContract(BRIDGE), "setBridgeContract(BRIDGE)");
  } else {
    console.log("  setBridgeContract: already set ✓");
  }

  const sp = await campaign.stakingPool();
  if (sp.toLowerCase() !== STAKING.toLowerCase()) {
    await send(() => campaign.setStakingPool(STAKING), "setStakingPool(STAKING)");
  } else {
    console.log("  setStakingPool: already set ✓");
  }

  await send(() => campaign.setWatcher(deployer.address), "setWatcher(deployer)");

  // 2. Point bridge to campaign v4
  console.log("\n2. Pointing bridge to campaign v4...");
  const factory = await bridge.localFundraiserFactory();
  if (factory.toLowerCase() !== CAMPAIGN_V4.toLowerCase()) {
    await send(() => bridge.setLocalFactory(CAMPAIGN_V4), "bridge.setLocalFactory(v4)");
  } else {
    console.log("  bridge.localFundraiserFactory: already set ✓");
  }

  // 3. Cancel old staking proposal, propose new one
  console.log("\n3. Updating staking campaign pointer...");
  const pending = await staking.pendingCampaignContract();
  if (pending !== ethers.ZeroAddress && pending.toLowerCase() !== CAMPAIGN_V4.toLowerCase()) {
    await send(() => staking.cancelCampaignContractChange(), "staking.cancelCampaignContractChange()");
  }
  if (pending.toLowerCase() !== CAMPAIGN_V4.toLowerCase()) {
    await send(() => staking.proposeCampaignContract(CAMPAIGN_V4), "staking.proposeCampaignContract(v4)");
  } else {
    console.log("  staking.pendingCampaign: already set ✓");
  }

  const activationTime = await staking.campaignActivationTime();
  console.log("  Staking activation time:", new Date(Number(activationTime) * 1000).toISOString());

  // 4. Save addresses
  const deploymentsPath = path.join(__dirname, "..", "deployments", "84532.json");
  let deployments = {};
  if (fs.existsSync(deploymentsPath)) {
    deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  }
  if (deployments.AbeokutaCampaign?.toLowerCase() !== CAMPAIGN_V4.toLowerCase()) {
    deployments.AbeokutaCampaignPrev3 = deployments.AbeokutaCampaignPrev2;
    deployments.AbeokutaCampaignPrev2 = deployments.AbeokutaCampaignPrev;
    deployments.AbeokutaCampaignPrev  = deployments.AbeokutaCampaign;
    deployments.AbeokutaCampaign      = CAMPAIGN_V4;
    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log("\n4. Saved to deployments/84532.json");
  }

  // 5. Verify
  console.log("\n=== Verification ===");
  const finalFactory = await bridge.localFundraiserFactory();
  const finalBc = await campaign.bridgeContract();
  console.log("  bridge.localFundraiserFactory:", finalFactory, finalFactory.toLowerCase() === CAMPAIGN_V4.toLowerCase() ? "✓" : "✗");
  console.log("  campaign.bridgeContract:      ", finalBc, finalBc.toLowerCase() === BRIDGE.toLowerCase() ? "✓" : "✗");
  console.log("\n  Campaign v4:", CAMPAIGN_V4);
  console.log("\nNext steps:");
  console.log("  1. Update frontend: NEXT_PUBLIC_CAMPAIGN_ADDRESS=" + CAMPAIGN_V4);
  console.log("  2. Update watcher:  CAMPAIGN_ADDRESS=" + CAMPAIGN_V4);
  console.log("  3. Run deploy/21_retry_nonce8.js to manually deliver nonce 8");
  console.log("  4. Run deploy/14_execute_staking_campaign.js after", new Date(Number(activationTime) * 1000).toISOString());
}

main().catch(e => { console.error(e); process.exit(1); });
