const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/84532.json")));
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

  const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const NEW_RECV = dep.AbeokutaBridgeReceiver;
  const NEW_CAMP = dep.AbeokutaCampaign;
  const USDC     = dep.USDC;

  // Nonce 6 from user's message
  const GUID6    = "0xd524bd48fe1d977803147e8c5351fe140edd14a95f2dfae28c9edc17472fe96a";
  const PAYLOAD  = "0x000000000000000000000000396e931fad8c43c7200d70bbde91e962cfacca5e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005f5e100";

  // First print current state
  const bridge = new ethers.Contract(BRIDGE, [
    "function localFundraiserFactory() view returns (address)",
    "function bridgeRouter() view returns (address)",
  ], provider);
  const recv = new ethers.Contract(NEW_RECV, [
    "function bridge() view returns (address)",
    "function campaign() view returns (address)",
    "function paused() view returns (bool)",
  ], provider);
  const camp = new ethers.Contract(NEW_CAMP, [
    "function bridgeContract() view returns (address)",
    "function paused() view returns (bool)",
    "function deadline() view returns (uint256)",
  ], provider);
  const usdc = new ethers.Contract(USDC, [
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
  ], provider);

  console.log("=== Current state ===");
  console.log("Bridge.localFactory:    ", await bridge.localFundraiserFactory());
  console.log("Bridge.bridgeRouter:    ", await bridge.bridgeRouter());
  console.log("NewRecv.bridge:         ", await recv.bridge());
  console.log("NewRecv.campaign:       ", await recv.campaign());
  console.log("NewRecv.paused:         ", await recv.paused());
  console.log("NewCamp.bridgeContract: ", await camp.bridgeContract());
  console.log("NewCamp.paused:         ", await camp.paused());
  const dl = await camp.deadline();
  console.log("NewCamp.deadline:       ", new Date(Number(dl) * 1000).toISOString(), Number(dl) < Date.now()/1000 ? "EXPIRED" : "active");
  const allowance = await usdc.allowance(NEW_RECV, NEW_CAMP);
  console.log("allowance[Recv][Camp]:  ", allowance === ethers.MaxUint256 ? "maxUint256" : allowance.toString());
  console.log("Bridge USDC bal:        ", (await usdc.balanceOf(BRIDGE) / 1_000_000n).toString(), "USDC");

  // Simulate nonce 6 via endpoint.lzReceive
  console.log("\n=== Simulating nonce 6 ===");
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
    [40161, ethers.zeroPadValue("0xbf07FCC10F057E897B2e67982d990701E7434e50", 32), 6n],
    BRIDGE, GUID6, PAYLOAD, "0x",
  ]);

  try {
    const result = await provider.call({ from: "0x0000000000000000000000000000000000000001", to: ENDPOINT, data: calldata });
    console.log("✓ endpoint.lzReceive simulation SUCCESS");
  } catch (e) {
    const data = e.data || e.error?.data;
    console.log("✗ endpoint.lzReceive REVERT:", data?.slice?.(0,200));
    console.log("  ", e.shortMessage || e.message?.slice?.(0, 150));
  }

  // Simulate just FundBraveBridge.lzReceive directly (bypassing endpoint hash check)
  console.log("\n=== Simulating Bridge.lzReceive directly ===");
  const bridgeIface = new ethers.Interface([{
    name: "lzReceive",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_origin", type: "tuple", components: [
        { name: "srcEid", type: "uint32" },
        { name: "sender", type: "bytes32" },
        { name: "nonce",  type: "uint64" },
      ]},
      { name: "_guid",      type: "bytes32" },
      { name: "_message",   type: "bytes" },
      { name: "_extraData", type: "bytes" },
    ],
    outputs: [],
  }]);
  const bridgeCalldata = bridgeIface.encodeFunctionData("lzReceive", [
    [40161, ethers.zeroPadValue("0xbf07FCC10F057E897B2e67982d990701E7434e50", 32), 6n],
    GUID6, PAYLOAD, "0x",
  ]);

  try {
    const result = await provider.call({ from: ENDPOINT, to: BRIDGE, data: bridgeCalldata });
    console.log("✓ Bridge.lzReceive simulation SUCCESS");
  } catch (e) {
    const data = e.data || e.error?.data;
    console.log("✗ Bridge.lzReceive REVERT data:", data?.slice?.(0,200));
    // Decode the inner error
    if (data && data.length > 10) {
      const sel = data.slice(0, 10);
      console.log("  Selector:", sel);
      console.log("  ERC20InsufficientBalance:", ethers.id("ERC20InsufficientBalance(address,uint256,uint256)").slice(0,10));
      console.log("  Error(string):", ethers.id("Error(string)").slice(0,10));
      if (sel === "0x08c379a0") {
        try {
          const [msg] = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10));
          console.log("  Error string:", msg);
        } catch {}
      }
    }
    console.log("  ", e.shortMessage || e.message?.slice?.(0, 150));
  }
}
main().catch(console.error);
