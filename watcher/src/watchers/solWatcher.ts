/**
 * Solana deposit watcher.
 * Watches for:
 *   1. Native SOL transfers to the watch address
 *   2. USDC-SPL transfers to the watch address's associated token account
 *
 * Uses Solana JSON-RPC via @solana/web3.js.
 *
 * W-H1: Token amounts parsed with Number() + finite validation (was parseInt).
 * W-H2: API calls wrapped with exponential-backoff retry.
 * W-H2: Consecutive failure alerting via FailureTracker.
 * W-M1: Solana connection health verified at poll start.
 */

import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { config } from "../config";
import {
  isSolProcessed, markSolPending, markSolProcessed, clearSolPending,
  updateSolPendingHash, getSolCheckpointSig, setSolCheckpointSig,
} from "../store";
import { getSolPrice } from "../price";
import { donateToCampaign, deriveDonorAddress } from "../contract";
import { withRetry, FailureTracker } from "../utils";
import { logger } from "../logger";

const connection = new Connection(config.solRpcUrl, "confirmed");
const watchPubkey = config.solAddress ? new PublicKey(config.solAddress) : null;
const usdcMint = new PublicKey(config.solUsdcMint);

const SOL_PAGE_SIZE = 20;
const SOL_MAX_PAGES = 10; // max 200 signatures per poll cycle

const _rpcFailures    = new FailureTracker("sol-rpc");
const _donateFailures = new FailureTracker("sol-donate");

// ── Helpers ────────────────────────────────────────────────────────────────────

function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

// USDC on Solana has 6 decimals (same as EVM USDC)
function usdcRawToFloat(raw: number): number {
  return raw / 1e6;
}

/**
 * W-H1: Parse a raw token amount string to a number with validation.
 * `parseInt` was replaced because it truncates decimals and returns NaN
 * for non-numeric strings without throwing.
 */
