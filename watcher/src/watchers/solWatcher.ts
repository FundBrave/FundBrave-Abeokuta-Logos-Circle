/**
 * Solana deposit watcher.
 * Watches for:
 *   1. Native SOL transfers to the watch address
 *   2. USDC-SPL transfers to the watch address's associated token account
 *
 * Uses Solana JSON-RPC via @solana/web3.js.
 */

import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { config } from "../config";
import { isSolProcessed, markSolProcessed } from "../store";
import { getSolPrice } from "../price";
import { donateToCampaign } from "../contract";

const connection = new Connection(config.solRpcUrl, "confirmed");
const watchPubkey = config.solAddress ? new PublicKey(config.solAddress) : null;
const usdcMint = new PublicKey(config.solUsdcMint);

// ── Helpers ────────────────────────────────────────────────────────────────────

function lamportsToSol(lamports: number): number {
  return lamports / 1e9;
}

// USDC on Solana has 6 decimals (same as EVM USDC)
function usdcRawToFloat(raw: number): number {
  return raw / 1e6;
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
  const post = tx.meta.postTokenBalances.find((b) => b.owner === ataStr || b.accountIndex.toString() === ataStr);
  const pre  = tx.meta.preTokenBalances.find((b)  => b.owner === ataStr || b.accountIndex.toString() === ataStr);

  // More reliable: match by ATA account index
  const accountKeys = tx.transaction.message.accountKeys;
  const ataIdx = accountKeys.findIndex((k) => k.pubkey.toBase58() === ataStr);
  if (ataIdx === -1) return 0;

  const postBal = tx.meta.postTokenBalances.find((b) => b.accountIndex === ataIdx);
  const preBal  = tx.meta.preTokenBalances.find((b)  => b.accountIndex === ataIdx);

  const postAmt = parseInt(postBal?.uiTokenAmount?.amount ?? "0");
  const preAmt  = parseInt(preBal?.uiTokenAmount?.amount  ?? "0");
  const net = postAmt - preAmt;
  return net > 0 ? net : 0;

  void post; void pre; // suppress unused warnings
}

// ── Main poller ────────────────────────────────────────────────────────────────

export async function pollSol(): Promise<void> {
  if (!config.solAddress || !watchPubkey) return;

  // Derive the ATA for USDC on the watch address
  let ata: PublicKey;
  try {
    ata = getAssociatedTokenAddressSync(usdcMint, watchPubkey);
  } catch {
    console.error("[sol] Failed to derive ATA");
    return;
  }

  // Fetch recent signatures (up to 20 at a time)
  let signatures: { signature: string }[];
  try {
    signatures = await connection.getSignaturesForAddress(watchPubkey, { limit: 20 });
  } catch (err) {
    console.error("[sol] Failed to fetch signatures:", err);
    return;
  }

  for (const { signature } of signatures) {
    if (isSolProcessed(signature)) continue;

    let tx: ParsedTransactionWithMeta | null;
    try {
      tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
    } catch (err) {
      console.error(`[sol] Failed to fetch tx ${signature}:`, err);
      continue;
    }

    if (!tx || tx.meta?.err) {
      markSolProcessed(signature); // failed txs can be safely ignored
      continue;
    }

    // ── Check native SOL ──────────────────────────────────────────────────
    const lamports = getSolReceived(tx);
    if (lamports > 0) {
      const solAmount = lamportsToSol(lamports);
      let solPrice: number;
      try {
        solPrice = await getSolPrice();
      } catch (err) {
        console.error("[sol] Could not fetch SOL price, skipping:", err);
        continue;
      }
      const usdValue = solAmount * solPrice;
      console.log(
        `[sol] SOL deposit: ${solAmount.toFixed(6)} SOL ≈ $${usdValue.toFixed(2)} (sig: ${signature})`
      );

      if (usdValue >= config.minDonationUsd) {
        try {
          const hash = await donateToCampaign(usdValue, "sol", signature);
          console.log(`[sol] Donation complete. Base tx: ${hash}`);
        } catch (err) {
          console.error(`[sol] Donation failed for ${signature}:`, err);
          continue; // don't mark as processed
        }
      } else {
        console.log(`[sol] Below min threshold, skipping`);
      }
      markSolProcessed(signature);
      continue;
    }

    // ── Check USDC-SPL ────────────────────────────────────────────────────
    const usdcRaw = getUsdcSplReceived(tx, ata);
    if (usdcRaw > 0) {
      const usdcAmount = usdcRawToFloat(usdcRaw);
      console.log(
        `[sol] USDC-SPL deposit: ${usdcAmount.toFixed(2)} USDC (sig: ${signature})`
      );

      if (usdcAmount >= config.minDonationUsd) {
        try {
          const hash = await donateToCampaign(usdcAmount, "sol", signature);
          console.log(`[sol] Donation complete. Base tx: ${hash}`);
        } catch (err) {
          console.error(`[sol] Donation failed for ${signature}:`, err);
          continue;
        }
      } else {
        console.log(`[sol] Below min threshold, skipping`);
      }
      markSolProcessed(signature);
      continue;
    }

    // Not a deposit to our address
    markSolProcessed(signature);
  }
}
