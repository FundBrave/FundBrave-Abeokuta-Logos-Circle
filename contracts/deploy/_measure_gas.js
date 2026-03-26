const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/84532.json")));
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

  const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
  const GUID6    = "0xd524bd48fe1d977803147e8c5351fe140edd14a95f2dfae28c9edc17472fe96a";
  const PAYLOAD  = "0x000000000000000000000000396e931fad8c43c7200d70bbde91e962cfacca5e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005f5e100";

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

  // Estimate gas usage
  console.log("Estimating gas for full lzReceive execution...");
  try {
    const gasEst = await provider.estimateGas({
      from: "0x0000000000000000000000000000000000000001",
      to:   ENDPOINT,
      data: calldata,
    });
    console.log("Gas estimate:", gasEst.toString());
    console.log("vs executor limit: 200000");
    console.log("Exceeds limit?", gasEst > 200_000n ? "YES — out of gas!" : "No");
  } catch (e) {
    console.log("estimateGas failed:", e.shortMessage || e.message?.slice(0, 200));
  }
}
main().catch(console.error);
