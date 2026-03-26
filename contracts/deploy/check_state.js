const { ethers } = require("hardhat");
async function main() {
  const campaign = await ethers.getContractAt([
    "function pendingSwapAdapter() view returns (address)",
    "function swapAdapterActivationTime() view returns (uint256)",
    "function swapAdapter() view returns (address)",
  ], "0x0190E83F17990d1Aa50553f229688d55692E8918");

  const pending = await campaign.pendingSwapAdapter();
  const activationTime = Number(await campaign.swapAdapterActivationTime());
  console.log("swapAdapter (current): ", await campaign.swapAdapter());
  console.log("pendingSwapAdapter:    ", pending);
  console.log("activationTime (unix): ", activationTime);
  if (activationTime > 0)
    console.log("activationTime (date): ", new Date(activationTime * 1000).toISOString());
  console.log("now:                   ", new Date().toISOString());
  if (activationTime > 0)
    console.log("can activate in:       ", Math.max(0, activationTime - Date.now()/1000).toFixed(0), "seconds");
}
main().catch(console.error);
