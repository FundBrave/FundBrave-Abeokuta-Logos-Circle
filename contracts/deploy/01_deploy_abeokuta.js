/**
 * Abeokuta Mini — Deployment Script
 *
 * Deploys (on Base / Base Sepolia, the destination chain):
 *   1. AbeokutaCampaign
 *   2. AbeokutaStaking
 *   3. AbeokutaBridgeReceiver  ← new: receives cross-chain donations from LayerZero
 *   4. Wires all three together
 *
 * Network-specific addresses (Base Sepolia / Base Mainnet) are read from
 * environment variables — see .env.example for the full list.
 *
 * Usage:
 *   npx hardhat run deploy/01_deploy_abeokuta.js --network baseSepolia
 *   npx hardhat run deploy/01_deploy_abeokuta.js --network base
 *
 * Cross-chain setup after deployment:
 *   - Deploy FundBraveBridge on each source chain (Ethereum, Polygon, Arbitrum, Optimism)
 *   - Configure each source bridge with dstEid = Base EID and peer = this bridge address
 *   - Set AbeokutaBridgeReceiver as `localFundraiserFactory` on the Base FundBraveBridge
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ─── Network configuration ───────────────────────────────────────────────────

const CONFIG = {
  // Base Sepolia (testnet)
  84532: {
    name: "Base Sepolia",
    usdc:         "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE", // FundBrave mock USDC on testnet
    aavePool:     "0xA14694B3a1788D22c660C837842B2d22E24983B4",
    aUsdc:        "0xCdF55352fa73B548d81E57f2Ebb691462bD4a95F",
    swapAdapter:  "0x3b0D92907191f3a44FE2126e9F5A3D80603aAA16", // Existing FundBrave SwapAdapter
    // FundBraveBridge on Base Sepolia (receives LZ messages from source chains)
    // Set BRIDGE_ADDRESS env var after deploying/configuring FundBraveBridge on Base Sepolia
    bridgeAddress: process.env.BRIDGE_ADDRESS || ethers.ZeroAddress,
    // Campaign parameters
    goalMinUSDC:  1_000,   // $1,000
    goalMaxUSDC:  2_500,   // $2,500
    durationDays: 60,
  },
  // Base Mainnet
  8453: {
    name: "Base Mainnet",
    usdc:         "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Native USDC on Base
    aavePool:     "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5",
    aUsdc:        "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
    swapAdapter:  process.env.MAINNET_SWAP_ADAPTER || ethers.ZeroAddress,
    bridgeAddress: process.env.BRIDGE_ADDRESS || ethers.ZeroAddress,
    goalMinUSDC:  1_000,
    goalMaxUSDC:  2_500,
    durationDays: 60,
  },
  // Hardhat localhost (for quick local testing)
  31337: {
    name: "Hardhat",
    usdc:         null, // deployed by test setup
    aavePool:     null,
    aUsdc:        null,
    swapAdapter:  null,
    goalMinUSDC:  1_000,
    goalMaxUSDC:  2_500,
    durationDays: 60,
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const cfg = CONFIG[Number(chainId)];

  if (!cfg) {
    throw new Error(`No config for chain ${chainId}. Add it to CONFIG in the deploy script.`);
  }

  console.log(`\n========================================`);
  console.log(`Deploying Abeokuta Mini to: ${cfg.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`========================================\n`);

  // ── Treasury (Gnosis Safe multisig) ──────────────────────────────────────
  const treasury = process.env.TREASURY_MULTISIG;
  if (!treasury) {
    throw new Error(
      "TREASURY_MULTISIG env var not set. " +
      "Create a Gnosis Safe at https://safe.global and set its address."
    );
  }

  // ── Platform wallet ───────────────────────────────────────────────────────
  const platformWallet = process.env.PLATFORM_WALLET || deployer.address;
  console.log(`Treasury (Gnosis Safe): ${treasury}`);
  console.log(`Platform wallet:        ${platformWallet}\n`);

  // ── USDC / Aave addresses ─────────────────────────────────────────────────
  const usdcAddress     = cfg.usdc     || process.env.USDC_ADDRESS;
  const aaveAddress     = cfg.aavePool || process.env.AAVE_POOL_ADDRESS;
  const aUsdcAddress    = cfg.aUsdc    || process.env.AUSDC_ADDRESS;
  const swapAdapter     = cfg.swapAdapter || process.env.SWAP_ADAPTER;

  if (!usdcAddress || !aaveAddress || !aUsdcAddress) {
    throw new Error("Missing USDC/Aave addresses. Set them in .env or CONFIG.");
  }

  // SC-M5: Require swap adapter on mainnet — a zero address silently disables ERC20/ETH donations
  const isMainnet = Number(chainId) === 8453;
  if (isMainnet && (!swapAdapter || swapAdapter === ethers.ZeroAddress)) {
    throw new Error(
      "MAINNET_SWAP_ADAPTER env var is required for mainnet deployment. " +
      "Set it to the deployed UniswapAdapter or OneInchAdapter address."
    );
  }

  // SC-M6: Warn loudly if bridge address is zero — cross-chain donations will be disabled
  const bridgeAddress = cfg.bridgeAddress;
  if (!bridgeAddress || bridgeAddress === ethers.ZeroAddress) {
    if (isMainnet) {
      throw new Error(
        "BRIDGE_ADDRESS env var is required for mainnet deployment. " +
        "Deploy FundBraveBridge on Base first, then set BRIDGE_ADDRESS."
      );
    }
    console.warn(
      "⚠  BRIDGE_ADDRESS is not set. Cross-chain donations will be disabled until " +
      "receiver.setBridge(BRIDGE_ADDRESS) is called after FundBraveBridge is deployed."
    );
  }

  // ── Campaign parameters ───────────────────────────────────────────────────
  const USDC_DECIMALS  = 6;
  const goalMin        = BigInt(cfg.goalMinUSDC) * BigInt(10 ** USDC_DECIMALS);
  const goalMax        = BigInt(cfg.goalMaxUSDC) * BigInt(10 ** USDC_DECIMALS);
  const deadlineTs     = Math.floor(Date.now() / 1000) + cfg.durationDays * 86400;

  console.log(`Goal range: $${cfg.goalMinUSDC} – $${cfg.goalMaxUSDC} USDC`);
  console.log(`Deadline:   ${new Date(deadlineTs * 1000).toISOString()} (${cfg.durationDays} days)\n`);

  // ── 1. Deploy AbeokutaCampaign ────────────────────────────────────────────
  console.log("1. Deploying AbeokutaCampaign...");
  const CampaignFactory = await ethers.getContractFactory("AbeokutaCampaign");
  const campaign = await CampaignFactory.deploy(
    usdcAddress,
    swapAdapter || ethers.ZeroAddress,
    treasury,
    goalMin,
    goalMax,
    deadlineTs
  );
  await campaign.waitForDeployment();
  const campaignAddress = await campaign.getAddress();
  console.log(`   AbeokutaCampaign deployed: ${campaignAddress}`);

  // ── 2. Deploy AbeokutaStaking ─────────────────────────────────────────────
  console.log("2. Deploying AbeokutaStaking...");
  const StakingFactory = await ethers.getContractFactory("AbeokutaStaking");
  const staking = await StakingFactory.deploy(
    aaveAddress,
    usdcAddress,
    aUsdcAddress,
    campaignAddress,
    platformWallet
  );
  await staking.waitForDeployment();
  const stakingAddress = await staking.getAddress();
  console.log(`   AbeokutaStaking deployed:  ${stakingAddress}`);

  // ── 3. Deploy AbeokutaBridgeReceiver ─────────────────────────────────────
  console.log("3. Deploying AbeokutaBridgeReceiver...");
  const ReceiverFactory = await ethers.getContractFactory("AbeokutaBridgeReceiver");
  const receiver = await ReceiverFactory.deploy(
    usdcAddress,
    campaignAddress,
    bridgeAddress  // FundBraveBridge on Base (zero address if not yet deployed)
  );
  await receiver.waitForDeployment();
  const receiverAddress = await receiver.getAddress();
  console.log(`   AbeokutaBridgeReceiver deployed: ${receiverAddress}`);
  if (bridgeAddress === ethers.ZeroAddress) {
    console.log(`   ⚠  Bridge address is zero — call receiver.setBridge(BRIDGE_ADDRESS) after deploying FundBraveBridge.`);
  }

  // ── 4. Wire contracts ─────────────────────────────────────────────────────
  console.log("4. Configuring contract references...");

  const tx1 = await campaign.setStakingPool(stakingAddress);
  await tx1.wait();
  console.log(`   Campaign.setStakingPool(${stakingAddress}) ✓`);

  const tx2 = await campaign.setBridgeContract(receiverAddress);
  await tx2.wait();
  console.log(`   Campaign.setBridgeContract(${receiverAddress}) ✓`);

  // ── 5. Save deployment output ─────────────────────────────────────────────
  const output = {
    network:               cfg.name,
    chainId:               Number(chainId),
    deployedAt:            new Date().toISOString(),
    AbeokutaCampaign:      campaignAddress,
    AbeokutaStaking:       stakingAddress,
    AbeokutaBridgeReceiver: receiverAddress,
    FundBraveBridge:       bridgeAddress,
    USDC:                  usdcAddress,
    AavePool:              aaveAddress,
    aUSDC:                 aUsdcAddress,
    SwapAdapter:           swapAdapter || ethers.ZeroAddress,
    Treasury:              treasury,
    PlatformWallet:        platformWallet,
    Deployer:              deployer.address,
    GoalMinUSDC:           cfg.goalMinUSDC,
    GoalMaxUSDC:           cfg.goalMaxUSDC,
    DeadlineTs:            deadlineTs,
  };

  const outDir  = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${Number(chainId)}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nDeployment saved to: ${outFile}`);

  // ── 6. Summary ────────────────────────────────────────────────────────────
  console.log(`\n========================================`);
  console.log(`Deployment complete!`);
  console.log(`----------------------------------------`);
  console.log(`AbeokutaCampaign:       ${campaignAddress}`);
  console.log(`AbeokutaStaking:        ${stakingAddress}`);
  console.log(`AbeokutaBridgeReceiver: ${receiverAddress}`);
  console.log(`========================================\n`);

  console.log(`Next steps:`);
  console.log(`  1. Verify contracts on explorer:`);
  console.log(`     npx hardhat verify --network ${network.name} ${campaignAddress} "${usdcAddress}" "${swapAdapter}" "${treasury}" "${goalMin}" "${goalMax}" "${deadlineTs}"`);
  console.log(`     npx hardhat verify --network ${network.name} ${stakingAddress} "${aaveAddress}" "${usdcAddress}" "${aUsdcAddress}" "${campaignAddress}" "${platformWallet}"`);
  console.log(`     npx hardhat verify --network ${network.name} ${receiverAddress} "${usdcAddress}" "${campaignAddress}" "${bridgeAddress}"`);
  console.log(`  2. Cross-chain setup:`);
  console.log(`     a) Deploy FundBraveBridge on Base with localFundraiserFactory = ${receiverAddress}`);
  console.log(`     b) If bridge was not known at deploy time: receiver.setBridge(BRIDGE_ADDRESS)`);
  console.log(`     c) Deploy FundBraveBridge on each source chain (Ethereum, Polygon, Arbitrum, Optimism)`);
  console.log(`     d) Configure each source bridge: setPeer(BASE_EID, bytes32(BASE_BRIDGE_ADDRESS))`);
  console.log(`  3. Fund the treasury Gnosis Safe and add signers.`);
  console.log(`  4. Update frontend .env with the new contract addresses:\n`);
  console.log(`     NEXT_PUBLIC_CAMPAIGN_ADDRESS=${campaignAddress}`);
  console.log(`     NEXT_PUBLIC_STAKING_ADDRESS=${stakingAddress}`);
  console.log(`     NEXT_PUBLIC_BRIDGE_ADDRESS=<Base FundBraveBridge address>\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
