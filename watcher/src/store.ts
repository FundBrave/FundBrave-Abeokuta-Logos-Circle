/**
 * Simple file-backed store for processed transaction hashes/signatures.
 * Prevents double-processing deposits across restarts.
 */

import * as fs from "fs";
import { config } from "./config";

interface StoreData {
  /** Set of processed Bitcoin tx hashes */
  btcTxs: string[];
  /** Set of processed Solana tx signatures */
  solTxs: string[];
}

let _btcSet: Set<string>;
let _solSet: Set<string>;

function _load(): void {
  if (_btcSet && _solSet) return; // already loaded
  try {
    const raw: StoreData = JSON.parse(fs.readFileSync(config.storeFile, "utf8"));
    _btcSet = new Set(raw.btcTxs ?? []);
    _solSet = new Set(raw.solTxs ?? []);
  } catch {
    _btcSet = new Set();
    _solSet = new Set();
  }
}

function _persist(): void {
  const data: StoreData = {
    btcTxs: [..._btcSet],
    solTxs: [..._solSet],
  };
  fs.writeFileSync(config.storeFile, JSON.stringify(data, null, 2), "utf8");
}

export function isBtcProcessed(txid: string): boolean {
  _load();
  return _btcSet.has(txid);
}

export function markBtcProcessed(txid: string): void {
  _load();
  _btcSet.add(txid);
  _persist();
}

export function isSolProcessed(signature: string): boolean {
  _load();
  return _solSet.has(signature);
}

export function markSolProcessed(signature: string): void {
  _load();
  _solSet.add(signature);
  _persist();
}
