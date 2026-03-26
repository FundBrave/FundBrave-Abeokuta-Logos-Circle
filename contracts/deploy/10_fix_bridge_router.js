/**
 * 10_fix_bridge_router.js
 *
 * Root cause of "Router execution failed":
 *   1. FundBraveBridge.bridgeRouter is set (0xA477535A…)
 *   2. FundBraveBridge.eidToChainId[40161] = 0 → sourceChainId falls back to raw EID 40161
 *   3. BridgeRouter.supportedChains[40161].supported = false → UnsupportedChain() revert
 *   4. Furthermore, BridgeRouter.fundraiserFactory = 0xb89D603… (wrong contract, not OldReceiver)
 *
 * Fix: Disable BridgeRouter on FundBraveBridge by setting it to address(0).
 *   → _lzReceive takes the direct path: safeTransfer USDC to OldReceiver, then calls
 *     handleCrossChainDonation on OldReceiver (which already points to NewCampaign).
 *
 * Usage:
 *   npx hardhat run deploy/10_fix_bridge_router.js --network baseSepolia
 */

const { ethers } = require("hardhat");

const BRIDGE = "0xb3C210cB2075e72B10f00c41e30120480017a136";

const BRIDGE_ABI = [
  "function bridgeRouter() view returns (address)",
  "function localFundraiserFactory() view returns (address)",
  "function setBridgeRouter(address _router) external",
  "function owner() view returns (address)",
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const bridge = await ethers.getContractAt(BRIDGE_ABI, BRIDGE, deployer);

  const currentRouter  = await bridge.bridgeRouter();
  const currentFactory = await bridge.localFundraiserFactory();
  const owner          = await bridge.owner();

  console.log("\nFundBraveBridge state:");
  console.log("  bridgeRouter:          ", currentRouter);
  console.log("  localFundraiserFactory:", currentFactory);
  console.log("  owner:                 ", owner);

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    throw new Error(`Deployer (${deployer.address}) is not the owner (${owner})`);
  }

  if (currentRouter === ethers.ZeroAddress) {
    console.log("\n✓ bridgeRouter is already address(0) — nothing to do.");
    return;
  }

  console.log("\nCalling setBridgeRouter(address(0))...");
  const tx = await bridge.setBridgeRouter(ethers.ZeroAddress);
  console.log("  tx:", tx.hash);
  await tx.wait();

  const newRouter = await bridge.bridgeRouter();
  if (newRouter === ethers.ZeroAddress) {
    console.log("  ✓ bridgeRouter cleared — direct factory path active");
  } else {
    console.error("  ✗ Still set to:", newRouter);
    process.exit(1);
  }

  console.log("\n✓ Done. Incoming LZ messages will now go:");
  console.log("  FundBraveBridge._lzReceive");
  console.log("    → safeTransfer USDC to OldReceiver  (", currentFactory.slice(0, 10), "…)");
  console.log("    → OldReceiver.handleCrossChainDonation");
  console.log("      → NewCampaign.creditDonation");
}

main().catch(e => { console.error(e); process.exit(1); });
