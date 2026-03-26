/**
 * 23_propose_swap_adapter.js
 *
 * Proposes the swap adapter on campaign v4 (was deployed with address(0)).
 * Execute after 48h with executeSwapAdapter() — same window as staking timelock.
 */
const { ethers } = require("hardhat");

const CAMPAIGN_V4  = "0x862958E6cc42181d3bF75F83f482390317850C08";
const SWAP_ADAPTER = "0x79e9a0367c741274E1f3D14811FAf1f515a568dC"; // same as previous campaigns

async function main() {
  const [deployer] = await ethers.getSigners();
  const campaign = await ethers.getContractAt([
    "function swapAdapter() view returns (address)",
    "function pendingSwapAdapter() view returns (address)",
    "function swapAdapterActivationTime() view returns (uint256)",
    "function proposeSwapAdapter(address) external",
  ], CAMPAIGN_V4, deployer);

  const [current, pending] = await Promise.all([campaign.swapAdapter(), campaign.pendingSwapAdapter()]);
  console.log("swapAdapter:        ", current);
  console.log("pendingSwapAdapter: ", pending);

  if (current.toLowerCase() === SWAP_ADAPTER.toLowerCase()) {
    console.log("✓ Swap adapter already set."); return;
  }
  if (pending !== ethers.ZeroAddress) {
    console.log("✓ Proposal already pending:", pending); return;
  }

  const tx = await campaign.proposeSwapAdapter(SWAP_ADAPTER);
  const receipt = await tx.wait();
  const at = await campaign.swapAdapterActivationTime();
  console.log("proposeSwapAdapter tx:", tx.hash, `(gas: ${receipt.gasUsed.toLocaleString()})`);
  console.log("Activation time:     ", new Date(Number(at) * 1000).toISOString());
  console.log("\nRun deploy/24_execute_adapters.js after", new Date(Number(at) * 1000).toISOString());
}

main().catch(e => { console.error(e); process.exit(1); });
