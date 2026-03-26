const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const CAMPAIGN = "0xB4e4c856b193850b5f06e877ed98582F55bABFA3";
  const ADAPTER  = "0x32eFaf813596c42c7aa203eD748e059E91E5753A";
  const USDC     = "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE";

  // Check adapter USDC balance
  const usdc = await ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], USDC);
  const bal = await usdc.balanceOf(ADAPTER);
  console.log("Adapter USDC balance:", bal.toString(), "(expect 10_000_000_000)");

  // Check campaign's swapAdapter
  const campaign = await ethers.getContractAt([
    "function swapAdapter() view returns (address)",
    "function donateETH(uint256) external payable",
  ], CAMPAIGN);
  console.log("Campaign swapAdapter:", await campaign.swapAdapter());
  console.log("Expected adapter:    ", ADAPTER);

  // Try static call to see revert reason
  console.log("\nSimulating donateETH(0) with 0.005 ETH...");
  try {
    await campaign.donateETH.staticCall(0, { value: ethers.parseEther("0.005") });
    console.log("Static call succeeded — no revert");
  } catch (err) {
    console.log("Revert reason:", err.message.slice(0, 400));
  }
}
main().catch(console.error);
