/**
 * Simulates FundBraveBridge._lzReceive to reproduce/verify what the LZ executor sees.
 * Calls the public lzReceive on the LZ endpoint the same way the executor does.
 */
const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/84532.json")));
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

  const BRIDGE    = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const ENDPOINT  = "0x6EDCE65403992e310A62460808c4b910D972f10f";  // LZ V2 endpoint on Base Sepolia
  const NEW_RECV  = dep.AbeokutaBridgeReceiver;
  const NEW_CAMP  = dep.AbeokutaCampaign;
  const USDC      = dep.USDC;
  const DONOR     = "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e";

  // The payload as encoded by FundBraveBridge.sendCrossChainAction
  // (address donor, uint256 fundraiserId, uint8 action, uint256 amount)
  const payload = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "uint256", "uint8", "uint256"],
    [DONOR, 0, 0, 100_000_000n]
  );

  // Origin struct
  const origin = {
    srcEid:  40161,
    sender:  ethers.zeroPadValue("0xbf07FCC10F057E897B2e67982d990701E7434e50", 32), // Sepolia bridge
    nonce:   5n,
  };

  console.log("Simulating endpoint.lzReceive → FundBraveBridge._lzReceive...");
  console.log("  payload:", payload);

  // Call endpoint.lzReceive as if we were the executor
  const endpointIface = new ethers.Interface([{
    name: "lzReceive",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_origin", type: "tuple", components: [
        { name: "srcEid", type: "uint32" },
        { name: "sender", type: "bytes32" },
        { name: "nonce",  type: "uint64" },
      ]},
      { name: "_receiver",  type: "address" },
      { name: "_guid",      type: "bytes32" },
      { name: "_message",   type: "bytes" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [],
  }]);

  const calldata = endpointIface.encodeFunctionData("lzReceive", [
    [origin.srcEid, origin.sender, origin.nonce],
    BRIDGE,
    "0x4342239f7e9956fb9beb6935a496a67d789bc05cacc2fc9e4569d36c901f1dac",  // nonce 5 guid
    payload,
    "0x",
  ]);

  try {
    const result = await provider.call({
      from: "0x0000000000000000000000000000000000000001",  // executor-like address
      to:   ENDPOINT,
      data: calldata,
    });
    console.log("✓ Simulation SUCCESS");
  } catch (e) {
    const data = e.data || e.error?.data;
    console.log("✗ REVERT data:", data?.slice?.(0, 200));
    console.log("  Message:", e.shortMessage || e.message?.slice?.(0, 200));
  }

  // Also simulate just FundBraveBridge._lzReceive directly via a raw call
  // We'll call the bridge directly with the same payload to see if it succeeds
  console.log("\nAlternative: simulating Bridge._handleLzReceive via low-level call...");
  // The bridge's lzReceive is gated by endpoint check.
  // Instead let's just test the full path from bridge's perspective by simulating
  // the bridge calling _routeDirectToFactory manually

  // Simulate: what does _routeDirectToFactory do?
  // 1. safeTransfer to NewReceiver
  // 2. call handleCrossChainDonation
  // We can simulate this by: from=Bridge, call USDC.transfer(NewReceiver, amount) then simulate handleCrossChainDonation
  const usdcIface = new ethers.Interface([
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ]);

  // Check bridge USDC balance first
  const usdcContract = new ethers.Contract(USDC, usdcIface, provider);
  const bridgeBal = await usdcContract.balanceOf(BRIDGE);
  const recvBal   = await usdcContract.balanceOf(NEW_RECV);
  console.log("\n  Bridge USDC balance:", (bridgeBal / 1_000_000n).toString(), "USDC");
  console.log("  NewReceiver USDC balance:", (recvBal / 1_000_000n).toString(), "USDC");
}
main().catch(console.error);
