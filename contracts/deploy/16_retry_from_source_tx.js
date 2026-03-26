/**
 * 16_retry_from_source_tx.js
 *
 * Fetches the actual LZ packet from a source-chain TX, verifies the payload hash
 * against what the Base Sepolia endpoint stored, then replays lzReceive with 600k gas.
 *
 * Usage:
 *   SOURCE_TX=0x5d4b9... npx hardhat run deploy/16_retry_from_source_tx.js --network baseSepolia
 *   or edit SOURCE_TX_HASH below.
 */

const { ethers } = require("hardhat");

const SOURCE_TX_HASH   = process.env.SOURCE_TX || "0x5d4b9c225bb3c79ea8e01ded15f43ba5be21ec3ad2f7a4767c7b1dc96e1ee917";
const SEPOLIA_RPC      = "https://ethereum-sepolia-rpc.publicnode.com";
const LZ_ENDPOINT      = "0x6EDCE65403992e310A62460808c4b910D972f10f"; // Base Sepolia endpoint
const DST_BRIDGE       = "0xb3C210cB2075e72B10f00c41e30120480017a136"; // FundBraveBridge on Base Sep
const SOURCE_BRIDGE    = "0xbf07FCC10F057E897B2e67982d990701E7434e50"; // FundBraveBridge on Eth Sep
const SRC_EID          = 40161;

const PACKET_SENT_TOPIC = ethers.id("PacketSent(bytes,bytes,address)");

function parsePacket(encodedPacket) {
  const buf    = Buffer.from(encodedPacket.slice(2), "hex");
  const nonce  = buf.readBigUInt64BE(1);
  const srcEid = buf.readUInt32BE(9);
  const sender = "0x" + buf.slice(13, 45).toString("hex");
  const dstEid = buf.readUInt32BE(45);
  const recv   = "0x" + buf.slice(49, 81).toString("hex");
  const guid   = "0x" + buf.slice(81, 113).toString("hex");
  const msg    = "0x" + buf.slice(113).toString("hex");
  return { nonce, srcEid, sender, dstEid, recv, guid, msg };
}

const ENDPOINT_ABI = [{
  name: "inboundPayloadHash",
  type: "function",
  stateMutability: "view",
  inputs: [
    { name: "_receiver", type: "address" },
    { name: "_srcEid",   type: "uint32"  },
    { name: "_sender",   type: "bytes32" },
    { name: "_nonce",    type: "uint64"  },
  ],
  outputs: [{ type: "bytes32" }],
},{
  name: "lzReceive",
  type: "function",
  stateMutability: "payable",
  inputs: [
    { name: "_origin", type: "tuple", components: [
      { name: "srcEid", type: "uint32"  },
      { name: "sender", type: "bytes32" },
      { name: "nonce",  type: "uint64"  },
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
  console.log("Deployer:", deployer.address);
  console.log("Source TX:", SOURCE_TX_HASH);

  // 1. Fetch packet from source chain
  console.log("\n1. Fetching PacketSent from Ethereum Sepolia...");
  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const receipt = await sepoliaProvider.getTransactionReceipt(SOURCE_TX_HASH);
  if (!receipt) throw new Error("Source TX not found or not yet confirmed");

  const log = receipt.logs.find(l => l.topics[0] === PACKET_SENT_TOPIC);
  if (!log) throw new Error("PacketSent event not found in source TX");

  const [encodedPacket] = ethers.AbiCoder.defaultAbiCoder().decode(
    ["bytes", "bytes", "address"], log.data
  );

  const pkt = parsePacket(encodedPacket);
  console.log("   nonce  :", pkt.nonce.toString());
  console.log("   srcEid :", pkt.srcEid);
  console.log("   dstEid :", pkt.dstEid);
  console.log("   guid   :", pkt.guid);
  console.log("   message:", pkt.msg);

  // 2. Verify against endpoint's stored hash
  console.log("\n2. Checking stored payload hash on Base Sepolia...");
  const endpoint = new ethers.Contract(LZ_ENDPOINT, ENDPOINT_ABI, deployer);
  const senderBytes32 = ethers.zeroPadValue(SOURCE_BRIDGE, 32);

  const stored = await endpoint.inboundPayloadHash(DST_BRIDGE, SRC_EID, senderBytes32, pkt.nonce);
  const expected = ethers.keccak256(ethers.concat([ethers.getBytes(pkt.guid), ethers.getBytes(pkt.msg)]));
  console.log("   Stored  :", stored);
  console.log("   Expected:", expected);

  if (stored === ethers.ZeroHash) {
    console.log("   ℹ  Hash is zero — may already be delivered or not yet committed");
    return;
  }
  if (stored.toLowerCase() !== expected.toLowerCase()) {
    console.error("   ✗ Hash mismatch — packet bytes differ from stored hash. Cannot retry.");
    return;
  }
  console.log("   ✓ Hash matches — safe to retry with 600k gas");

  // 3. Retry using Hardhat signer (same approach that worked for nonces 5-7)
  console.log("\n3. Calling endpoint.lzReceive with 600k gas (Hardhat signer)...");
  try {
    const tx = await endpoint.lzReceive(
      { srcEid: SRC_EID, sender: senderBytes32, nonce: pkt.nonce },
      DST_BRIDGE,
      pkt.guid,
      pkt.msg,
      "0x",
      { gasLimit: 600_000n }
    );
    console.log("   tx:", tx.hash);
    const rec = await tx.wait();
    console.log("   status :", rec.status === 1 ? "✓ SUCCESS" : "✗ FAILED");
    console.log("   gasUsed:", rec.gasUsed.toString());

    if (rec.status === 1) {
      console.log("\n✓ Nonce", pkt.nonce.toString(), "delivered! gasUsed =", rec.gasUsed.toString());
      if (rec.gasUsed < 200_000n) {
        console.log("  ✓ Fits within 200k executor limit — future messages will auto-deliver");
      } else {
        console.log("  ✗ Still exceeds 200k — executor will keep failing for new messages");
      }
    } else {
      console.error("\n✗ lzReceive reverted even with 600k gas — investigate contract state");
    }
  } catch (e) {
    const msg = e.message || "";
    if (msg.includes("PayloadVerificationFailed") || msg.includes("already") || msg.includes("delivered")) {
      console.log("   ℹ  Already delivered or payload mismatch");
    } else {
      throw e;
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
