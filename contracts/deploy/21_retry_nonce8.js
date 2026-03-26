/**
 * 21_retry_nonce8.js
 *
 * 1. Verifies campaign v4 has the correct 5-param handleCrossChainDonation signature.
 * 2. Simulates the call from bridge to confirm no revert.
 * 3. Retries nonce 8 with 600k gas.
 */
const { ethers } = require("hardhat");

const BRIDGE      = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const CAMPAIGN_V4 = "0x862958E6cc42181d3bF75F83f482390317850C08";
const LZ_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const SRC_BRIDGE  = "0xbf07FCC10F057E897B2e67982d990701E7434e50";
const SRC_EID     = 40161;

// Nonce 8 data (verified hash matches stored endpoint hash)
const NONCE = 8n;
const GUID  = "0xcd63a7c54476d4874f768f1ec6d5c1008d90151c4ed168e72135e4a1f387fe12";
const MSG   = "0x000000000000000000000000396e931fad8c43c7200d70bbde91e962cfacca5e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005f5e100";

const DONOR  = "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e";
const AMOUNT = 100_000_000n; // 100 USDC

const ENDPOINT_ABI = [{
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
    { name: "_message",   type: "bytes"   },
    { name: "_extraData", type: "bytes"   },
  ],
  outputs: [],
}];

async function main() {
  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;
  const senderBytes32 = ethers.zeroPadValue(SRC_BRIDGE, 32);

  // ── 1. Verify campaign v4 has correct selector ─────────────────────────────
  console.log("1. Verifying campaign v4 has correct 5-param selector...");
  const correctSig  = "handleCrossChainDonation(address,uint256,uint256,bytes32,uint32)";
  const correctSel  = ethers.id(correctSig).slice(0, 10);
  const campaignCode = await provider.getCode(CAMPAIGN_V4);
  const found = campaignCode.toLowerCase().includes(correctSel.slice(2).toLowerCase());
  console.log(`   Selector ${correctSel} in bytecode: ${found ? "✓" : "✗ MISSING"}`);
  if (!found) { console.error("Fix not deployed! Aborting."); process.exit(1); }

  // ── 2. Simulate handleCrossChainDonation from bridge ──────────────────────
  console.log("\n2. Simulating handleCrossChainDonation(5-param) from bridge...");
  const iface = new ethers.Interface([
    "function handleCrossChainDonation(address,uint256,uint256,bytes32,uint32) external",
  ]);
  const calldata = iface.encodeFunctionData("handleCrossChainDonation", [
    DONOR, 0n, AMOUNT, ethers.ZeroHash, SRC_EID,
  ]);
  try {
    const result = await provider.call({ from: BRIDGE, to: CAMPAIGN_V4, data: calldata });
    console.log("   Result (no revert): ✓", result);
  } catch (e) {
    console.error("   REVERTED:", e.message?.slice(0, 200));
    process.exit(1);
  }

  // ── 3. Check stored hash ──────────────────────────────────────────────────
  console.log("\n3. Checking stored hash for nonce 8...");
  const endpoint = new ethers.Contract(LZ_ENDPOINT, ENDPOINT_ABI, deployer);
  const endpointRead = await ethers.getContractAt([
    "function inboundPayloadHash(address,uint32,bytes32,uint64) view returns (bytes32)",
  ], LZ_ENDPOINT, deployer);

  const stored = await endpointRead.inboundPayloadHash(BRIDGE, SRC_EID, senderBytes32, NONCE);
  const expected = ethers.keccak256(ethers.concat([ethers.getBytes(GUID), ethers.getBytes(MSG)]));
  console.log("   Stored  :", stored);
  console.log("   Expected:", expected);

  if (stored === ethers.ZeroHash) {
    console.log("   Hash is zero — nonce 8 may already be delivered!");
    return;
  }
  if (stored.toLowerCase() !== expected.toLowerCase()) {
    console.error("   Hash mismatch — cannot retry.");
    process.exit(1);
  }
  console.log("   ✓ Hash matches — safe to retry");

  // ── 4. Retry with 600k gas ────────────────────────────────────────────────
  console.log("\n4. Retrying nonce 8 with 600k gas...");
  const tx = await endpoint.lzReceive(
    { srcEid: SRC_EID, sender: senderBytes32, nonce: NONCE },
    BRIDGE,
    GUID,
    MSG,
    "0x",
    { gasLimit: 600_000n }
  );
  console.log("   tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("   status :", receipt.status === 1 ? "✓ SUCCESS" : "✗ FAILED");
  console.log("   gasUsed:", receipt.gasUsed.toString());

  if (receipt.status === 1) {
    console.log("\n✓ Nonce 8 delivered! gasUsed =", receipt.gasUsed.toString());
    if (receipt.gasUsed < 200_000n) {
      console.log("  ✓ Fits within 200k — future messages will auto-deliver");
    } else {
      console.log("  ✗ Still exceeds 200k — check gas further");
    }
  } else {
    console.error("\n✗ Still reverting — check contract state");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
