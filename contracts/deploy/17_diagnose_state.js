const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const CAMPAIGN = "0xE0ad5594028c4BA3be3a4E0d4657412AF184266d";
  const USDC     = "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE";
  const ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f";

  const bridge = await ethers.getContractAt([
    "function localFundraiserFactory() view returns (address)",
    "function bridgeRouter() view returns (address)",
    "function owner() view returns (address)",
  ], BRIDGE, deployer);

  const campaign = await ethers.getContractAt([
    "function bridgeContract() view returns (address)",
    "function stakingPool() view returns (address)",
    "function paused() view returns (bool)",
    "function deadline() view returns (uint256)",
  ], CAMPAIGN, deployer);

  const usdc = await ethers.getContractAt([
    "function balanceOf(address) view returns (uint256)",
  ], USDC, deployer);

  const [factory, router] = await Promise.all([bridge.localFundraiserFactory(), bridge.bridgeRouter()]);
  const [bc, isPaused, deadline] = await Promise.all([campaign.bridgeContract(), campaign.paused(), campaign.deadline()]);
  const [bridgeBal, campaignBal] = await Promise.all([usdc.balanceOf(BRIDGE), usdc.balanceOf(CAMPAIGN)]);

  // Also simulate calling handleCrossChainDonation to get the revert reason
  const DONOR   = "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e";
  const AMOUNT  = 100_000_000n; // 100 USDC
  const SRC_EID = 40161;
  const GUID    = ethers.ZeroHash;

  let simResult = "not tested";
  try {
    const camp = await ethers.getContractAt([
      "function handleCrossChainDonation(address,uint256,uint32,bytes32) external",
    ], CAMPAIGN, deployer);
    // This will revert because deployer != bridgeContract — tells us the check works
    await camp.handleCrossChainDonation.staticCall(DONOR, AMOUNT, SRC_EID, GUID);
    simResult = "SUCCESS (unexpected)";
  } catch (e) {
    simResult = e.message?.slice(0, 200) || "revert";
  }

  // Simulate from bridge's perspective (impersonate bridge)
  let bridgeSimResult = "not tested";
  try {
    await ethers.provider.send("hardhat_impersonateAccount", [BRIDGE]);
    const bridgeSigner = await ethers.getSigner(BRIDGE);
    const camp2 = await ethers.getContractAt([
      "function handleCrossChainDonation(address,uint256,uint32,bytes32) external",
    ], CAMPAIGN, bridgeSigner);
    await camp2.handleCrossChainDonation.staticCall(DONOR, AMOUNT, SRC_EID, GUID);
    bridgeSimResult = "SUCCESS ✓";
  } catch (e) {
    bridgeSimResult = e.message?.slice(0, 200) || "revert";
  }

  console.log("=== Bridge ===");
  console.log("  localFundraiserFactory:", factory);
  console.log("  bridgeRouter:          ", router);
  console.log("  USDC balance:          ", (bridgeBal / 1_000_000n).toString(), "USDC");
  console.log("");
  console.log("=== Campaign ===");
  console.log("  bridgeContract:", bc);
  console.log("  paused:        ", isPaused);
  console.log("  deadline:      ", new Date(Number(deadline) * 1000).toISOString());
  console.log("  USDC balance:  ", (campaignBal / 1_000_000n).toString(), "USDC");
  console.log("");
  console.log("=== Checks ===");
  console.log("  factory == campaign:", factory.toLowerCase() === CAMPAIGN.toLowerCase() ? "✓" : `✗ points to ${factory}`);
  console.log("  bc == bridge:       ", bc.toLowerCase() === BRIDGE.toLowerCase() ? "✓" : `✗ points to ${bc}`);
  console.log("  router == zero:     ", router === ethers.ZeroAddress ? "✓" : `✗ ROUTER SET: ${router}`);
  console.log("");
  console.log("=== Simulation ===");
  console.log("  handleCrossChainDonation(from deployer):", simResult);
  console.log("  handleCrossChainDonation(from bridge):  ", bridgeSimResult);
}

main().catch(e => { console.error(e); process.exit(1); });
