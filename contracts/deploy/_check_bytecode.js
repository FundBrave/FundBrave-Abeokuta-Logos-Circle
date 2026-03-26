const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");
async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/84532.json")));
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const NEW_RECV = dep.AbeokutaBridgeReceiver;

  const code = await provider.getCode(NEW_RECV);
  // ERC20 transferFrom selector: 0x23b872dd
  const hasTransferFrom = code.includes("23b872dd");
  // forceApprove calls approve: 0x095ea7b3
  const hasApprove = code.includes("095ea7b3");
  // safeTransferFrom via SafeERC20: look for 0x23b872dd
  console.log("NewReceiver deployed bytecode:");
  console.log("  contains transferFrom (0x23b872dd):", hasTransferFrom);
  console.log("  contains approve (0x095ea7b3):      ", hasApprove);
  console.log("  code length:", code.length / 2, "bytes");

  // Also check current compiled bytecode
  const artifact = require("../artifacts/contracts/AbeokutaBridgeReceiver.sol/AbeokutaBridgeReceiver.json");
  const compiled = artifact.deployedBytecode;
  const cHasTransferFrom = compiled.includes("23b872dd");
  console.log("\nCurrent compiled bytecode:");
  console.log("  contains transferFrom (0x23b872dd):", cHasTransferFrom);

  if (hasTransferFrom !== cHasTransferFrom) {
    console.log("\n⚠ BYTECODE MISMATCH — deployed vs current source differ!");
  } else {
    console.log("\n✓ Bytecode matches current source");
  }
}
main().catch(console.error);
