const { ethers } = require("hardhat");
async function main() {
  const campaign = await ethers.getContractAt(
    ["function activateSwapAdapter() external"],
    "0x0190E83F17990d1Aa50553f229688d55692E8918"
  );
  await (await campaign.activateSwapAdapter()).wait();
  console.log("MockSwapAdapter activated!");
}
main().catch(e => { console.error(e); process.exit(1); });
