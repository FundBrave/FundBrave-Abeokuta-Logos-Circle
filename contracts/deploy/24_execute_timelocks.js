/**
 * 24_execute_timelocks.js
 *
 * Executes both pending timelocks after 2026-03-27T17:41 UTC:
 *   1. staking.executeCampaignContract()  — staking yields to campaign v4
 *   2. campaign.executeSwapAdapter()      — ETH/ERC20 donations restored
 *
 * Run:
 *   npx hardhat run deploy/24_execute_timelocks.js --network baseSepolia
 */
const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

const CAMPAIGN_V4 = "0x862958E6cc42181d3bF75F83f482390317850C08";
const STAKING     = "0x6F4AF3663bfC775E00c05F2539C5341F4118D341";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const now = BigInt(Math.floor(Date.now() / 1000));

  // ── 1. Execute staking campaign change ─────────────────────────────────────
  const staking = await ethers.getContractAt([
    "function campaignContract() view returns (address)",
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
    "function executeCampaignContract() external",
  ], STAKING, deployer);

  const [sc, pc, sAt] = await Promise.all([
    staking.campaignContract(), staking.pendingCampaignContract(), staking.campaignActivationTime()
  ]);
  console.log("\nStaking:");
  console.log("  campaignContract:       ", sc);
  console.log("  pendingCampaignContract:", pc);
  console.log("  activationTime:         ", sAt > 0n ? new Date(Number(sAt)*1000).toISOString() : "none");

  if (pc !== ethers.ZeroAddress && pc.toLowerCase() === CAMPAIGN_V4.toLowerCase()) {
    if (now < sAt) {
      const rem = sAt - now;
      console.log(`  ✗ Timelock not expired — ${(rem / 3600n).toString()}h ${((rem % 3600n)/60n).toString()}m remaining`);
    } else {
      const tx = await staking.executeCampaignContract();
      const r = await tx.wait();
      console.log(`  ✓ executeCampaignContract (gas: ${r.gasUsed.toLocaleString()})`);
    }
  } else {
    console.log("  ✓ campaignContract already up to date or no pending change");
  }

  // ── 2. Execute swap adapter change ─────────────────────────────────────────
  const campaign = await ethers.getContractAt([
    "function swapAdapter() view returns (address)",
    "function pendingSwapAdapter() view returns (address)",
    "function swapAdapterActivationTime() view returns (uint256)",
    "function executeSwapAdapter() external",
  ], CAMPAIGN_V4, deployer);

  const [sw, ps, cAt] = await Promise.all([
    campaign.swapAdapter(), campaign.pendingSwapAdapter(), campaign.swapAdapterActivationTime()
  ]);
  console.log("\nSwap adapter:");
  console.log("  swapAdapter:            ", sw);
  console.log("  pendingSwapAdapter:     ", ps);
  console.log("  activationTime:         ", cAt > 0n ? new Date(Number(cAt)*1000).toISOString() : "none");

  if (ps !== ethers.ZeroAddress) {
    if (now < cAt) {
      const rem = cAt - now;
      console.log(`  ✗ Timelock not expired — ${(rem / 3600n).toString()}h ${((rem % 3600n)/60n).toString()}m remaining`);
    } else {
      const tx = await campaign.executeSwapAdapter();
      const r = await tx.wait();
      console.log(`  ✓ executeSwapAdapter (gas: ${r.gasUsed.toLocaleString()})`);
    }
  } else {
    console.log("  ✓ Swap adapter already set or no pending change");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
