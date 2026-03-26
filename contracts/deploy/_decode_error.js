const { ethers } = require("hardhat");
async function main() {
  // The revert data from our simulation:
  const revertData = "0xe450d38c0000000000000000000000004b30d1460a643a253cdd40bd1e1ad1fec9e9b00600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005f5e100";

  const selector = revertData.slice(0, 10);
  console.log("Error selector:", selector);
  console.log("ERC20InsufficientAllowance:", ethers.id("ERC20InsufficientAllowance(address,uint256,uint256)").slice(0, 10));
  console.log("ERC20InsufficientBalance:  ", ethers.id("ERC20InsufficientBalance(address,uint256,uint256)").slice(0, 10));

  // Decode the params
  const [addr, allowance, needed] = ethers.AbiCoder.defaultAbiCoder().decode(
    ["address", "uint256", "uint256"], "0x" + revertData.slice(10)
  );
  console.log("\nDecoded:");
  console.log("  address (spender/sender):", addr);
  console.log("  uint256 (allowance/balance):", allowance.toString());
  console.log("  uint256 (needed):", needed.toString());
}
main().catch(console.error);