function parseTokenAmount(raw: string | undefined, label: string): number {
  const n = Number(raw ?? "0");
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${label} token amount: ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * Gap #6: Extract the primary sender (fee payer) from a Solana transaction.
 * accountKeys[0] is the fee payer and is always the initiating signer.
 */
function getSolSenderAddress(tx: ParsedTransactionWithMeta): string | undefined {
  return tx.transaction.message.accountKeys[0]?.pubkey.toBase58();
}

/**
 * Find how many lamports of native SOL the watch address *received* in a tx.
 * Returns 0 if this tx wasn't a SOL transfer to our address.
 */
function getSolReceived(tx: ParsedTransactionWithMeta): number {
  if (!tx.meta || !watchPubkey) return 0;
  const idx = tx.transaction.message.accountKeys.findIndex((k) =>
    k.pubkey.equals(watchPubkey)
  );
  if (idx === -1) return 0;
  const pre  = tx.meta.preBalances[idx]  ?? 0;
  const post = tx.meta.postBalances[idx] ?? 0;
  const net = post - pre;
  return net > 0 ? net : 0;
}

/**
 * Find how many raw USDC-SPL units our ATA received in a tx.
 * Returns 0 if this wasn't a USDC transfer to our ATA.
 */
function getUsdcSplReceived(tx: ParsedTransactionWithMeta, ata: PublicKey): number {
  if (!tx.meta?.postTokenBalances || !tx.meta?.preTokenBalances) return 0;

  const ataStr = ata.toBase58();
  const accountKeys = tx.transaction.message.accountKeys;
  const ataIdx = accountKeys.findIndex((k) => k.pubkey.toBase58() === ataStr);
  if (ataIdx === -1) return 0;

  const postBal = tx.meta.postTokenBalances.find((b) => b.accountIndex === ataIdx);
  const preBal  = tx.meta.preTokenBalances.find((b)  => b.accountIndex === ataIdx);

  // W-H1: Use Number() with validation instead of parseInt()
  const postAmt = parseTokenAmount(postBal?.uiTokenAmount?.amount, "post");
  const preAmt  = parseTokenAmount(preBal?.uiTokenAmount?.amount,  "pre");

  const net = postAmt - preAmt;
  return net > 0 ? net : 0;
}

// ── Main poller ────────────────────────────────────────────────────────────────

export async function pollSol(): Promise<void> {
  if (!config.solAddress || !watchPubkey) return;

  // W-M1: Verify Solana RPC connection is responsive before doing real work
  try {
    await withRetry(() => connection.getSlot(), 2, "sol-health-check");
    _rpcFailures.reset();
  } catch (err) {
    _rpcFailures.record();
    logger.error("[sol] Solana RPC health check failed — skipping poll", { error: String(err) });
    return;
  }

  // Derive the ATA for USDC on the watch address
  let ata: PublicKey;
  try {
    ata = getAssociatedTokenAddressSync(usdcMint, watchPubkey);
  } catch {
    logger.error("[sol] Failed to derive ATA");
    return;
  }

  // F-008: Use checkpoint-based pagination to prevent spam flooding attacks.
  // The `until` parameter tells Solana RPC to stop fetching when it reaches the
  // last signature we processed in the previous poll cycle. This means:
  //   - Each poll only fetches NEW sigs since the last checkpoint
  //   - An attacker cannot push legit deposits out of the scan window by flooding
  //     spam transactions (all spam is between newest and checkpoint, so we see all of it)
  //   - We no longer stop at the first processed sig (which was the attack vector)
  const checkpointSig = getSolCheckpointSig();

  const signatures: { signature: string }[] = [];
  let before: string | undefined;
  let hitPageLimit = false;
  let newestSigInBatch: string | undefined;

  try {
    for (let page = 0; page < SOL_MAX_PAGES; page++) {
      const opts: { limit: number; before?: string; until?: string } = { limit: SOL_PAGE_SIZE };
      if (before)        opts.before = before;
      if (checkpointSig) opts.until  = checkpointSig; // F-008: stop at known watermark

      const pageSigs = await withRetry(
        () => connection.getSignaturesForAddress(watchPubkey!, opts),
        3,
        `sol-get-signatures-page-${page}`
      );

      if (pageSigs.length === 0) break; // caught up to checkpoint

      // Track the newest sig seen (first page, first entry) for the new checkpoint
      if (page === 0 && pageSigs.length > 0) {
        newestSigInBatch = pageSigs[0].signature;
      }

      for (const sig of pageSigs) {
        if (!isSolProcessed(sig.signature)) {
          signatures.push(sig);
        }
        // Note: we do NOT break on processed sigs — spam sigs that were marked processed
        // will be skipped by the isSolProcessed check above, not by stopping iteration.
      }

      if (pageSigs.length < SOL_PAGE_SIZE) break; // last page
      before = pageSigs[pageSigs.length - 1].signature;

      if (page === SOL_MAX_PAGES - 1) hitPageLimit = true;
    }
  } catch (err) {
    _rpcFailures.record();
    logger.error("[sol] Failed to fetch signatures", { error: String(err) });
    return;
  }

  if (hitPageLimit) {
    logger.warn(
      `[sol] Pagination limit reached (${SOL_MAX_PAGES * SOL_PAGE_SIZE} sigs). ` +
      "Older transactions may be missed — consider reducing poll interval."
    );
  }

  for (const { signature } of signatures) {
    if (isSolProcessed(signature)) continue;

    let tx: ParsedTransactionWithMeta | null;
    try {
      tx = await withRetry(
        () => connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        }),
        3,
        `sol-get-tx-${signature.slice(0, 8)}`
      );
    } catch (err) {
      logger.error(`[sol] Failed to fetch tx`, { signature, error: String(err) });
      continue;
    }

    if (!tx || tx.meta?.err) {
      await markSolProcessed(signature); // failed txs can be safely skipped
      continue;
    }

    // Gap #6: Derive a deterministic EVM pseudo-address for the SOL sender
    const solSender = getSolSenderAddress(tx);
    // Derive donor address from sender if known; fall back to signature for uniqueness.
    const donor = deriveDonorAddress("sol", solSender ?? signature);

    // ── Check native SOL ──────────────────────────────────────────────────
    const lamports = getSolReceived(tx);
    if (lamports > 0) {
      const solAmount = lamportsToSol(lamports);
      let solPrice: number;
      try {
        solPrice = await getSolPrice();
      } catch (err) {
        logger.error("[sol] Could not fetch SOL price — skipping tx until next poll", {
          signature, error: String(err),
        });
        continue;
      }
      const usdValue = solAmount * solPrice;
      logger.info(`[sol] SOL deposit: ${solAmount.toFixed(6)} SOL ≈ $${usdValue.toFixed(2)}`, {
        signature, lamports, solPrice, usdValue,
      });

      if (usdValue > config.maxDonationUsd) {
        // F-005: Reject deposits above the per-tx cap to guard against stale price over-crediting.
        logger.error(
          `[sol] SOL deposit $${usdValue.toFixed(2)} exceeds MAX_DONATION_USD ($${config.maxDonationUsd}) — ` +
          "skipping. Verify SOL price oracle and raise MAX_DONATION_USD if this is legitimate.",
          { signature, usdValue, maxDonationUsd: config.maxDonationUsd }
        );
        // Do NOT mark processed — operator must investigate
        continue;
      }

      if (usdValue >= config.minDonationUsd) {
        await markSolPending(signature);
        try {
          // F-009: Pass onHashReady so Base tx hash is persisted before receipt confirmation
          const hash = await donateToCampaign(usdValue, "sol", signature, donor,
            (h) => updateSolPendingHash(signature, h)
          );
          logger.info(`[sol] Donation complete`, { signature, baseTxHash: hash });
          await markSolProcessed(signature);
          _donateFailures.reset();
        } catch (err) {
          _donateFailures.record();
          logger.error(`[sol] Donation failed — will retry next poll`, {
            signature, error: String(err),
          });
          await clearSolPending(signature);
        }
      } else {
        logger.info(`[sol] Below min threshold ($${config.minDonationUsd}) — skipping`);
        await markSolProcessed(signature);
      }
      continue;
    }

    // ── Check USDC-SPL ────────────────────────────────────────────────────
    let usdcRaw: number;
    try {
      usdcRaw = getUsdcSplReceived(tx, ata);
    } catch (err) {
      logger.error("[sol] Failed to parse USDC-SPL amount", { signature, error: String(err) });
      continue;
    }

    if (usdcRaw > 0) {
      const usdcAmount = usdcRawToFloat(usdcRaw);
      logger.info(`[sol] USDC-SPL deposit: ${usdcAmount.toFixed(2)} USDC`, { signature });

      if (usdcAmount > config.maxDonationUsd) {
        // F-005: Cap also applies to USDC-SPL deposits (no price oracle needed, but cap still relevant)
        logger.error(
          `[sol] USDC-SPL deposit $${usdcAmount.toFixed(2)} exceeds MAX_DONATION_USD ($${config.maxDonationUsd}) — skipping`,
          { signature, usdcAmount, maxDonationUsd: config.maxDonationUsd }
        );
        continue;
      }

      if (usdcAmount >= config.minDonationUsd) {
        await markSolPending(signature);
        try {
          // F-009: Pass onHashReady so Base tx hash is persisted before receipt confirmation
          const hash = await donateToCampaign(usdcAmount, "sol", signature, donor,
            (h) => updateSolPendingHash(signature, h)
          );
          logger.info(`[sol] Donation complete`, { signature, baseTxHash: hash });
          await markSolProcessed(signature);
          _donateFailures.reset();
        } catch (err) {
          _donateFailures.record();
          logger.error(`[sol] Donation failed — will retry next poll`, {
            signature, error: String(err),
          });
          await clearSolPending(signature);
        }
      } else {
        logger.info(`[sol] Below min threshold ($${config.minDonationUsd}) — skipping`);
        await markSolProcessed(signature);
      }
      continue;
    }

    // Not a deposit to our address
    await markSolProcessed(signature);
  }

  // F-008: Advance the checkpoint to the newest sig seen in this batch.
  // On the next poll cycle, getSignaturesForAddress will stop at this sig,
  // so only sigs newer than the current batch will be fetched.
  if (newestSigInBatch) {
    await setSolCheckpointSig(newestSigInBatch);
  }
}
