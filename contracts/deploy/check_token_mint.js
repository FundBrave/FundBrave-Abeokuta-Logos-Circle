const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const tokens = [
    { name: "DAI",  addr: "0xD5F45AE6088fE7DadA621C8A70F94abE3F46f7Bf" },
    { name: "WETH", addr: "0x8140C9fE21D9639FD69E9eF345Be39d767eE7FE2" },
  ];

  for (const t of tokens) {
    const code = await ethers.provider.getCode(t.addr);
    if (code === "0x") { console.log(t.name, "- NO CONTRACT at", t.addr); continue; }

    try {
      const contract = await ethers.getContractAt([
        "function mint(address to, uint256 amount) external",
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ], t.addr);
      // try static call to mint
      await contract.mint.staticCall(deployer.address, 1n);
      console.log(t.name, "- has public mint ✓");
    } catch (e) {
      console.log(t.name, "- no public mint:", e.message.slice(0, 80));
    }
  }
}
main().catch(console.error);
