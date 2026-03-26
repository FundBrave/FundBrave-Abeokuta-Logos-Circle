const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");
async function main() {
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/84532.json")));
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const BRIDGE   = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const NEW_RECV = dep.AbeokutaBridgeReceiver;
  const NEW_CAMP = dep.AbeokutaCampaign;

  const bridge = new ethers.Contract(BRIDGE, ["function localFundraiserFactory() view returns (address)"], provider);
  const recv   = new ethers.Contract(NEW_RECV, ["function bridge() view returns (address)", "function campaign() view returns (address)"], provider);
  const camp   = new ethers.Contract(NEW_CAMP, ["function bridgeContract() view returns (address)"], provider);
  const usdc   = new ethers.Contract(dep.USDC, ["function allowance(address,address) view returns (uint256)"], provider);

  const lf = await bridge.localFundraiserFactory();
  const rb = await recv.bridge();
  const rc = await recv.campaign();
  const cb = await camp.bridgeContract();
  const al = await usdc.allowance(NEW_RECV, NEW_CAMP);

  const ok = (v, label) => console.log(v ? "✓" : "✗", label);
  ok(lf.toLowerCase() === NEW_RECV.toLowerCase(), `Bridge.localFactory = NewReceiver (${lf})`);
  ok(rb.toLowerCase() === BRIDGE.toLowerCase(),   `NewReceiver.bridge = Bridge`);
  ok(rc.toLowerCase() === NEW_CAMP.toLowerCase(), `NewReceiver.campaign = NewCampaign`);
  ok(cb.toLowerCase() === NEW_RECV.toLowerCase(), `NewCampaign.bridgeContract = NewReceiver (${cb})`);
  ok(al === ethers.MaxUint256,                    `allowance[NewRecv][NewCamp] = maxUint256`);

  // Also simulate the call now
  const calldata = new ethers.Interface([
    "function handleCrossChainDonation(address,uint256,uint256,bytes32,uint32) external",
  ]).encodeFunctionData("handleCrossChainDonation", [
    "0x396E931faD8c43c7200D70BbDE91e962CfaCCa5e",
    0n, 100_000_000n, ethers.ZeroHash, 40161,
  ]);
  console.log("\nSimulating handleCrossChainDonation on NewReceiver (from Bridge)...");
  try {
    await provider.call({ from: BRIDGE, to: NEW_RECV, data: calldata });
    console.log("✓ Simulation SUCCESS — call will work");
  } catch (e) {
    const d = e.data;
    console.log("✗ REVERT:", d, e.shortMessage);
  }
}
main().catch(console.error);
