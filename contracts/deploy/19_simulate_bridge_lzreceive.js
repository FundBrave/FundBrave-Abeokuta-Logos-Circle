/**
 * 19_simulate_bridge_lzreceive.js
 *
 * Simulate endpoint.lzReceive (which calls bridge._lzReceive) via eth_call
 * to get the exact revert reason without spending gas.
 *
 * Also tries to decode what function FundBraveBridge calls on localFundraiserFactory
 * by checking the bridge's code for known function selectors.
 */
const { ethers } = require("hardhat");

const BRIDGE        = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const CAMPAIGN      = "0xE0ad5594028c4BA3be3a4E0d4657412AF184266d";
const LZ_ENDPOINT   = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const SRC_BRIDGE    = "0xbf07FCC10F057E897B2e67982d990701E7434e50";
const SRC_EID       = 40161;

// Nonce 8 data (from script 16 output)
const NONCE = 8n;
const GUID  = "0xcd63a7c54476d4874f768f1ec6d5c1008d90151c4ed168e72135e4a1f387fe12";
const MSG   = "0x000000000000000000000000396e931fad8c43c7200d70bbde91e962cfacca5e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005f5e100";

async function main() {
  const provider = ethers.provider;
  const senderBytes32 = ethers.zeroPadValue(SRC_BRIDGE, 32);

  // 1. Simulate endpoint.lzReceive from our account (same as script 16 did)
  // The endpoint's lzReceive checks payload hash and then calls bridge._lzReceive
  const endpointIface = new ethers.Interface([
    "function lzReceive(tuple(uint32 srcEid, bytes32 sender, uint64 nonce), address receiver, bytes32 guid, bytes message, bytes extraData) external payable",
  ]);
  const lzReceiveData = endpointIface.encodeFunctionData("lzReceive", [
    { srcEid: SRC_EID, sender: senderBytes32, nonce: NONCE },
    BRIDGE,
    GUID,
    MSG,
    "0x",
  ]);

  console.log("1. Simulating endpoint.lzReceive via eth_call...");
  try {
    const result = await provider.call({
      to: LZ_ENDPOINT,
      data: lzReceiveData,
      gasLimit: 600_000n,
    });
    console.log("   No revert:", result);
  } catch (e) {
    const data = e.data || (e.error && e.error.data) || null;
    console.log("   REVERTED:", e.message?.slice(0, 300));
    if (data) {
      console.log("   Revert data:", data);
      await decodeRevert(data);
    }
  }

  // 2. Directly simulate the bridge being called by the endpoint
  // The endpoint calls bridge.lzReceive(origin, guid, message, extraData)
  // FundBraveBridge inherits OApp so lzReceive is the OApp standard function
  console.log("\n2. Simulating bridge.lzReceive (from endpoint) via eth_call...");
  const oappIface = new ethers.Interface([
    "function lzReceive(tuple(uint32 srcEid, bytes32 sender, uint64 nonce) origin, bytes32 guid, bytes message, address executor, bytes extraData) external payable",
  ]);
  const bridgeLzData = oappIface.encodeFunctionData("lzReceive", [
    { srcEid: SRC_EID, sender: senderBytes32, nonce: NONCE },
    GUID,
    MSG,
    ethers.ZeroAddress,
    "0x",
  ]);

  try {
    const result = await provider.call({
      from: LZ_ENDPOINT,
      to: BRIDGE,
      data: bridgeLzData,
      gasLimit: 600_000n,
    });
    console.log("   No revert:", result);
  } catch (e) {
    const data = e.data || (e.error && e.error.data) || null;
    console.log("   REVERTED:", e.message?.slice(0, 300));
    if (data) {
      console.log("   Revert data:", data);
      await decodeRevert(data);
    }
  }

  // 3. Decode the MSG payload to understand what's in it
  console.log("\n3. Decoding MSG payload...");
  const raw = Buffer.from(MSG.slice(2), "hex");
  console.log("   Payload length:", raw.length, "bytes");
  console.log("   Word 0:", "0x" + raw.slice(0, 32).toString("hex"));
  console.log("   Word 1:", "0x" + raw.slice(32, 64).toString("hex"));
  console.log("   Word 2:", "0x" + raw.slice(64, 96).toString("hex"));
  console.log("   Word 3:", "0x" + raw.slice(96, 128).toString("hex"));

  // Try decoding as (address, uint256, uint256, uint256)
  try {
    const dec = ethers.AbiCoder.defaultAbiCoder().decode(
      ["address", "uint256", "uint256", "uint256"], MSG
    );
    console.log("   As (address,uint256,uint256,uint256):", dec.map(x => x.toString()));
  } catch (_) {}

  // Try decoding as (uint256, address, uint256, uint256)
  try {
    const dec = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint256", "address", "uint256", "uint256"], MSG
    );
    console.log("   As (uint256,address,uint256,uint256):", dec.map(x => x.toString()));
  } catch (_) {}

  // Try decoding as (uint8, address, uint256)
  try {
    const dec = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint8", "address", "uint256"], MSG
    );
    console.log("   As (uint8,address,uint256):", dec.map(x => x.toString()));
  } catch (_) {}

  // 4. Check known function selectors that FundBraveBridge might call
  console.log("\n4. Checking bridge bytecode for known function selectors...");
  const bridgeCode = await provider.getCode(BRIDGE);
  const selectors = {
    "creditDonation(address,uint256,string)":        ethers.id("creditDonation(address,uint256,string)").slice(0, 10),
    "handleCrossChainDonation(address,uint256,uint32,bytes32)": ethers.id("handleCrossChainDonation(address,uint256,uint32,bytes32)").slice(0, 10),
    "donate(address,uint256)":                       ethers.id("donate(address,uint256)").slice(0, 10),
    "recordDonation(address,uint256)":               ethers.id("recordDonation(address,uint256)").slice(0, 10),
    "deposit(address,uint256)":                      ethers.id("deposit(address,uint256)").slice(0, 10),
    "processDonation(address,uint256,uint32)":       ethers.id("processDonation(address,uint256,uint32)").slice(0, 10),
    "receiveDonation(address,uint256,uint32,bytes32)": ethers.id("receiveDonation(address,uint256,uint32,bytes32)").slice(0, 10),
  };

  for (const [name, sel] of Object.entries(selectors)) {
    const found = bridgeCode.toLowerCase().includes(sel.slice(2).toLowerCase());
    console.log(`   ${found ? "✓" : "✗"} ${sel} ${name}`);
  }
}

async function decodeRevert(data) {
  const iface = new ethers.Interface([
    "error Unauthorized()",
    "error ZeroAmount()",
    "error CampaignEnded()",
    "error TransactionBlocked()",
    "error EnforcedPause()",
    "error PayloadVerificationFailed()",
    "error InvalidReceiver(address)",
    "error LzTokenUnavailable()",
    "error InvalidDelegate()",
    "error NotImplemented()",
  ]);
  try {
    const dec = iface.parseError(data);
    console.log("   Decoded error:", dec?.name, dec?.args);
  } catch (_) {}
  try {
    const dec = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10));
    console.log("   Error(string):", dec[0]);
  } catch (_) {}
  try {
    const dec = ethers.AbiCoder.defaultAbiCoder().decode(["string"], data);
    console.log("   Raw string:", dec[0]);
  } catch (_) {}
}

main().catch(e => { console.error(e); process.exit(1); });
