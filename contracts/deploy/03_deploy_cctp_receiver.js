/**
 * Deploy AbeokutaCCTPReceiver on Base mainnet and wire it to the existing campaign.
 *
 * This replaces FundBraveBridge (LayerZero) for cross-chain donations.
 * CCTP burns USDC on source chains and natively mints it on Base — no pre-funded
 * liquidity pool required.
 *
 * Prerequisites:
 *   - AbeokutaCampaign already deployed (address in deployments/8453.json)
 *   - DEPLOYER_PRIVATE_KEY in .env (must be campaign owner to call setBridgeContract)
 *
 * Usage:
 *   npx hardhat run deploy/03_deploy_cctp_receiver.js --network base
 *
 * After deployment:
 *   - Update frontend .env.local with NEXT_PUBLIC_CCTP_RECEIVER_ADDRESS
 *   - The old LayerZero bridge receiver is no longer authorised to creditDonation
 */

const { ethers, network } = require("hardhat");
const fs   = require("fs");
const path = require("path");

// ─── Chain config ─────────────────────────────────────────────────────────────

const CHAIN_CONFIG = {
  // Base mainnet
  8453: {
    name:               "Base Mainnet",
    usdc:               "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    // Circle's CCTP V1 MessageTransmitter on Base
    messageTransmitter: "0xAD09780d193884d503182aD4588450C416D6F9D4",
  },
  // Base Sepolia (for testing CCTP with Circle's testnet)
  84532: {
    name:               "Base Sepolia",
    usdc:               "0x036CbD53842c5426634e7929541eC2318f3dCF7e", // Circle's testnet USDC
    // Circle's CCTP V1 MessageTransmitter on Base Sepolia
    messageTransmitter: "0x7865fAfC2db2093669d92c0F33AeEF291086BEFD",
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const cfg = CHAIN_CONFIG[Number(chainId)];

  if (!cfg) {
    throw new Error(
      `Chain ${chainId} not configured. Supported: 8453 (Base), 84532 (Base Sepolia).`
    );
  }

  // ── Load existing deployment ────────────────────────────────────────────────
  const deploymentFile = path.join(__dirname, `../deployments/${Number(chainId)}.json`);
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(
      `No deployment file found at ${deploymentFile}. ` +
      `Deploy AbeokutaCampaign first via 01_deploy_abeokuta.js.`
    );
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const campaignAddress = deployment.AbeokutaCampaign;

  if (!campaignAddress || campaignAddress === ethers.ZeroAddress) {
    throw new Error("AbeokutaCampaign address missing from deployment file.");
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(` Deploying AbeokutaCCTPReceiver — ${cfg.name}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Deployer:            ${deployer.address}`);
  console.log(`AbeokutaCampaign:    ${campaignAddress}`);
  console.log(`USDC:                ${cfg.usdc}`);
  console.log(`MessageTransmitter:  ${cfg.messageTransmitter}\n`);

  // ── Deploy AbeokutaCCTPReceiver ─────────────────────────────────────────────
  console.log("[1/2] Deploying AbeokutaCCTPReceiver...");
  const ReceiverFactory = await ethers.getContractFactory("AbeokutaCCTPReceiver");
  const receiver = await ReceiverFactory.deploy(
    cfg.usdc,
    campaignAddress,
    cfg.messageTransmitter
  );
  await receiver.waitForDeployment();
  const receiverAddress = await receiver.getAddress();
  console.log(`✓ AbeokutaCCTPReceiver: ${receiverAddress}`);

  // ── Register receiver as the authorised bridge on the campaign ──────────────
  console.log("\n[2/2] Registering CCTP receiver as campaign bridge...");
  const campaignAbi = ["function setBridgeContract(address) external", "function owner() external view returns (address)"];
  const campaign = new ethers.Contract(campaignAddress, campaignAbi, deployer);

  const owner = await campaign.owner();
  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.error(`\n⚠  Deployer (${deployer.address}) is not the campaign owner (${owner}).`);
    console.error(`   Run this manually from the owner wallet:`);
    console.error(`   cast send ${campaignAddress} "setBridgeContract(address)" ${receiverAddress} --rpc-url https://mainnet.base.org --private-key $PRIVATE_KEY\n`);
  } else {
    // Check if we can use setBridgeContract (initial setup) or need proposeBridgeContract (timelock)
    const currentBridge = await campaign.callStatic?.bridgeContract?.() ||
      await (new ethers.Contract(campaignAddress, [
        "function bridgeContract() view returns (address)",
        "function pendingBridgeContract() view returns (address)",
      ], deployer)).bridgeContract();

    const proposalAbi = new ethers.Contract(campaignAddress, [
      "function bridgeContract() view returns (address)",
      "function pendingBridgeContract() view returns (address)",
      "function setBridgeContract(address) external",
      "function proposeBridgeContract(address) external",
      "function bridgeActivationTime() view returns (uint256)",
    ], deployer);

    const existing = await proposalAbi.bridgeContract();

    if (existing === ethers.ZeroAddress) {
      // Initial setup — use direct setBridgeContract
      const tx = await proposalAbi.setBridgeContract(receiverAddress);
      await tx.wait();
      console.log(`✓ campaign.setBridgeContract(${receiverAddress}) — CCTP receiver authorised immediately`);
    } else {
      // Bridge already set — use 48-hour timelock via proposeBridgeContract
      const pending = await proposalAbi.pendingBridgeContract();
      if (pending !== ethers.ZeroAddress && pending.toLowerCase() === receiverAddress.toLowerCase()) {
        const activationTime = await proposalAbi.bridgeActivationTime();
        const activationDate = new Date(Number(activationTime) * 1000).toISOString();
        console.log(`⏳ Proposal already pending. Activates: ${activationDate}`);
        console.log(`   After that, run: executeBridgeContract() on the campaign`);
      } else {
        const tx = await proposalAbi.proposeBridgeContract(receiverAddress);
        await tx.wait();
        const activationTime = await proposalAbi.bridgeActivationTime();
        const activationDate = new Date(Number(activationTime) * 1000).toISOString();
        console.log(`⏳ Bridge change proposed (48-hour timelock). Activates: ${activationDate}`);
        console.log(`   Run executeBridgeContract() after that timestamp.`);
      }
    }
  }

  // ── Save to deployment file ─────────────────────────────────────────────────
  deployment.AbeokutaCCTPReceiver = receiverAddress;
  deployment.CCTPMessageTransmitter = cfg.messageTransmitter;
  deployment.updatedAt = new Date().toISOString();
  fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
  console.log(`\n✓ Deployment file updated: ${deploymentFile}`);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(60)}`);
  console.log(` Done`);
  console.log(`${"=".repeat(60)}\n`);
  console.log(`Update your frontend .env.local:`);
  console.log(`  NEXT_PUBLIC_CCTP_RECEIVER_ADDRESS=${receiverAddress}\n`);
  console.log(`CCTP TokenMessenger addresses for the source chain frontend config:`);
  console.log(`  Ethereum:  0xBd3fa81B58Ba92a82136038B25aDec7066af3155`);
  console.log(`  Optimism:  0x2B4069517957735bE00ceE0fadAE88a26365528f`);
  console.log(`  Arbitrum:  0x19330d10D9Cc8751218eaf51E8885D058642E08A\n`);
  console.log(`Circle attestation API: https://iris-api.circle.com/v1/attestations/{messageHash}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
