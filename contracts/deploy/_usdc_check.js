const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");
async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/84532.json")));
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const NEW_RECV = dep.AbeokutaBridgeReceiver;
  const NEW_CAMP = dep.AbeokutaCampaign;

  const bridge = new ethers.Contract(BRIDGE, ["function usdcToken() view returns (address)"], provider);
  const recv   = new ethers.Contract(NEW_RECV, ["function usdc() view returns (address)"], provider);
  const camp   = new ethers.Contract(NEW_CAMP, ["function usdc() view returns (address)"], provider);

  const bridgeUsdc = await bridge.usdcToken();
  const recvUsdc   = await recv.usdc();
  const campUsdc   = await camp.usdc();

  console.log("USDC addresses:");
  console.log("  dep.USDC:        ", dep.USDC);
  console.log("  Bridge.usdcToken:", bridgeUsdc);
  console.log("  NewReceiver.usdc:", recvUsdc);
  console.log("  NewCampaign.usdc:", campUsdc);

  const allMatch = bridgeUsdc.toLowerCase() === recvUsdc.toLowerCase() &&
                   recvUsdc.toLowerCase() === campUsdc.toLowerCase();
  console.log("  All match:", allMatch ? "✓" : "✗ MISMATCH");

  // Check allowance on the BRIDGE's USDC
  const usdcBridge = new ethers.Contract(bridgeUsdc, [
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
  ], provider);
  const allow = await usdcBridge.allowance(NEW_RECV, NEW_CAMP);
  const recvBal = await usdcBridge.balanceOf(NEW_RECV);
  console.log("\nOn Bridge's USDC (" + bridgeUsdc.slice(0,10) + "…):");
  console.log("  allowance[NewRecv][NewCamp]:", allow === ethers.MaxUint256 ? "maxUint256 ✓" : allow.toString());
  console.log("  NewReceiver balance:        ", (recvBal / 1_000_000n).toString(), "USDC");

  // Also: simulate with proper state override (fund NewReceiver)
  console.log("\nSimulating with state override (give NewRecv 100 USDC on Bridge's token)...");
  const calldata = new ethers.Interface([
    "function handleCrossChainDonation(address,uint256,uint256,bytes32,uint32) external",
  ]).encodeFunctionData("handleCrossChainDonation", [
    "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e",
    0n, 100_000_000n, ethers.ZeroHash, 40161,
  ]);

  // Compute the storage slot for balances[NewReceiver] in the USDC token
  // For standard OZ ERC20: balances is slot 0, mappings use keccak256(abi.encode(key, slot))
  const balSlot = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [NEW_RECV, 0])
  );
  const hundredUSDC = ethers.zeroPadValue("0x05F5E100", 32);

  try {
    const result = await provider.send("eth_call", [{
      from: BRIDGE,
      to:   NEW_RECV,
      data: calldata,
    }, "latest", {
      [bridgeUsdc]: { stateDiff: { [balSlot]: hundredUSDC } },
    }]);
    console.log("  SUCCESS:", result);
  } catch (e) {
    const data = e.error?.data || e.data;
    console.log("  REVERT data:", data?.slice?.(0, 100));
    console.log("  Message:", e.message?.slice?.(0, 200));
  }
}
main().catch(console.error);
