const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/84532.json")));

  const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const OLD_RECV = "0x47D884D6681986bF889D2ab3AA673d9Ded840817";
  const NEW_CAMP = dep.AbeokutaCampaign;
  const USDC     = dep.USDC;

  const recv = new ethers.Contract(OLD_RECV, [
    "function bridge() view returns (address)",
    "function campaign() view returns (address)",
    "function paused() view returns (bool)",
  ], provider);

  const camp = new ethers.Contract(NEW_CAMP, [
    "function bridgeContract() view returns (address)",
    "function stakingPool() view returns (address)",
    "function paused() view returns (bool)",
    "function deadline() view returns (uint256)",
    "function goalMin() view returns (uint256)",
    "function totalDonated() view returns (uint256)",
  ], provider);

  const usdc = new ethers.Contract(USDC, [
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
  ], provider);

  const recvBridge   = await recv.bridge();
  const recvCampaign = await recv.campaign();
  const recvPaused   = await recv.paused();
  const campBridge   = await camp.bridgeContract();
  const campPaused   = await camp.paused();
  const deadline     = await camp.deadline();
  const goalMin      = await camp.goalMin();
  const totalDon     = await camp.totalDonated();
  const allowance    = await usdc.allowance(OLD_RECV, NEW_CAMP);

  console.log("=== OldReceiver ===");
  console.log("  bridge:        ", recvBridge);
  console.log("  bridge == BRIDGE?", recvBridge.toLowerCase() === BRIDGE.toLowerCase());
  console.log("  campaign:      ", recvCampaign);
  console.log("  paused:        ", recvPaused);

  console.log("\n=== NewCampaign ===");
  console.log("  bridgeContract:", campBridge);
  console.log("  bridgeContract == OldRecv?", campBridge.toLowerCase() === OLD_RECV.toLowerCase());
  console.log("  paused:        ", campPaused);
  console.log("  deadline:      ", new Date(Number(deadline) * 1000).toISOString());
  console.log("  deadline passed?", Number(deadline) < Date.now() / 1000);
  console.log("  goalMin:       ", (goalMin / 1_000_000n).toString(), "USDC");
  console.log("  totalDonated:  ", (totalDon / 1_000_000n).toString(), "USDC");

  console.log("\n=== USDC ===");
  console.log("  allowance[OldRecv][NewCamp]:", allowance === ethers.MaxUint256 ? "maxUint256 ✓" : allowance.toString());

  // Simulate the call
  console.log("\n=== Simulating handleCrossChainDonation ===");
  const iface = new ethers.Interface([
    "function handleCrossChainDonation(address,uint256,uint256,bytes32,uint32) external",
  ]);
  const calldata = iface.encodeFunctionData("handleCrossChainDonation", [
    "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e",  // donor (deployer)
    0,                                              // fundraiserId
    100_000_000n,                                   // 100 USDC
    ethers.ZeroHash,                                // messageHash
    40161,                                          // srcEid (Ethereum Sepolia)
  ]);

  try {
    await provider.call({
      from: BRIDGE,
      to:   OLD_RECV,
      data: calldata,
    });
    console.log("  Simulation: SUCCESS");
  } catch (e) {
    console.log("  Simulation REVERTED:", e.message.slice(0, 300));
    // Try to decode the revert reason
    const data = e.data || e.error?.data;
    if (data) console.log("  Revert data:", data);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
