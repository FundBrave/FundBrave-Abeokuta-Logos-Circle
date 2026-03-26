const { ethers } = require("hardhat");
async function main() {
  const [d] = await ethers.getSigners();
  const c = await ethers.getContractAt([
    "function pause() external",
    "function paused() view returns (bool)",
  ], "0x862958E6cc42181d3bF75F83f482390317850C08", d);
  const already = await c.paused();
  if (already) { console.log("Already paused ✓"); return; }
  const tx = await c.pause();
  await tx.wait();
  console.log("Paused ✓ tx:", tx.hash);
}
main().catch(e => { console.error(e); process.exit(1); });
