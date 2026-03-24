/**
 * Completes a partial deployment by deploying AbeokutaBridgeReceiver
 * and wiring all three contracts together.
 *
 * Usage:
 *   npx hardhat run deploy/02_complete_deployment.js --network baseSepolia
 *
 * Set these env vars before running:
 *   CAMPAIGN_ADDRESS  — already-deployed AbeokutaCampaign
 *   STAKING_ADDRESS   — already-deployed AbeokutaStaking
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const campaignAddress = process.env.CAMPAIGN_ADDRESS;
  const stakingAddress  = process.env.STAKING_ADDRESS;
  const usdcAddress     = process.env.USDC_ADDRESS || "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE";
  const bridgeAddress   = process.env.BRIDGE_ADDRESS || ethers.ZeroAddress;

  if (!campaignAddress || !stakingAddress) {
    throw new Error("Set CAMPAIGN_ADDRESS and STAKING_ADDRESS env vars");
  }

  console.log(`\nCompleting deployment on chain ${chainId}`);
  console.log(`Deployer:  ${deployer.address}`);
  console.log(`Campaign:  ${campaignAddress}`);
  console.log(`Staking:   ${stakingAddress}\n`);

  // Fetch current nonce explicitly to avoid stale-nonce issues with public RPCs
  const startNonce = await ethers.provider.getTransactionCount(deployer.address, "latest");
  console.log(`Starting nonce: ${startNonce}`);

  // ── Deploy AbeokutaBridgeReceiver ─────────────────────────────────────────
  console.log("Deploying AbeokutaBridgeReceiver...");
  const ReceiverFactory = await ethers.getContractFactory("AbeokutaBridgeReceiver");
  const receiver = await ReceiverFactory.deploy(
    usdcAddress,
    campaignAddress,
    bridgeAddress,
    { nonce: startNonce }
  );
  await receiver.waitForDeployment();
  const receiverAddress = await receiver.getAddress();
  console.log(`  AbeokutaBridgeReceiver: ${receiverAddress}`);
  if (bridgeAddress === ethers.ZeroAddress) {
    console.log("  ⚠  Bridge address is zero — call receiver.setBridge() after FundBraveBridge deploy.");
  }

  // ── Wire contracts ─────────────────────────────────────────────────────────
  const campaign = await ethers.getContractAt("AbeokutaCampaign", campaignAddress);

  console.log("\nWiring contracts...");
  const nonce2 = await ethers.provider.getTransactionCount(deployer.address, "latest");
  const tx1 = await campaign.setStakingPool(stakingAddress, { nonce: nonce2 });
  await tx1.wait();
  console.log(`  campaign.setStakingPool(${stakingAddress}) ✓`);

  const nonce3 = await ethers.provider.getTransactionCount(deployer.address, "latest");
  const tx2 = await campaign.setBridgeContract(receiverAddress, { nonce: nonce3 });
  await tx2.wait();
  console.log(`  campaign.setBridgeContract(${receiverAddress}) ✓`);

  // ── Save output ────────────────────────────────────────────────────────────
  const treasury = process.env.TREASURY_MULTISIG || deployer.address;
  const output = {
    network:                network.name,
    chainId,
    deployedAt:             new Date().toISOString(),
    AbeokutaCampaign:       campaignAddress,
    AbeokutaStaking:        stakingAddress,
    AbeokutaBridgeReceiver: receiverAddress,
    FundBraveBridge:        bridgeAddress,
    USDC:                   usdcAddress,
    Treasury:               treasury,
    Deployer:               deployer.address,
  };

  const outDir  = path.join(__dirname, "../deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
  console.log(`\nDeployment saved to: ${outFile}`);

  console.log(`\n========================================`);
  console.log(`Deployment complete!`);
  console.log(`----------------------------------------`);
  console.log(`AbeokutaCampaign:       ${campaignAddress}`);
  console.log(`AbeokutaStaking:        ${stakingAddress}`);
  console.log(`AbeokutaBridgeReceiver: ${receiverAddress}`);
  console.log(`========================================\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
