/**
 * Configure LayerZero OApp peers across all three chains and fund Base Sepolia
 * bridge liquidity so it can pay out cross-chain donations.
 *
 * Run after deploying all source bridges:
 *   npx hardhat run deploy/03_configure_peers.js --network sepolia
 *   npx hardhat run deploy/03_configure_peers.js --network optimismSepolia
 *   npx hardhat run deploy/03_configure_peers.js --network baseSepolia
 *
 * On each chain this script:
 *   - Calls setPeer(remoteEid, bytes32(remoteBridge)) for every other chain.
 *     LayerZero will only deliver messages from registered peers — this is
 *     the primary cross-chain security gate.
 *
 * On Base Sepolia only:
 *   - Mints 10,000 mock USDC to the FundBraveBridge so it can pay out donations.
 *   - Registers EID 40232 → "optimism-sepolia" on AbeokutaBridgeReceiver
 *     (not in the default constructor mapping).
 */

const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

// ─── Known deployments ─────────────────────────────────────────────────────
// Base Sepolia values are fixed (deployed by 01_deploy_abeokuta.js).
// Source chain values are loaded from deployments/<chainId>.json at runtime.
const FIXED = {
  84532: {
    name:     "Base Sepolia",
    eid:      40245,
    bridge:   "0xb3C210cB2075e72B10f00c41e30120480017a136",
    usdc:     "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE",
    receiver: "0x47D884D6681986bF889D2ab3AA673d9Ded840817",
  },
};

const BRIDGE_ABI = [
  "function setPeer(uint32 _eid, bytes32 _peer) external",
  "function peers(uint32) view returns (bytes32)",
];

const USDC_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address) view returns (uint256)",
];

const RECEIVER_ABI = [
  "function setEidChainName(uint32 eid, string calldata name) external",
  "function eidToChainName(uint32) view returns (string)",
];

function addrToBytes32(addr) {
  return ethers.zeroPadValue(addr, 32);
}

function loadDeployments() {
  const dir = path.join(__dirname, "../deployments");
  const all = { ...FIXED };

  for (const file of fs.readdirSync(dir)) {
    const chainId = parseInt(file.replace(".json", ""), 10);
    if (FIXED[chainId]) continue; // skip base sepolia — already hardcoded
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      if (d.FundBraveBridge && d.eid) {
        all[chainId] = {
          name:    d.network,
          eid:     d.eid,
          bridge:  d.FundBraveBridge,
          usdc:    d.MockUSDC,
        };
      }
    } catch (_) {}
  }
  return all;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const chainIdNum  = Number(chainId);

  const deployments = loadDeployments();
  const thisDep     = deployments[chainIdNum];

  if (!thisDep) {
    throw new Error(
      `No deployment record for chainId ${chainIdNum}. ` +
      `Run 02_deploy_source_bridge.js on this chain first.`
    );
  }

  console.log(`\n=== Configuring peers on ${thisDep.name} ===`);
  console.log(`Bridge: ${thisDep.bridge}\n`);

  const bridge = await ethers.getContractAt(BRIDGE_ABI, thisDep.bridge, deployer);

  // ── Set OApp peers for every other known chain ────────────────────────────
  const others = Object.entries(deployments).filter(
    ([id]) => Number(id) !== chainIdNum
  );

  for (const [, remote] of others) {
    const peerBytes32 = addrToBytes32(remote.bridge);
    const existing    = await bridge.peers(remote.eid);

    if (existing.toLowerCase() === peerBytes32.toLowerCase()) {
      console.log(`  setPeer(eid=${remote.eid}, ${remote.name}) — already set ✓`);
      continue;
    }

    console.log(`  setPeer(eid=${remote.eid}, ${remote.bridge})  [${remote.name}]`);
    const tx = await bridge.setPeer(remote.eid, peerBytes32);
    await tx.wait();
    console.log(`    ✓`);
  }

  // ── Base Sepolia extras ───────────────────────────────────────────────────
  if (chainIdNum === 84532) {
    // Fund bridge USDC liquidity pool (needed to pay out incoming donations).
    // _lzReceive requires: require(balance >= amount, "Bridge Insufficient Liquidity")
    const LIQUIDITY = 10_000n * 10n ** 6n;
    console.log(`\n  Funding bridge with 10,000 USDC liquidity...`);
    const usdc    = await ethers.getContractAt(USDC_ABI, thisDep.usdc, deployer);
    const current = await usdc.balanceOf(thisDep.bridge);

    if (current >= LIQUIDITY) {
      console.log(`    Bridge already has ${ethers.formatUnits(current, 6)} USDC ✓`);
    } else {
      const toMint = LIQUIDITY - current;
      await (await usdc.mint(thisDep.bridge, toMint)).wait();
      const newBal = await usdc.balanceOf(thisDep.bridge);
      console.log(`    ✓ Bridge USDC balance: ${ethers.formatUnits(newBal, 6)} USDC`);
    }

    // Register Optimism Sepolia EID → chain name (not in default constructor map).
    const opSep = deployments[11155420];
    if (opSep) {
      console.log(`\n  Registering EID 40232 → "optimism-sepolia" on BridgeReceiver...`);
      const receiver = await ethers.getContractAt(
        RECEIVER_ABI, thisDep.receiver, deployer
      );
      const existing = await receiver.eidToChainName(40232);
      if (existing === "optimism-sepolia") {
        console.log(`    Already set ✓`);
      } else {
        await (await receiver.setEidChainName(40232, "optimism-sepolia")).wait();
        console.log(`    ✓ EID 40232 → "optimism-sepolia"`);
      }
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n  Registered peers on ${thisDep.name}:`);
  for (const [, remote] of others) {
    const peer = await bridge.peers(remote.eid);
    const ok   = peer !== ethers.zeroPadValue("0x", 32);
    console.log(`    EID ${remote.eid} (${remote.name}): ${ok ? "✓ set" : "✗ NOT SET"}`);
  }

  console.log(`\n=== Done — ${thisDep.name} ===\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
