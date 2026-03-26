/**
 * 14_execute_staking_campaign.js
 *
 * Executes the pending AbeokutaStaking.campaignContract change after the 48h
 * timelock set by 13_redeploy_campaign.js.
 *
 * Usage:
 *   npx hardhat run deploy/14_execute_staking_campaign.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log("Deployer:", deployer.address);

  const dep = JSON.parse(fs.readFileSync(
    path.join(__dirname, `../deployments/${chainId}.json`), "utf8"
  ));

  const staking = await ethers.getContractAt([
    "function campaignContract() view returns (address)",
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
    "function executeCampaignContract() external",
  ], dep.AbeokutaStaking, deployer);

  const current    = await staking.campaignContract();
  const pending    = await staking.pendingCampaignContract();
  const activateAt = await staking.campaignActivationTime();

  console.log("\nStaking state:");
  console.log("  campaignContract:        ", current);
  console.log("  pendingCampaignContract: ", pending);
  console.log("  campaignActivationTime:  ", activateAt > 0n ? new Date(Number(activateAt) * 1000).toISOString() : "none");

  if (pending === ethers.ZeroAddress) {
    console.log("\n✓ No pending campaign change — nothing to do.");
    return;
  }

  if (pending.toLowerCase() !== dep.AbeokutaCampaign.toLowerCase()) {
    throw new Error(`Pending campaign ${pending} does not match deployment file ${dep.AbeokutaCampaign}`);
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now < activateAt) {
    const remainingSecs = Number(activateAt - now);
    const remainingHrs  = (remainingSecs / 3600).toFixed(1);
    throw new Error(`Timelock not expired. ${remainingHrs} hours remaining (unlocks ${new Date(Number(activateAt) * 1000).toISOString()})`);
  }

  console.log("\nExecuting campaign contract change...");
  const tx = await staking.executeCampaignContract();
  console.log("  tx:", tx.hash);
  await tx.wait();

  const updated = await staking.campaignContract();
  if (updated.toLowerCase() === dep.AbeokutaCampaign.toLowerCase()) {
    console.log("  ✓ staking.campaignContract =", updated);
  } else {
    console.error("  ✗ Unexpected value:", updated);
    process.exit(1);
  }

  console.log("\n✓ Staking now yields to new campaign:", dep.AbeokutaCampaign);
}

main().catch(e => { console.error(e); process.exit(1); });
