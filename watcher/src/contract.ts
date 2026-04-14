/**
 * Viem client + helpers for calling campaign donation functions on Base.
 *
 * BTC/SOL donations:
 *   Call creditBTCSolDonation(donor, usdcEquivalent, sourceChain) — no USDC
 *   is transferred. The campaign records the equivalent value on-chain without
 *   requiring a float wallet. Only ETH for gas is needed in the watcher wallet.
 *
 * Direct USDC donations (future use):
 *   Float wallet pattern — approve + donateUSDC(amount).
 *
 * W-C1: Transaction queue errors are now logged (not silently swallowed).
 * W-H4: Approval is verified against the live on-chain allowance before every
 *        direct USDC donation, eliminating the stale-flag problem.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  maxUint256,
  formatUnits,
  keccak256,
  toBytes,
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
  // creditBTCSolDonation: records BTC/SOL donation on-chain without any USDC transfer.
  // Watcher-only. Requires no float USDC — only ETH for gas.
  "function creditBTCSolDonation(address donor, uint256 usdcEquivalent, string sourceChain) external",
]);

const STAKING_ABI = parseAbi([
  // Gap #1: callable by anyone — watcher calls this on a daily schedule
  "function harvestAndDistribute() external",
]);

// W-C1: ABI fragment for the Donated event emitted after a successful donateUSDC call.
// Used to verify whether a donation was confirmed on-chain before retrying stale pending entries.
const DONATED_EVENT = parseAbi([
  "event Donated(address indexed donor, uint256 usdcAmount, address indexed tokenIn, string sourceChain)",
])[0];

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

// ── Gap #6: Deterministic donor address derivation ────────────────────────────

/**
 * Derives a deterministic, unique EVM pseudo-address for a BTC or SOL sender.
 *
 * Since BTC/SOL addresses are not EVM addresses, we hash the chain-prefixed
 * sender string to produce a 20-byte address that is unique per sender and
 * consistent across multiple transactions from the same sender.
 *
 * Example: "btc:1A1zP1..." → keccak256 → last 20 bytes → 0x...
 */
export function deriveDonorAddress(chain: "btc" | "sol", senderAddr: string): `0x${string}` {
  const hash = keccak256(toBytes(`${chain}:${senderAddr}`));
  return `0x${hash.slice(-40)}` as `0x${string}`;
}

// ── Float wallet balance check ─────────────────────────────────────────────────

/** Returns the watcher wallet's USDC balance (informational — no longer required for BTC/SOL). */
export async function getFloatBalance(): Promise<bigint> {
  return await publicClient.readContract({
    address: config.usdcAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
}

/** Returns the watcher wallet's ETH balance (needed for gas on every creditBTCSolDonation call). */
export async function getWatcherEthBalance(): Promise<bigint> {
  return await publicClient.getBalance({ address: account.address });
}

// ── W-C1: On-chain donation confirmation check ─────────────────────────────────

/**
 * W-C1 + F-009: Check whether a donation confirmed on-chain.
 *
 * If `baseTxHash` is provided (stored in the pending entry after writeContract()),
 * checks the receipt directly — this is authoritative and eliminates block range
 * estimation errors that could cause false negatives.
 *
 * Falls back to event log scanning (original method) when no hash is available
 * (e.g. crash happened before writeContract completed).
 *
 * @param startedAtMs  Unix timestamp (ms) when the donation attempt began
 * @param baseTxHash   Base tx hash from writeContract() — if known
 * @returns true if the donation confirmed on-chain
 */
export async function checkRecentDonation(startedAtMs: number, baseTxHash?: string): Promise<boolean> {
  // F-009: Direct receipt check — much more reliable than event log scanning
  if (baseTxHash) {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: baseTxHash as `0x${string}`,
      });
      const confirmed = receipt?.status === "success";
      logger.info("[contract] F-009: Direct receipt check", {
        baseTxHash, confirmed, status: receipt?.status,
      });
      return confirmed;
    } catch (err) {
      logger.warn("[contract] F-009: Direct receipt check failed — falling back to event scan", {
        baseTxHash, error: String(err),
      });
      // Fall through to event log scanning
    }
  }

  // Fallback: original event log scanning (used when no hash is available)
  try {
    const latestBlock = await publicClient.getBlockNumber();
    const ageMs = Date.now() - startedAtMs;
    // Estimate how many blocks back we need to search; add 100-block buffer
    const estimatedBlocks = BigInt(Math.ceil(ageMs / 2_000) + 100);
    const fromBlock = latestBlock > estimatedBlocks ? latestBlock - estimatedBlocks : 0n;

    const logs = await publicClient.getLogs({
      address: config.campaignAddress as `0x${string}`,
      event: DONATED_EVENT,
      args: { donor: account.address },
      fromBlock,
      toBlock: "latest",
    });
    return logs.length > 0;
  } catch (err) {
    // If the check itself fails (RPC error, etc.), be conservative: assume NOT confirmed
    // so the pending entry is retried rather than silently dropped.
    logger.warn("[contract] checkRecentDonation failed — assuming not confirmed", {
      error: String(err),
    });
    return false;
  }
}

