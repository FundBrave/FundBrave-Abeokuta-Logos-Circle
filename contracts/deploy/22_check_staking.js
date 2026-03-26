const { ethers } = require("hardhat");
async function main() {
  const [d] = await ethers.getSigners();
  const s = await ethers.getContractAt([
    "function pendingCampaignContract() view returns (address)",
    "function campaignActivationTime() view returns (uint256)",
    "function campaignContract() view returns (address)",
  ], "0x6F4AF3663bfC775E00c05F2539C5341F4118D341", d);
  const [pc, at, cc] = await Promise.all([
    s.pendingCampaignContract(), s.campaignActivationTime(), s.campaignContract()
  ]);
  console.log("campaignContract:       ", cc);
  console.log("pendingCampaignContract:", pc);
  console.log("campaignActivationTime: ", at > 0n ? new Date(Number(at) * 1000).toISOString() : "0 (not set)");
  if (at > 0n) {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const wait = at - now;
    console.log("Time until executable:  ", wait > 0n ? `${(wait / 3600n).toString()}h ${((wait % 3600n) / 60n).toString()}m` : "READY NOW");
  }
}
main().catch(console.error);
