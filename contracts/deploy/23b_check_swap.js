const { ethers } = require("hardhat");
async function main() {
  const [d] = await ethers.getSigners();
  const c = await ethers.getContractAt([
    "function swapAdapter() view returns (address)",
    "function pendingSwapAdapter() view returns (address)",
    "function swapAdapterActivationTime() view returns (uint256)",
  ], "0x862958E6cc42181d3bF75F83f482390317850C08", d);
  const [sw, ps, at] = await Promise.all([c.swapAdapter(), c.pendingSwapAdapter(), c.swapAdapterActivationTime()]);
  console.log("swapAdapter:             ", sw);
  console.log("pendingSwapAdapter:      ", ps);
  console.log("swapAdapterActivationTime:", at > 0n ? new Date(Number(at)*1000).toISOString() : "0 (epoch)");
}
main().catch(console.error);
