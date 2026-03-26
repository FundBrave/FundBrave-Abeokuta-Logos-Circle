/**
 * 18_simulate_call.js
 *
 * Uses eth_call with from=FundBraveBridge to simulate handleCrossChainDonation
 * and get the exact revert reason without spending gas.
 */

const { ethers } = require("hardhat");

const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const CAMPAIGN = "0xE0ad5594028c4BA3be3a4E0d4657412AF184266d";
const USDC     = "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE";
const DONOR    = "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e";
const AMOUNT   = 100_000_000n; // 100 USDC
const SRC_EID  = 40161;

async function main() {
  const provider = ethers.provider;

  // 1. Simulate handleCrossChainDonation from FundBraveBridge
  console.log("Simulating handleCrossChainDonation(from=bridge)...");

  const iface = new ethers.Interface([
    "function handleCrossChainDonation(address donor, uint256 amount, uint32 srcEid, bytes32 guid) external",
  ]);

  const calldata = iface.encodeFunctionData("handleCrossChainDonation", [
    DONOR, AMOUNT, SRC_EID, ethers.ZeroHash,
  ]);

  try {
    const result = await provider.call({
      from: BRIDGE,       // simulate as if FundBraveBridge is calling
      to:   CAMPAIGN,
      data: calldata,
    });
    console.log("  Result (no revert):", result);
  } catch (e) {
    // Decode the revert reason
    const data = e.data || (e.error && e.error.data) || null;
    console.log("  REVERTED");
    console.log("  Error message:", e.message?.slice(0, 300));
    if (data) {
      console.log("  Revert data:", data);
      try {
        // Try to decode as Error(string)
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10));
        console.log("  Decoded Error(string):", decoded[0]);
      } catch (_) {}
      try {
        // Try to decode as custom errors
        const errIface = new ethers.Interface([
          "error Unauthorized()",
          "error ZeroAmount()",
          "error CampaignEnded()",
          "error TransactionBlocked()",
          "error EnforcedPause()",
        ]);
        const decoded = errIface.parseError(data);
        console.log("  Decoded custom error:", decoded?.name);
      } catch (_) {}
    }
  }

  // 2. Also simulate the full bridge call: safeTransfer + handleCrossChainDonation
  console.log("\nSimulating bridge safeTransfer first...");
  const usdcIface = new ethers.Interface([
    "function transfer(address to, uint256 amount) returns (bool)",
  ]);
  try {
    const result = await provider.call({
      from: BRIDGE,
      to: USDC,
      data: usdcIface.encodeFunctionData("transfer", [CAMPAIGN, AMOUNT]),
    });
    console.log("  safeTransfer result:", result);
  } catch (e) {
    console.log("  safeTransfer REVERTED:", e.message?.slice(0, 200));
  }

  // 3. Check if bridge has enough USDC and allowances
  const usdcContract = await ethers.getContractAt([
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
  ], USDC, await ethers.provider.getSigner());

  const bridgeBal = await usdcContract.balanceOf(BRIDGE);
  console.log("\n  Bridge USDC balance:", bridgeBal.toString(), "=", (bridgeBal / 1_000_000n).toString(), "USDC");
  console.log("  Bridge has enough:  ", bridgeBal >= AMOUNT ? "✓" : "✗");
}

main().catch(e => { console.error(e); process.exit(1); });
