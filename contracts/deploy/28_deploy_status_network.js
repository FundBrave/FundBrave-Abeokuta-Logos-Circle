/**
 * Deploy Abeokuta Mini on Status Network Testnet (chain ID: 1660990954)
 *
 * Status Network testnet does not yet have:
 *   - Native USDC     → we deploy MockUSDC
 *   - Aave V3         → AbeokutaStaking is SKIPPED
 *   - LayerZero V2    → AbeokutaBridgeReceiver is SKIPPED
 *
 * What gets deployed:
 *   1. MockUSDC      — mintable test stablecoin
 *   2. AbeokutaCampaign — direct USDC donations (no swap adapter, no bridge)
 *
 * Usage:
 *   npx hardhat run deploy/28_deploy_status_network.js --network statusNetworkTestnet
 *
 * After deployment:
 *   - Update frontend/.env.local with NEXT_PUBLIC_STATUS_CAMPAIGN_ADDRESS
 *   - Update frontend/.env.local with NEXT_PUBLIC_STATUS_USDC_ADDRESS
 *   - When LayerZero is available on Status Network, deploy FundBraveBridge and
 *     set NEXT_PUBLIC_BRIDGE_STATUS_ADDRESS to enable cross-chain donations
 */

const { ethers } = require("hardhat");
const fs   = require("fs");
const path = require("path");

const CHAIN_ID = 1660990954;

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();

  if (Number(chainId) !== CHAIN_ID) {
    throw new Error(
      `Wrong network. Expected Status Network Testnet (${CHAIN_ID}), got ${chainId}.\n` +
      `Run with: npx hardhat run deploy/28_deploy_status_network.js --network statusNetworkTestnet`
    );
  }

  const treasury = process.env.TREASURY_MULTISIG || deployer.address;

  console.log(`\n============================================`);
  console.log(`Deploying to: Status Network Testnet`);
  console.log(`Deployer:     ${deployer.address}`);
  console.log(`Treasury:     ${treasury}`);
  console.log(`============================================\n`);

  // ── 1. Deploy MockUSDC ──────────────────────────────────────────────────────
  console.log("1. Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUsdc = await MockUSDC.deploy(deployer.address);
  await mockUsdc.waitForDeployment();
  const usdcAddress = await mockUsdc.getAddress();
  console.log(`   MockUSDC deployed: ${usdcAddress}`);

  // ── 2. Deploy AbeokutaCampaign ──────────────────────────────────────────────
  // No swap adapter (no DEX on Status Network testnet) → ZeroAddress
  const USDC_DECIMALS = 6;
  const goalMin    = BigInt(1_000) * BigInt(10 ** USDC_DECIMALS);  // $1,000
  const goalMax    = BigInt(2_500) * BigInt(10 ** USDC_DECIMALS);  // $2,500
  const deadlineTs = Math.floor(Date.now() / 1000) + 60 * 86400;  // 60 days

  console.log("2. Deploying AbeokutaCampaign...");
  const CampaignFactory = await ethers.getContractFactory("AbeokutaCampaign");
  const campaign = await CampaignFactory.deploy(
    usdcAddress,
    ethers.ZeroAddress,  // no swap adapter — only direct USDC donations
    treasury,
    goalMin,
    goalMax,
    deadlineTs
  );
  await campaign.waitForDeployment();
  const campaignAddress = await campaign.getAddress();
  console.log(`   AbeokutaCampaign deployed: ${campaignAddress}`);

  // ── 3. Mint test USDC to deployer for testing ───────────────────────────────
  const mintAmount = BigInt(10_000) * BigInt(10 ** USDC_DECIMALS);  // 10,000 USDC
  await (await mockUsdc.mint(deployer.address, mintAmount)).wait();
  console.log(`\n   Minted 10,000 test USDC to deployer (${deployer.address})`);

  // ── 4. Save deployment output ────────────────────────────────────────────────
  const output = {
    network:          "Status Network Testnet",
    chainId:          CHAIN_ID,
    deployedAt:       new Date().toISOString(),
    AbeokutaCampaign: campaignAddress,
    MockUSDC:         usdcAddress,
    Treasury:         treasury,
    Deployer:         deployer.address,
    GoalMinUSDC:      1_000,
    GoalMaxUSDC:      2_500,
    DeadlineTs:       deadlineTs,
    notes: [
      "AbeokutaStaking NOT deployed — Aave V3 not available on Status Network testnet",
      "AbeokutaBridgeReceiver NOT deployed — LayerZero V2 not available on Status Network testnet",
      "Only direct USDC donations are supported on this deployment",
    ],
  };

  const outDir  = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${CHAIN_ID}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nDeployment saved to: ${outFile}`);

  // ── 5. Summary ───────────────────────────────────────────────────────────────
  console.log(`\n============================================`);
  console.log(`Deployment complete!`);
  console.log(`--------------------------------------------`);
  console.log(`AbeokutaCampaign: ${campaignAddress}`);
  console.log(`MockUSDC:         ${usdcAddress}`);
  console.log(`============================================\n`);
  console.log(`Next steps:`);
  console.log(`  1. Add to frontend/.env.local:`);
  console.log(`     NEXT_PUBLIC_STATUS_CAMPAIGN_ADDRESS=${campaignAddress}`);
  console.log(`     NEXT_PUBLIC_STATUS_USDC_ADDRESS=${usdcAddress}`);
  console.log(`  2. Verify on Blockscout:`);
  console.log(`     npx hardhat verify --network statusNetworkTestnet ${usdcAddress} "${deployer.address}"`);
  console.log(`     npx hardhat verify --network statusNetworkTestnet ${campaignAddress} "${usdcAddress}" "${ethers.ZeroAddress}" "${treasury}" "${goalMin}" "${goalMax}" "${deadlineTs}"`);
  console.log(`  3. Get test ETH: https://faucet.status.network`);
  console.log(`     (Bridge Sepolia ETH → Status Network via https://bridge.status.network)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
