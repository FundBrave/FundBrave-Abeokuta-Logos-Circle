/**
 * Viem client + helpers for calling donateUSDC() on Base.
 *
 * Float wallet pattern:
 *   1. Before each donation, verify on-chain USDC allowance and (re)approve if needed.
 *   2. Per deposit, call donateUSDC(usdcAmount) — campaign pulls from float wallet.
 *
 * W-C1: Transaction queue errors are now logged (not silently swallowed).
 * W-H4: Approval is verified against the live on-chain allowance before every
 *        donation, eliminating the stale-flag problem.
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
import { logger } from "./logger";

// Sequential transaction queue to prevent nonce collisions
let _txQueue: Promise<void> = Promise.resolve();

function enqueueTx<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    // W-C1: Log unexpected queue-level errors instead of silently swallowing them.
    // Note: fn() rejections are correctly propagated via reject() — the catch
    // here only fires for unexpected errors in the queue machinery itself.
    _txQueue = _txQueue
      .then(() => fn().then(resolve, reject))
      .catch((err) => {
        logger.error("[contract] Unexpected queue error", { error: String(err) });
      });
  });
}

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

// ── On-chain allowance check + approval ───────────────────────────────────────

/**
 * W-H4: Always checks the live on-chain allowance.
 * Re-approves if the allowance has dropped below half of maxUint256.
 * This handles cases where the allowance was revoked after a previous approval.
 */
async function ensureApproval(): Promise<void> {
  const allowance = await publicClient.readContract({
    address: config.usdcAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [account.address, config.campaignAddress],
  });

  if (allowance >= maxUint256 / 2n) return;

  logger.info("[contract] On-chain USDC allowance insufficient — re-approving campaign contract...", {
    allowance: formatUnits(allowance, 6),
  });
  const hash = await walletClient.writeContract({
    address: config.usdcAddress,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [config.campaignAddress, maxUint256],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error("USDC approval transaction reverted on-chain");
  }
  logger.info("[contract] Approval confirmed", { hash });
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
  return enqueueTx(async () => {
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

    // W-H4: Verify live on-chain allowance before every donation
    await ensureApproval();

    logger.info(
      `[contract] Donating ${formatUnits(usdcAmount, 6)} USDC on behalf of ${source} tx ${txRef}`
    );

    const hash = await walletClient.writeContract({
      address: config.campaignAddress,
      abi: CAMPAIGN_ABI,
      functionName: "donateUSDC",
      args: [usdcAmount],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`Donation transaction reverted on-chain: ${hash}`);
    }
    logger.info(`[contract] Donation confirmed`, { hash, source, txRef });
    return hash;
  });
}
