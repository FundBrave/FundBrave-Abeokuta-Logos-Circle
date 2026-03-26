const { ethers } = require("hardhat");
const fs = require("fs"), path = require("path");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
  const dep = JSON.parse(fs.readFileSync(path.join(__dirname, "../deployments/84532.json")));

  const BRIDGE     = "0xb3C210cB2075e72B10f00c41e30120480017a136";
  const OLD_RECV   = "0x47D884D6681986bF889D2ab3AA673d9Ded840817";
  const NEW_CAMP   = dep.AbeokutaCampaign;
  const USDC       = dep.USDC;

  const bridge = new ethers.Contract(BRIDGE, [
    "function bridgeRouter() view returns (address)",
    "function localFundraiserFactory() view returns (address)",
  ], provider);
  const recv = new ethers.Contract(OLD_RECV, [
    "function bridge() view returns (address)",
    "function campaign() view returns (address)",
    "function paused() view returns (bool)",
  ], provider);
  const camp = new ethers.Contract(NEW_CAMP, [
    "function bridgeContract() view returns (address)",
  ], provider);
  const usdc = new ethers.Contract(USDC, [
    "function allowance(address,address) view returns (uint256)",
    "function balanceOf(address) view returns (uint256)",
  ], provider);

  const bridgeRouter  = await bridge.bridgeRouter();
  const localFactory  = await bridge.localFundraiserFactory();
  const recvBridge    = await recv.bridge();
  const recvCampaign  = await recv.campaign();
  const recvPaused    = await recv.paused();
  const campBridge    = await camp.bridgeContract();
  const allowance     = await usdc.allowance(OLD_RECV, NEW_CAMP);
  const bridgeBal     = await usdc.balanceOf(BRIDGE);

  console.log("=== Cross-chain routing chain ===");
  const ok = (v, label) => console.log(v ? `  ✓` : `  ✗`, label);

  ok(bridgeRouter === ethers.ZeroAddress,    `FundBraveBridge.bridgeRouter = address(0)     (${bridgeRouter.slice(0,10)})`);
  ok(localFactory.toLowerCase() === OLD_RECV.toLowerCase(), `FundBraveBridge.localFactory = OldReceiver    (${localFactory.slice(0,10)})`);
  ok(recvBridge.toLowerCase()  === BRIDGE.toLowerCase(),    `OldReceiver.bridge = FundBraveBridge          (${recvBridge.slice(0,10)})`);
  ok(recvCampaign.toLowerCase() === NEW_CAMP.toLowerCase(), `OldReceiver.campaign = NewCampaign            (${recvCampaign.slice(0,10)})`);
  ok(!recvPaused,                            `OldReceiver not paused`);
  ok(campBridge.toLowerCase() === OLD_RECV.toLowerCase(),   `NewCampaign.bridgeContract = OldReceiver      (${campBridge.slice(0,10)})`);
  ok(allowance === ethers.MaxUint256,        `allowance[OldReceiver][NewCampaign] = maxUint256`);
  console.log(`  ℹ  FundBraveBridge USDC balance: ${(bridgeBal / 1_000_000n).toString()} USDC`);
  console.log(`\n  Full path: Bridge → OldReceiver → NewCampaign`);
  console.log(`    ${BRIDGE.slice(0,10)}… → ${OLD_RECV.slice(0,10)}… → ${NEW_CAMP.slice(0,10)}…`);
}
main().catch(e => { console.error(e); process.exit(1); });
