/**
 * 09_retry_lz_message.js
 *
 * Manually retries a failed LayerZero V2 message.
 *
 * When an executor simulation reverts, the packet hash is committed on the
 * destination endpoint but lzReceive was never called on-chain. Anyone can
 * call ILayerZeroEndpointV2.lzReceive() with the original packet to execute it.
 *
 * Steps:
 *   1. Decode the PacketSent event from the source TX (Ethereum Sepolia)
 *      to recover the raw `message` bytes
 *   2. Call endpoint.lzReceive() on Base Sepolia with those bytes
 *
 * Usage:
 *   npx hardhat run deploy/09_retry_lz_message.js --network baseSepolia
 */

const { ethers } = require("hardhat");

// ─── Config ────────────────────────────────────────────────────────────────────

// The source transaction that created the stuck message
const SOURCE_TX_HASH = "0xec7332bb55a4e2a85a5bae4d42704f95e1d96b1acb50430ceb60030fa8f88f73";

// LayerZero V2 endpoint — read from FundBraveBridge.endpoint() on Base Sepolia
const LZ_ENDPOINT_TESTNET = "0x6EDCE65403992e310A62460808c4b910D972f10f";

// From LayerZero scan
const SRC_EID         = 40161;  // Ethereum Sepolia
const DST_BRIDGE      = "0xb3C210cB2075e72B10f00c41e30120480017a136"; // Base Sepolia FundBraveBridge
const SOURCE_BRIDGE   = "0xbf07FCC10F057E897B2e67982d990701E7434e50"; // Ethereum Sepolia FundBraveBridge
const GUID            = "0x3f1383ea6457a300deb7a2d08b59bb231c651f06800c74ee65fc534092d6e569";
const NONCE           = 3n;

// Ethereum Sepolia public RPC (for reading source TX)
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

// PacketSent event topic (LZ V2 endpoint emits this)
const PACKET_SENT_TOPIC = ethers.id("PacketSent(bytes,bytes,address)");

// ─── LZ V2 Endpoint ABI (full JSON to avoid ethers v6 tuple encoding bugs) ────

const ENDPOINT_ABI = [
  {
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
  },
  {
    name: "lzReceive",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "_origin",
        type: "tuple",
        components: [
          { name: "srcEid", type: "uint32"  },
          { name: "sender", type: "bytes32" },
          { name: "nonce",  type: "uint64"  },
        ],
      },
      { name: "_receiver",  type: "address" },
      { name: "_guid",      type: "bytes32" },
      { name: "_message",   type: "bytes"   },
      { name: "_extraData", type: "bytes"   },
    ],
    outputs: [],
  },
];

// ─── Packet parsing ────────────────────────────────────────────────────────────

/**
 * LZ V2 packet layout (PacketSent encodedPacket):
 *   version  : uint8  (1 byte)  — always 1
 *   nonce    : uint64 (8 bytes)
 *   srcEid   : uint32 (4 bytes)
 *   sender   : bytes32 (32 bytes)
 *   dstEid   : uint32 (4 bytes)
 *   receiver : bytes32 (32 bytes)
 *   guid     : bytes32 (32 bytes)
 *   message  : bytes  (remaining)
 *
 * Total header = 1 + 8 + 4 + 32 + 4 + 32 = 81 bytes
 * guid starts at byte 81, message starts at byte 113
 */
