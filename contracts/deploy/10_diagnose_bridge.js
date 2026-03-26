const { ethers } = require("hardhat");

const BRIDGE    = "0xb3C210cB2075e72B10f00c41e30120480017a136";
const OLD_RECV  = "0x47D884D6681986bF889D2ab3AA673d9Ded840817";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

  const bridge = new ethers.Contract(BRIDGE, [
    "function bridgeRouter() view returns (address)",
    "function localFundraiserFactory() view returns (address)",
    "function eidToChainId(uint32) view returns (uint256)",
    "function owner() view returns (address)",
  ], provider);

  const bridgeRouter = await bridge.bridgeRouter();
  const localFactory = await bridge.localFundraiserFactory();
  const eid40161     = await bridge.eidToChainId(40161);
  const bridgeOwner  = await bridge.owner();

  console.log("=== FundBraveBridge ===");
  console.log("  bridgeRouter:          ", bridgeRouter);
  console.log("  localFundraiserFactory:", localFactory);
  console.log("  eidToChainId[40161]:   ", eid40161.toString());
  console.log("  owner:                 ", bridgeOwner);

  if (bridgeRouter !== ethers.ZeroAddress) {
    const router = new ethers.Contract(bridgeRouter, [
      "function fundraiserFactory() view returns (address)",
      "function authorizedBridges(address) view returns (bool)",
      "function circuitBreakerTripped() view returns (bool)",
      "function supportedChains(uint256) view returns (string, uint8, bool)",
      "function owner() view returns (address)",
    ], provider);

    const factory    = await router.fundraiserFactory();
    const authorized = await router.authorizedBridges(BRIDGE);
    const tripped    = await router.circuitBreakerTripped();
    const ownerR     = await router.owner();

    console.log("\n=== BridgeRouter (" + bridgeRouter.slice(0,10) + "…) ===");
    console.log("  fundraiserFactory:   ", factory);
    console.log("  authorizedBridges[Bridge]:", authorized);
    console.log("  circuitBreakerTripped:", tripped);
    console.log("  owner:               ", ownerR);

    // Check source chain IDs
    const sourceChainId = eid40161 === 0n ? 40161n : eid40161;
    console.log("\n  Effective sourceChainId:", sourceChainId.toString());
    const [name, proto, supported] = await router.supportedChains(sourceChainId);
    console.log("  supportedChains[" + sourceChainId + "]:", { name, proto, supported });

    // Also check chain 11155111 (Sepolia)
    const [n2, p2, s2] = await router.supportedChains(11155111n);
    console.log("  supportedChains[11155111]:", { name: n2, proto: p2, supported: s2 });

    // Also check chain 1 (Ethereum)
    const [n3, p3, s3] = await router.supportedChains(1n);
    console.log("  supportedChains[1]:", { name: n3, proto: p3, supported: s3 });
  }
}
main().catch(e => { console.error(e); process.exit(1); });
