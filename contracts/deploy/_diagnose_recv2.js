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
    "function paused() view returns (bool)",
    "function deadline() view returns (uint256)",
    "function goalMin() view returns (uint256)",
    "function totalRaised() view returns (uint256)",
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
  const totalRaised  = await camp.totalRaised();
  const allowance    = await usdc.allowance(OLD_RECV, NEW_CAMP);
  const recvBal      = await usdc.balanceOf(OLD_RECV);

  const bridgeOk = recvBridge.toLowerCase() === BRIDGE.toLowerCase();
  const campaignOk = recvCampaign.toLowerCase() === NEW_CAMP.toLowerCase();

  console.log("=== OldReceiver ===");
  console.log("  bridge:   ", recvBridge, bridgeOk ? "✓" : "✗ MISMATCH (should be " + BRIDGE + ")");
  console.log("  campaign: ", recvCampaign, campaignOk ? "✓" : "✗ MISMATCH");
  console.log("  paused:   ", recvPaused);
  console.log("  USDC bal: ", (recvBal / 1_000_000n).toString(), "USDC");

  console.log("\n=== NewCampaign ===");
  console.log("  bridgeContract:", campBridge, campBridge.toLowerCase() === OLD_RECV.toLowerCase() ? "✓" : "✗");
  console.log("  paused:        ", campPaused);
  console.log("  deadline:      ", new Date(Number(deadline) * 1000).toISOString(), Number(deadline) < Date.now() / 1000 ? "✗ EXPIRED" : "✓ active");
  console.log("  goalMin:       ", (goalMin / 1_000_000n).toString(), "USDC");
  console.log("  totalRaised:   ", (totalRaised / 1_000_000n).toString(), "USDC");

  console.log("\n=== USDC allowance[OldRecv][NewCamp] ===");
  console.log("  allowance:", allowance === ethers.MaxUint256 ? "maxUint256 ✓" : allowance.toString() + " ✗ NOT maxUint256");

  // Simulate
  console.log("\n=== Simulate from=Bridge, to=OldReceiver ===");
  const calldata = new ethers.Interface([
    "function handleCrossChainDonation(address,uint256,uint256,bytes32,uint32) external",
  ]).encodeFunctionData("handleCrossChainDonation", [
    "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e",
    0n, 100_000_000n, ethers.ZeroHash, 40161,
  ]);

  try {
    const result = await provider.call({ from: BRIDGE, to: OLD_RECV, data: calldata });
    console.log("  SUCCESS:", result);
  } catch (e) {
    const data = e.data || e.error?.data;
    console.log("  REVERT data:", data);
    if (data && data !== "0x") {
      // Try to decode
      try {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10));
        console.log("  Error(string):", decoded[0]);
      } catch {}
      // Try custom errors
      console.log("  Selector:", data?.slice(0, 10));
    }
    console.log("  Message:", e.shortMessage || e.message?.slice(0, 200));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
