const { ethers } = require("hardhat");
async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const receipt = await provider.getTransactionReceipt("0x443ebcde32eac54d6a18262fd7d9fadf2a3c1f959d6c1938f6b97133374198b1");
  console.log("status:", receipt.status, receipt.status === 1 ? "(success)" : "(REVERTED)");
  console.log("gasUsed:", receipt.gasUsed.toString());
  console.log("logs:", receipt.logs.length);
  receipt.logs.forEach((l, i) => console.log(`  log[${i}] address:`, l.address, "topics:", l.topics[0]?.slice(0,10)));
}
main().catch(console.error);
