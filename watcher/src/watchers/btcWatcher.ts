/**
 * Bitcoin deposit watcher.
 * Polls Blockstream API for new confirmed transactions to the BTC address.
 * For each unprocessed tx, calculates USD value and triggers a USDC donation.
 *
 * W-H2: API calls wrapped with exponential-backoff retry (3 retries).
 * W-H2: Consecutive failure alerting via FailureTracker (alert at 5 failures).
 * W-M3: Warning logged when pagination limit (250 txs) is reached.
 */

import axios from "axios";
import { config } from "../config";
import { isBtcProcessed, markBtcPending, markBtcProcessed, clearBtcPending } from "../store";
import { getBtcPrice } from "../price";
import { donateToCampaign } from "../contract";
import { withRetry, FailureTracker } from "../utils";
import { logger } from "../logger";

// Blockstream API types (only fields we need)
interface BtcVout {
  scriptpubkey_address?: string;
  value: number; // satoshis
}

interface BtcTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number };
  vout: BtcVout[];
}

const MAX_PAGES = 10; // 250 txs max

const _apiFailures   = new FailureTracker("btc-api");
const _donateFailures = new FailureTracker("btc-donate");

/**
 * Get the current Bitcoin block height.
 */
async function getCurrentBlockHeight(): Promise<number> {
  return withRetry(async () => {
    const { data } = await axios.get<number>(
      `${config.blockstreamApiUrl}/blocks/tip/height`,
      { timeout: 10_000 }
    );
    return data;
  }, 3, "btc-block-height");
}

/**
 * Fetch all confirmed transactions to the BTC watch address with pagination.
 * Blockstream returns up to 25 txs per call (most recent first).
 *
 * W-M3: Warns when the 250-tx pagination limit is hit — older deposits may
 *        be missed for very active addresses.
 */
async function fetchConfirmedTxs(): Promise<BtcTx[]> {
  const allTxs: BtcTx[] = [];
  let lastTxid: string | undefined;
  let hitLimit = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = lastTxid
      ? `${config.blockstreamApiUrl}/address/${config.btcAddress}/txs/chain/${lastTxid}`
      : `${config.blockstreamApiUrl}/address/${config.btcAddress}/txs`;

    const { data } = await withRetry(
      () => axios.get<BtcTx[]>(url, { timeout: 15_000 }),
      3,
      `btc-txs-page-${page}`
    );

    const confirmed = data.filter((tx) => tx.status.confirmed);
    allTxs.push(...confirmed);

    if (data.length < 25) break; // no more pages
    lastTxid = data[data.length - 1].txid;

    // W-M3: Warn on last page if it was full (more may exist)
    if (page === MAX_PAGES - 1 && data.length >= 25) {
      hitLimit = true;
    }
  }

  if (hitLimit) {
    logger.warn(
      `[btc] Pagination limit reached (${MAX_PAGES * 25} txs). ` +
      "Older transactions may be missed for this address."
    );
  }

  return allTxs;
}

/**
 * Sum the satoshis received by our watch address in a transaction.
 */
function getReceivedSatoshis(tx: BtcTx): number {
  return tx.vout
    .filter((o) => o.scriptpubkey_address === config.btcAddress)
    .reduce((sum, o) => sum + o.value, 0);
}

export async function pollBtc(): Promise<void> {
  if (!config.btcAddress) return;

  let txs: BtcTx[];
  try {
    txs = await fetchConfirmedTxs();
    _apiFailures.reset();
  } catch (err) {
    _apiFailures.record();
    logger.error("[btc] Failed to fetch transactions", { error: String(err) });
    return;
  }

  let currentHeight: number;
  try {
    currentHeight = await getCurrentBlockHeight();
  } catch (err) {
    _apiFailures.record();
    logger.error("[btc] Failed to fetch block height", { error: String(err) });
    return;
  }

  for (const tx of txs) {
    if (isBtcProcessed(tx.txid)) continue;

    // Require minimum confirmations
    if (!tx.status.block_height) continue;
    const confirmations = currentHeight - tx.status.block_height + 1;
    if (confirmations < config.btcMinConfirmations) {
      logger.info(
        `[btc] Tx ${tx.txid.slice(0, 12)}... has ${confirmations}/${config.btcMinConfirmations} confirmations — waiting`
      );
      continue;
    }

    const satoshis = getReceivedSatoshis(tx);
    if (satoshis === 0) {
      // Tx doesn't send to our address (e.g. change output only)
      await markBtcProcessed(tx.txid);
      continue;
    }

    const btcAmount = satoshis / 1e8;

    let btcPrice: number;
    try {
      btcPrice = await getBtcPrice();
    } catch (err) {
      logger.error("[btc] Could not fetch BTC price — skipping tx until next poll", {
        txid: tx.txid, error: String(err),
      });
      continue;
    }

    const usdValue = btcAmount * btcPrice;
    logger.info(`[btc] New deposit: ${btcAmount.toFixed(8)} BTC ≈ $${usdValue.toFixed(2)}`, {
      txid: tx.txid, satoshis, btcPrice, usdValue,
    });

    if (usdValue < config.minDonationUsd) {
      logger.info(`[btc] Below min donation threshold ($${config.minDonationUsd}) — skipping`, {
        txid: tx.txid, usdValue,
      });
      await markBtcProcessed(tx.txid);
      continue;
    }

    // Two-phase commit: mark pending before donation to detect crashes
    await markBtcPending(tx.txid);

    try {
      const baseTxHash = await donateToCampaign(usdValue, "btc", tx.txid);
      logger.info(`[btc] Donation complete`, { txid: tx.txid, baseTxHash });
      await markBtcProcessed(tx.txid);
      _donateFailures.reset();
    } catch (err) {
      _donateFailures.record();
      logger.error(`[btc] Donation failed — will retry next poll`, {
        txid: tx.txid, error: String(err),
      });
      await clearBtcPending(tx.txid); // allow retry
    }
  }
}
