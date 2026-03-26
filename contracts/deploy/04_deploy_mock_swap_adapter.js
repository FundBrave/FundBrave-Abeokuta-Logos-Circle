/**
 * 04_deploy_mock_swap_adapter.js
 *
 * Deploys MockSwapAdapter on Base Sepolia (testnet only), funds it with test USDC,
 * proposes it as the new swap adapter on AbeokutaCampaign, then skips the 48h
 * timelock using evm_increaseTime so ETH/ERC20 donations work immediately.
 *
 * Usage:
 *   npx hardhat run deploy/04_deploy_mock_swap_adapter.js --network baseSepolia
 */

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_PATH = path.join(__dirname, "../deployments/84532.json");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const deployment = JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, "utf8"));
  const campaignAddr = deployment.AbeokutaCampaign;
  const usdcAddr     = deployment.USDC;

  console.log("Campaign:", campaignAddr);
  console.log("USDC:    ", usdcAddr);

  // 1. Deploy MockSwapAdapter (reuse if already deployed)
  const EXISTING_MOCK_ADAPTER = deployment.MockSwapAdapter;
  let mockAdapterAddr, mockAdapter;
  if (EXISTING_MOCK_ADAPTER) {
    console.log("\n1. Reusing existing MockSwapAdapter:", EXISTING_MOCK_ADAPTER);
    mockAdapterAddr = EXISTING_MOCK_ADAPTER;
    mockAdapter = await ethers.getContractAt(
      ["function fund(uint256 amount) external"],
      mockAdapterAddr
    );
  } else {
    console.log("\n1. Deploying MockSwapAdapter...");
    const MockSwapAdapter = await ethers.getContractFactory("MockSwapAdapter");
    const deployed = await MockSwapAdapter.deploy(usdcAddr);
    await deployed.waitForDeployment();
    mockAdapterAddr = await deployed.getAddress();
    mockAdapter = deployed;
    console.log("   MockSwapAdapter:", mockAdapterAddr);
  }

  // Helper: pass a callback receiving the current nonce, send, wait, then increment.
  let nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
  const send = async (fn) => {
    const tx = await fn(nonce);
    nonce++;
    await tx.wait();
  };

  // 2. Mint test USDC to deployer and fund the adapter (so swaps have USDC to send back)
  console.log("\n2. Funding MockSwapAdapter with 10,000 test USDC...");
  const MockUSDC = await ethers.getContractAt(
    ["function mint(address to, uint256 amount) external",
     "function approve(address spender, uint256 amount) external returns (bool)"],
    usdcAddr
  );
  const fundAmount = 10_000n * 1_000_000n; // 10,000 USDC
  await send(n => MockUSDC.mint(deployer.address, fundAmount, { nonce: n }));
  await send(n => MockUSDC.approve(mockAdapterAddr, fundAmount, { nonce: n }));
  await send(n => mockAdapter.fund(fundAmount, { nonce: n }));
  console.log("   Funded with 10,000 USDC");

  // 3. Propose the new swap adapter (triggers 48h timelock)
  console.log("\n3. Proposing MockSwapAdapter on campaign (48h timelock)...");
  const campaign = await ethers.getContractAt(
    ["function proposeSwapAdapter(address _swap) external",
     "function activateSwapAdapter() external",
     "function swapAdapterActivationTime() view returns (uint256)"],
    campaignAddr
  );
  await send(n => campaign.proposeSwapAdapter(mockAdapterAddr, { nonce: n }));
  console.log("   Proposed. Activation time:", Number(await campaign.swapAdapterActivationTime()));

  // 4. Skip 48 hours on testnet (evm_increaseTime + evm_mine)
  // This only works if the node supports debug methods; falls through gracefully if not.
  console.log("\n4. Attempting to fast-forward 48h on testnet...");
  try {
    await ethers.provider.send("evm_increaseTime", [48 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine", []);
    console.log("   Time advanced.");

    // 5. Activate the adapter
    console.log("\n5. Activating MockSwapAdapter...");
    nonce = await ethers.provider.getTransactionCount(deployer.address, "pending");
    await send(n => campaign.activateSwapAdapter({ nonce: n }));
    console.log("   Active!");
  } catch {
    console.log("   evm_increaseTime not supported on this node.");
    console.log("   Wait 48h then run: npx hardhat run deploy/05_activate_swap_adapter.js --network baseSepolia");
    // Write a helper script for later activation
    const activateScript = `const { ethers } = require("hardhat");
async function main() {
  const campaign = await ethers.getContractAt(
    ["function activateSwapAdapter() external"],
    "${campaignAddr}"
  );
  await (await campaign.activateSwapAdapter()).wait();
  console.log("MockSwapAdapter activated!");
}
main().catch(e => { console.error(e); process.exit(1); });
`;
    require("fs").writeFileSync(require("path").join(__dirname, "05_activate_swap_adapter.js"), activateScript);
    console.log("   05_activate_swap_adapter.js written for later use.");
  }

  // 6. Save to deployments
  deployment.MockSwapAdapter = mockAdapterAddr;
  deployment.SwapAdapter = mockAdapterAddr;
  fs.writeFileSync(DEPLOYMENTS_PATH, JSON.stringify(deployment, null, 2));
  console.log("\nDeployments updated:", DEPLOYMENTS_PATH);
  console.log("\nDone. ETH and ERC20 donations now route through MockSwapAdapter.");
}

main().catch((err) => { console.error(err); process.exit(1); });
