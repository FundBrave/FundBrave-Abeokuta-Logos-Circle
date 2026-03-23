/**
 * Bitcoin deposit watcher.
 * Polls Blockstream API for new confirmed transactions to the BTC address.
 * For each unprocessed tx, calculates USD value and triggers a USDC donation.
 */

import axios from "axios";
import { config } from "../config";
import { isBtcProcessed, markBtcProcessed } from "../store";
import { getBtcPrice } from "../price";
import { donateToCampaign } from "../contract";

// Blockstream API types (only fields we need)
interface BtcVout {
  scriptpubkey_address?: string;
  value: number; // satoshis
}

interface BtcTx {
  txid: string;
  status: { confirmed: boolean };
  vout: BtcVout[];
}

/**
 * Fetch all confirmed transactions to the BTC watch address.
 * Blockstream returns up to 25 txs per call (most recent first).
 * For a campaign that won't receive thousands of txs, this is fine.
 */
async function fetchConfirmedTxs(): Promise<BtcTx[]> {
  const url = `${config.blockstreamApiUrl}/address/${config.btcAddress}/txs`;
  const { data } = await axios.get<BtcTx[]>(url, { timeout: 15_000 });
  return data.filter((tx) => tx.status.confirmed);
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
  } catch (err) {
    console.error("[btc] Failed to fetch transactions:", err);
    return;
  }

  for (const tx of txs) {
    if (isBtcProcessed(tx.txid)) continue;

    const satoshis = getReceivedSatoshis(tx);
    if (satoshis === 0) {
      // tx doesn't send to our address (e.g. change output only)
      markBtcProcessed(tx.txid);
      continue;
    }

    const btcAmount = satoshis / 1e8;

    let btcPrice: number;
    try {
      btcPrice = await getBtcPrice();
    } catch (err) {
      console.error("[btc] Could not fetch BTC price, skipping:", err);
      continue; // retry next poll
    }

    const usdValue = btcAmount * btcPrice;
    console.log(
      `[btc] New deposit: ${btcAmount.toFixed(8)} BTC ≈ $${usdValue.toFixed(2)} (tx: ${tx.txid})`
    );

    if (usdValue < config.minDonationUsd) {
      console.log(`[btc] Below min donation threshold ($${config.minDonationUsd}), skipping`);
      markBtcProcessed(tx.txid);
      continue;
    }

    try {
      const baseTxHash = await donateToCampaign(usdValue, "btc", tx.txid);
      console.log(`[btc] Donation complete. Base tx: ${baseTxHash}`);
      markBtcProcessed(tx.txid);
    } catch (err) {
      console.error(`[btc] Donation failed for ${tx.txid}:`, err);
      // Not marking as processed — will retry on next poll
    }
  }
}