function parsePacket(encodedPacket) {
  const buf = Buffer.from(encodedPacket.slice(2), "hex");
  const version  = buf[0];
  const nonce    = buf.readBigUInt64BE(1);
  const srcEid   = buf.readUInt32BE(9);
  const sender   = "0x" + buf.slice(13, 45).toString("hex");
  const dstEid   = buf.readUInt32BE(45);
  const receiver = "0x" + buf.slice(49, 81).toString("hex");
  const guid     = "0x" + buf.slice(81, 113).toString("hex");
  const message  = "0x" + buf.slice(113).toString("hex");

  return { version, nonce, srcEid, sender, dstEid, receiver, guid, message };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // 1. Fetch PacketSent event from source TX on Ethereum Sepolia
  console.log("\n1. Fetching source TX from Ethereum Sepolia...");
  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const receipt = await sepoliaProvider.getTransactionReceipt(SOURCE_TX_HASH);
  if (!receipt) throw new Error("Source TX not found");
  console.log("   Source TX confirmed in block", receipt.blockNumber);

  const packetLog = receipt.logs.find(l => l.topics[0] === PACKET_SENT_TOPIC);
  if (!packetLog) throw new Error("PacketSent event not found in source TX logs");

  const [encodedPacket] = ethers.AbiCoder.defaultAbiCoder().decode(
    ["bytes", "bytes", "address"],
    packetLog.data
  );

  const pkt = parsePacket(encodedPacket);
  console.log("   Parsed packet:");
  console.log(`     version : ${pkt.version}`);
  console.log(`     nonce   : ${pkt.nonce}`);
  console.log(`     srcEid  : ${pkt.srcEid}`);
  console.log(`     dstEid  : ${pkt.dstEid}`);
  console.log(`     guid    : ${pkt.guid}`);
  console.log(`     message : ${pkt.message}`);

  // Sanity checks
  if (pkt.nonce !== NONCE)  console.warn(`⚠  Nonce mismatch: got ${pkt.nonce}, expected ${NONCE}`);
  if (pkt.guid.toLowerCase() !== GUID.toLowerCase()) console.warn(`⚠  GUID mismatch`);

  // 2. Check if the packet hash is stored on Base Sepolia endpoint
  console.log("\n2. Checking endpoint state on Base Sepolia...");
  const endpoint = new ethers.Contract(LZ_ENDPOINT_TESTNET, ENDPOINT_ABI, deployer);

  const senderBytes32 = ethers.zeroPadValue(SOURCE_BRIDGE, 32);
  let storedHash;
  try {
    storedHash = await endpoint.inboundPayloadHash(DST_BRIDGE, SRC_EID, senderBytes32, NONCE);
    console.log("   Stored payload hash:", storedHash);
    const expectedHash = ethers.keccak256(
      ethers.concat([ethers.getBytes(GUID), ethers.getBytes(pkt.message)])
    );
    console.log("   Expected hash      :", expectedHash);
    if (storedHash === ethers.ZeroHash) {
      console.log("   ⚠  Hash is zero — packet may not be committed or already executed");
    } else if (storedHash.toLowerCase() === expectedHash.toLowerCase()) {
      console.log("   ✓ Hash matches — safe to retry");
    } else {
      console.warn("   ⚠  Hash mismatch — message bytes may differ from what endpoint expects");
    }
  } catch (e) {
    console.warn("   Could not read inboundPayloadHash:", e.message);
  }

  // 3. Encode calldata manually and send via raw transaction (bypasses Hardhat signer quirks)
  console.log("\n3. Encoding lzReceive calldata...");

  const iface = new ethers.Interface(ENDPOINT_ABI);
  const origin = {
    srcEid:  SRC_EID,
    sender:  senderBytes32,
    nonce:   NONCE,
  };
  const calldata = iface.encodeFunctionData("lzReceive", [
    origin,
    DST_BRIDGE,
    GUID,
    pkt.message,
    "0x",
  ]);
  console.log("   Calldata length:", calldata.length);
  console.log("   Selector:", calldata.slice(0, 10));

  // Use a raw ethers Wallet to avoid any Hardhat provider ABI stripping
  const HARDHAT_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!HARDHAT_PRIVATE_KEY) throw new Error("Set DEPLOYER_PRIVATE_KEY or PRIVATE_KEY env var");

  const baseProvider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const wallet = new ethers.Wallet(HARDHAT_PRIVATE_KEY, baseProvider);

  const rawTx = await wallet.sendTransaction({
    to:       LZ_ENDPOINT_TESTNET,
    data:     calldata,
    gasLimit: 500_000n,
  });
  console.log("   tx:", rawTx.hash);
  const rec = await rawTx.wait();
  console.log("   status:", rec.status === 1 ? "✓ success" : "✗ FAILED");
  console.log("   logs:", rec.logs.length);
  console.log("   gasUsed:", rec.gasUsed.toString());

  if (rec.status === 1) {
    console.log("\n✓ Message retried. Check campaign donation count.");
  } else {
    console.error("\n✗ lzReceive reverted. The endpoint may require executor permissions.");
    console.log("  → Try clicking the 'Execute' button on:");
    console.log("    https://testnet.layerzeroscan.com/tx/" + SOURCE_TX_HASH);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
