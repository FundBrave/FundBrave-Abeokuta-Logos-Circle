const { ethers } = require("hardhat");
async function main() {
  const BRIDGE = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

  // Check bridgeRouter state now
  const bridge = new ethers.Contract(BRIDGE, [
    "function bridgeRouter() view returns (address)",
  ], provider);
  console.log("bridgeRouter now:", await bridge.bridgeRouter());

  // Check if it's a proxy by looking at EIP-1967 slot
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const implAddr = await provider.getStorage(BRIDGE, implSlot);
  console.log("EIP-1967 impl slot:", implAddr);

  // Decode the topic from the TX log
  // topic: 0x69edca9b...
  console.log("\nBridgeRouterSet(address) keccak:", ethers.id("BridgeRouterSet(address)").slice(0,10));
}
main().catch(console.error);
