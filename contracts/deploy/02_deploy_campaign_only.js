/**
 * Abeokuta Mini — Campaign-Only Redeploy Script
 *
 * Use this when AbeokutaCampaign needs to be redeployed (e.g., to add new functions)
 * WITHOUT redeploying AbeokutaStaking or AbeokutaBridgeReceiver.
 *
 * After this runs:
 *   1. Call existingReceiver.setCampaign(newCampaignAddress) to redirect cross-chain donations
 *   2. Update frontend/.env.local: NEXT_PUBLIC_CAMPAIGN_ADDRESS=<new>
 *   3. Update watcher/.env: CAMPAIGN_ADDRESS=<new>
 *
 * Required env vars (in contracts/.env):
 *   PRIVATE_KEY, TREASURY_MULTISIG, ALCHEMY_API_KEY
 *   EXISTING_RECEIVER  — AbeokutaBridgeReceiver address (to be authorized as bridge)
 *   WATCHER_ADDRESS    — watcher hot wallet (for creditBTCSolDonation)
 *   MAINNET_SWAP_ADAPTER — UniswapAdapterUSDC address (reuse existing, skip redeploy)
 *
 * Usage:
 *   npx hardhat run deploy/02_deploy_campaign_only.js --network base
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  if (chainId !== 8453) {
    throw new Error(`This script is for Base mainnet (8453) only. Got chainId=${chainId}`);
  }

  console.log(`\n========================================`);
  console.log(`Deploying AbeokutaCampaign (only) to Base mainnet`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`========================================\n`);

  const treasury = process.env.TREASURY_MULTISIG;
  if (!treasury) throw new Error("TREASURY_MULTISIG not set");

  const existingReceiver = process.env.EXISTING_RECEIVER;
  if (!existingReceiver) throw new Error("EXISTING_RECEIVER not set (AbeokutaBridgeReceiver address)");

  const watcherAddress = process.env.WATCHER_ADDRESS;
  if (!watcherAddress) throw new Error("WATCHER_ADDRESS not set");

  const swapAdapter = process.env.MAINNET_SWAP_ADAPTER;
  if (!swapAdapter) throw new Error("MAINNET_SWAP_ADAPTER not set (reuse existing UniswapAdapterUSDC)");

  const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const USDC_DECIMALS = 6;
  const goalMin = BigInt(1_000) * BigInt(10 ** USDC_DECIMALS);
  const goalMax = BigInt(2_500) * BigInt(10 ** USDC_DECIMALS);
  // Campaign deadline: 2026-06-12T00:30:50Z (matches original staking deadline)
  const deadlineTs = 1781224250;

  console.log(`USDC:             ${USDC}`);
  console.log(`SwapAdapter:      ${swapAdapter}`);
  console.log(`Treasury:         ${treasury}`);
  console.log(`GoalMin:          $1,000 USDC`);
  console.log(`GoalMax:          $2,500 USDC`);
  console.log(`Deadline:         ${new Date(deadlineTs * 1000).toISOString()}`);
  console.log(`ExistingReceiver: ${existingReceiver}`);
  console.log(`WatcherAddress:   ${watcherAddress}\n`);

  // 1. Deploy AbeokutaCampaign
  console.log("1. Deploying AbeokutaCampaign...");
  const CampaignFactory = await ethers.getContractFactory("AbeokutaCampaign");
  const campaign = await CampaignFactory.deploy(
    USDC,
    swapAdapter,
    treasury,
    goalMin,
    goalMax,
    deadlineTs
  );
  await campaign.waitForDeployment();
  const campaignAddress = await campaign.getAddress();
  console.log(`   AbeokutaCampaign deployed: ${campaignAddress}`);

  // 2. Wire: authorize existing receiver as bridge
  console.log("2. Wiring contracts...");
  const tx1 = await campaign.setBridgeContract(existingReceiver);
  await tx1.wait();
  console.log(`   campaign.setBridgeContract(${existingReceiver}) ✓`);

  // 3. Wire: authorize watcher for creditBTCSolDonation
  const tx2 = await campaign.setWatcher(watcherAddress);
  await tx2.wait();
  console.log(`   campaign.setWatcher(${watcherAddress}) ✓`);

  // 4. Save output
  const output = {
    network: "Base Mainnet",
    chainId,
    deployedAt: new Date().toISOString(),
    AbeokutaCampaign: campaignAddress,
    ExistingReceiver: existingReceiver,
    WatcherAddress: watcherAddress,
    SwapAdapter: swapAdapter,
    Treasury: treasury,
    USDC,
    GoalMinUSDC: 1000,
    GoalMaxUSDC: 2500,
    DeadlineTs: deadlineTs,
    Deployer: deployer.address,
  };

  const outDir = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${chainId}_campaign_v2.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nDeployment saved to: ${outFile}`);

  console.log(`\n========================================`);
  console.log(`Done! New AbeokutaCampaign: ${campaignAddress}`);
  console.log(`========================================\n`);

  console.log(`REQUIRED MANUAL STEP — run this cast command to redirect cross-chain donations:`);
  console.log(`  cast send ${existingReceiver} "setCampaign(address)" ${campaignAddress} \\`);
  console.log(`    --rpc-url https://base-mainnet.g.alchemy.com/v2/Y1tLHU15xch1CSkkNrbt7eZ-G7c7_7-I \\`);
  console.log(`    --private-key $PRIVATE_KEY\n`);

  console.log(`Then update env files:`);
  console.log(`  frontend/.env.local: NEXT_PUBLIC_CAMPAIGN_ADDRESS=${campaignAddress}`);
  console.log(`  watcher/.env:        CAMPAIGN_ADDRESS=${campaignAddress}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