// ── Main donation function ─────────────────────────────────────────────────────

/**
 * Record a BTC/SOL donation on-chain via creditBTCSolDonation().
 *
 * No USDC is transferred — the campaign just records the equivalent USD value.
 * The watcher wallet only needs ETH for gas (no USDC float required).
 *
 * @param usdValueFloat  USD value of the deposit (e.g. 0.015 BTC × $60,000 = $900)
 * @param source         "btc" | "sol" — mapped to "bitcoin" / "solana" on-chain
 * @param txRef          Original chain tx hash/signature for logging
 * @param donor          Derived EVM pseudo-address for the actual BTC/SOL sender
 * @param onHashReady    F-009: callback with Base tx hash for crash-safe persistence
 */
export async function donateToCampaign(
  usdValueFloat: number,
  source: "btc" | "sol",
  txRef: string,
  donor: `0x${string}`,
  /** F-009: Called with the Base tx hash after writeContract() but before waitForTransactionReceipt().
   *  Use this to persist the hash in the pending entry for reliable crash recovery. */
  onHashReady?: (hash: string) => Promise<void>
): Promise<string> {
  return enqueueTx(async () => {
    // Convert USD to USDC 6-decimal units
    const usdcAmount = BigInt(Math.floor(usdValueFloat * 1_000_000));
    if (usdcAmount === 0n) throw new Error("Donation amount rounds to zero USDC");

    // Map watcher source label → on-chain sourceChain string
    const sourceChain = source === "btc" ? "bitcoin" : "solana";

    logger.info(
      `[contract] Recording ${formatUnits(usdcAmount, 6)} USDC equivalent for ${sourceChain} tx ${txRef}`,
      { donor }
    );

    // No USDC transfer: creditBTCSolDonation only updates on-chain accounting
    const hash = await walletClient.writeContract({
      address: config.campaignAddress,
      abi: CAMPAIGN_ABI,
      functionName: "creditBTCSolDonation",
      args: [donor, usdcAmount, sourceChain],
    });

    // F-009: Persist the Base tx hash in the pending entry immediately after broadcast.
    if (onHashReady) {
      try {
        await onHashReady(hash);
      } catch (err) {
        logger.warn("[contract] F-009: Failed to persist Base tx hash in pending entry", {
          hash, error: String(err),
        });
      }
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`creditBTCSolDonation reverted on-chain: ${hash}`);
    }
    logger.info(`[contract] Donation recorded on-chain`, { hash, sourceChain, txRef });
    return hash;
  });
}

// ── Gap #1: Harvest automation ────────────────────────────────────────────────

/**
 * Gap #1: Call harvestAndDistribute() on the staking contract.
 *
 * This pulls accrued Aave yield, deducts the 2% platform fee, and accumulates
 * the remainder in the per-token accumulator for stakers to claim.
 * The contract itself enforces MIN_HARVEST_INTERVAL (1 hour), so calling more
 * frequently is safe — it will no-op if called too soon.
 */
export async function harvestStaking(): Promise<string | null> {
  if (!config.stakingAddress) {
    logger.info("[harvest] STAKING_ADDRESS not configured — skipping harvest");
    return null;
  }

  return enqueueTx(async () => {
    logger.info("[harvest] Calling harvestAndDistribute()...");

    const hash = await walletClient.writeContract({
      address: config.stakingAddress as `0x${string}`,
      abi: STAKING_ABI,
      functionName: "harvestAndDistribute",
      args: [],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`harvestAndDistribute reverted: ${hash}`);
    }
    logger.info("[harvest] harvestAndDistribute confirmed", { hash });
    return hash;
  });
}
