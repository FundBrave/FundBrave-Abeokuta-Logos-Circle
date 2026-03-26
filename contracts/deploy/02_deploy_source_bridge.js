/**
 * Deploy FundBraveBridge on source chains (Ethereum Sepolia, Optimism Sepolia)
 * for Abeokuta cross-chain donation testing.
 *
 * Uses pre-compiled artifacts from ../fundrave-contracts/artifacts/ — no
 * recompilation needed. The bytecode was built from the same Solidity source.
 *
 * Deploys per chain:
 *   1. MockERC20  — mintable "USDC" faucet on the source chain
 *   2. MockSwapAdapter — ISwapAdapter implementation (1:1 mock for testnet)
 *   3. FundBraveBridge — LayerZero V2 OApp that sends cross-chain messages
 *
 * Usage:
 *   npx hardhat run deploy/02_deploy_source_bridge.js --network sepolia
 *   npx hardhat run deploy/02_deploy_source_bridge.js --network optimismSepolia
 *
 * After both source chains are deployed, run:
 *   npx hardhat run deploy/03_configure_peers.js --network sepolia
 *   npx hardhat run deploy/03_configure_peers.js --network optimismSepolia
 *   npx hardhat run deploy/03_configure_peers.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

// ─── LayerZero V2 ─────────────────────────────────────────────────────────────
// EndpointV2 is deployed at the same address on every EVM chain via CREATE2.
const LZ_ENDPOINT = "0x6edce65403992e310a62460808c4b910d972f10f";

const CHAIN_CONFIG = {
  11155111: { name: "Ethereum Sepolia",  eid: 40161 },
  11155420: { name: "Optimism Sepolia",  eid: 40232 },
};

// ─── Pre-compiled artifact paths ─────────────────────────────────────────────
const ARTIFACTS_BASE = path.join(
  __dirname, "../../fundrave-contracts/artifacts/contracts"
);

function loadArtifact(relPath) {
  const fullPath = path.join(ARTIFACTS_BASE, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Artifact not found: ${fullPath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const cfg = CHAIN_CONFIG[Number(chainId)];

  if (!cfg) {
    throw new Error(
      `Chain ${chainId} not in CHAIN_CONFIG. ` +
      `Supported: 11155111 (sepolia), 11155420 (optimismSepolia).`
    );
  }

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`\n=== Deploying source bridge on ${cfg.name} (chainId ${chainId}) ===`);
  console.log(`Deployer: ${deployer.address}  (${ethers.formatEther(bal)} ETH)\n`);

  // ── Load pre-compiled artifacts ───────────────────────────────────────────
  const mockERC20Art  = loadArtifact("test/DeFiMocks.sol/MockERC20.json");
  const mockAdaptArt  = loadArtifact("mocks/MockSwapAdapter.sol/MockSwapAdapter.json");
  const bridgeArt     = loadArtifact("FundBraveBridge.sol/FundBraveBridge.json");

  // ── 1. Deploy MockERC20 (source-chain USDC) ───────────────────────────────
  console.log("1. Deploying MockERC20 (source-chain faucet USDC)...");
  const MockERC20Factory = new ethers.ContractFactory(
    mockERC20Art.abi, mockERC20Art.bytecode, deployer
  );
  const mockUsdc = await MockERC20Factory.deploy("Source USDC", "USDC", 6);
  await mockUsdc.waitForDeployment();
  const usdcAddr = await mockUsdc.getAddress();
  console.log(`   MockERC20 (USDC) deployed: ${usdcAddr}`);

  // Mint 100k USDC to deployer as a donor faucet
  const tx0 = await mockUsdc.mint(deployer.address, 100_000n * 10n ** 6n);
  await tx0.wait();
  console.log(`   Minted 100,000 USDC to deployer`);

  // ── 2. Deploy MockSwapAdapter ─────────────────────────────────────────────
  console.log("2. Deploying MockSwapAdapter...");
  const AdapterFactory = new ethers.ContractFactory(
    mockAdaptArt.abi, mockAdaptArt.bytecode, deployer
  );
  const adapter = await AdapterFactory.deploy(usdcAddr);
  await adapter.waitForDeployment();
  const adapterAddr = await adapter.getAddress();
  console.log(`   MockSwapAdapter deployed: ${adapterAddr}`);

  // ── 3. Deploy FundBraveBridge ─────────────────────────────────────────────
  // localFundraiserFactory = deployer.address — source-only chains don't handle
  // inbound LZ messages (no donations routed TO this chain), so this is unused
  // in practice but required non-zero by the constructor.
  console.log("3. Deploying FundBraveBridge...");
  const BridgeFactory = new ethers.ContractFactory(
    bridgeArt.abi, bridgeArt.bytecode, deployer
  );
  const bridge = await BridgeFactory.deploy(
    LZ_ENDPOINT,
    adapterAddr,
    usdcAddr,
    deployer.address,  // localFundraiserFactory (unused on source-only chain)
    deployer.address   // owner
  );
  await bridge.waitForDeployment();
  const bridgeAddr = await bridge.getAddress();
  console.log(`   FundBraveBridge deployed: ${bridgeAddr}`);

  // ── 4. Save deployment output ─────────────────────────────────────────────
  const output = {
    network:         cfg.name,
    chainId:         Number(chainId),
    eid:             cfg.eid,
    deployedAt:      new Date().toISOString(),
    FundBraveBridge: bridgeAddr,
    MockUSDC:        usdcAddr,
    MockSwapAdapter: adapterAddr,
    LZEndpoint:      LZ_ENDPOINT,
    Deployer:        deployer.address,
  };

  const outDir  = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${Number(chainId)}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nSaved to: ${outFile}`);

  console.log(`\n=== ${cfg.name} deployment complete ===`);
  console.log(`  FundBraveBridge: ${bridgeAddr}`);
  console.log(`  MockUSDC:        ${usdcAddr}`);
  console.log(`  MockSwapAdapter: ${adapterAddr}`);
  console.log(`\nRun deploy/03_configure_peers.js on all three chains next.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
