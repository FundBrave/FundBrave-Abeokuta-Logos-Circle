/**
 * 12_retry_stuck_messages.js
 *
 * Root cause: FundBraveBridge hardcodes gasLimit=200000 for donation actions.
 * Our _recordDonation pushes a 5-field struct to storage (~110k gas alone),
 * causing out-of-gas. Gas estimate: 328,203 vs executor limit 200,000.
 *
 * Fix for stuck messages: manually call endpoint.lzReceive with 600k gas.
 * The endpoint does NOT enforce the message's gasLimit option — that is only
 * a hint for the executor. Anyone can call lzReceive with custom gas.
 *
 * Usage:
 *   npx hardhat run deploy/12_retry_stuck_messages.js --network baseSepolia
 */
const { ethers } = require("hardhat");

const ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";
const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const SRC_BRIDGE_SEPOLIA = "0xbf07FCC10F057E897B2e67982d990701E7434e50";

// All stuck messages — add new ones as they arrive
const STUCK_MESSAGES = [
  {
    nonce: 8n,
    guid:    "0xcd63a7c54476d4874f768f1ec6d5c1008d90151c4ed168e72135e4a1f387fe12",
    payload: "0x000000000000000000000000396e931fad8c43c7200d70bbde91e962cfacca5e000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000005f5e100",
  },
];

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
    { name: "_message",   type: "bytes" },
    { name: "_extraData", type: "bytes" },
  ],
  outputs: [],
}];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const endpoint = new ethers.Contract(ENDPOINT, ENDPOINT_ABI, deployer);
  const senderBytes32 = ethers.zeroPadValue(SRC_BRIDGE_SEPOLIA, 32);

  for (const msg of STUCK_MESSAGES) {
    console.log(`\n── Retrying nonce ${msg.nonce} ──`);
    console.log("   GUID:", msg.guid);

    try {
      const tx = await endpoint.lzReceive(
        [40161, senderBytes32, msg.nonce],
        BRIDGE,
        msg.guid,
        msg.payload,
        "0x",
        { gasLimit: 600_000n }
      );
      console.log("   tx:", tx.hash);
      const receipt = await tx.wait();
      console.log("   status:", receipt.status === 1 ? "✓ SUCCESS" : "✗ FAILED");
      console.log("   gasUsed:", receipt.gasUsed.toString());
      if (receipt.status === 1) {
        console.log("   ✓ Nonce", msg.nonce.toString(), "delivered!");
      }
    } catch (e) {
      const msg2 = e.message || "";
      if (msg2.includes("PayloadVerificationFailed") || msg2.includes("hash") || msg2.includes("already") || msg2.includes("delivered") || msg2.includes("executed")) {
        console.log("   ℹ  Already delivered or hash mismatch — skip");
      } else {
        console.error("   ✗ Error:", msg2.slice(0, 200));
      }
    }
  }

  console.log("\n✓ Done.");
}
main().catch(e => { console.error(e); process.exit(1); });
