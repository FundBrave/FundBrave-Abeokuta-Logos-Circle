/**
 * Viem client + helpers for calling donateUSDC() on Base.
 *
 * Float wallet pattern:
 *   1. At startup, approve campaign contract for max USDC (one-time).
 *   2. Per deposit, call donateUSDC(usdcAmount) — campaign pulls from float wallet.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  maxUint256,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { config } from "./config";

// ── ABIs (minimal) ────────────────────────────────────────────────────────────

const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

const CAMPAIGN_ABI = parseAbi([
  "function donateUSDC(uint256 amount) external",
]);

// ── Clients ────────────────────────────────────────────────────────────────────

// Detect mainnet vs testnet by RPC URL heuristic
const isMainnet = !config.baseRpcUrl.toLowerCase().includes("sepolia");
const chain = isMainnet ? base : baseSepolia;

const transport = http(config.baseRpcUrl);

const account = privateKeyToAccount(
  config.watcherPrivateKey as `0x${string}`
);

const publicClient = createPublicClient({ chain, transport });
const walletClient = createWalletClient({ account, chain, transport });

// ── One-time max approval ─────────────────────────────────────────────────────

let _approved = false;

async function ensureApproval(): Promise<void> {
  if (_approved) return;

  const allowance = await publicClient.readContract({
    address: config.usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, config.campaignAddress],
  });

  if (allowance >= maxUint256 / 2n) {
    _approved = true;
    return;
  }

  console.log("[contract] Approving campaign contract for max USDC...");
  const hash = await walletClient.writeContract({
    address: config.usdcAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [config.campaignAddress, maxUint256],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("[contract] Approval confirmed:", hash);
  _approved = true;
}

// ── Float wallet balance check ─────────────────────────────────────────────────

export async function getFloatBalance(): Promise<bigint> {
  return await publicClient.readContract({
    address: config.usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
}

// ── Main donation function ─────────────────────────────────────────────────────

/**
 * Donate USDC to the campaign on behalf of a BTC/SOL depositor.
 *
 * @param usdValueFloat  USD value of the deposit (e.g. 0.015 BTC × $60,000 = $900)
 * @param source         Label for logging ("btc" | "sol")
 * @param txRef          Original chain tx hash/signature for logging
 */
export async function donateToCampaign(
  usdValueFloat: number,
  source: "btc" | "sol",
  txRef: string
): Promise<string> {
  // Convert USD to USDC 6-decimal units
  const usdcAmount = BigInt(Math.floor(usdValueFloat * 1_000_000));

  if (usdcAmount === 0n) throw new Error("Donation amount rounds to zero USDC");

  // Check float wallet has enough
  const balance = await getFloatBalance();
  if (balance < usdcAmount) {
    throw new Error(
      `Float wallet has only ${formatUnits(balance, 6)} USDC; need ${formatUnits(usdcAmount, 6)} USDC`
    );
  }

  await ensureApproval();

  console.log(
    `[contract] Donating $${(usdcAmount / 1_000_000n).toString()} USDC ` +
      `(${formatUnits(usdcAmount, 6)} USDC) on behalf of ${source} tx ${txRef}`
  );

  const hash = await walletClient.writeContract({
    address: config.campaignAddress,
    abi: CAMPAIGN_ABI,
    functionName: "donateUSDC",
    args: [usdcAmount],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[contract] Donation confirmed: ${hash}`);
  return hash;
}
