/**
 * File-backed store for processed transaction hashes/signatures.
 * Uses a serial queue + atomic writes to prevent race conditions.
 *
 * Lock file: prevents multiple watcher instances using atomic fs.openSync('wx').
 *
 * In-memory Sets: `_btcSeen` and `_solSeen` are the authoritative source for
 * isBtcProcessed / isSolProcessed. They include both fully-processed and in-flight
 * (pending) entries, ensuring that:
 *   1. The same txid is never processed twice in one poll cycle (Bug 5 fix).
 *   2. Reads are O(1) and consistent regardless of pending disk writes.
 *
 * Idempotency (crash safety):
 *   Deposits move through: unprocessed → pending → processed.
 *   On restart, stale pending entries are cleared and retried (not auto-promoted
 *   to processed), accepting the theoretical risk of a duplicate Base donation in
 *   exchange for never silently losing a donation.
 */

import * as fs from "fs";
import * as path from "path";
import { config } from "./config";
import { logger } from "./logger";

interface StoreData {
  btcTxs:     string[];               // fully processed
  solTxs:     string[];               // fully processed
  btcPending: Record<string, number>; // txid → startedAt (unix ms)
  solPending: Record<string, number>; // sig  → startedAt (unix ms)
}

// In-memory authoritative Sets — populated from disk at startup,
// then kept in sync by each mutating operation.
const _btcSeen = new Set<string>(); // btcTxs + btcPending keys
const _solSeen = new Set<string>(); // solTxs + solPending keys

// Serial queue to prevent concurrent disk read/write races
let _queue: Promise<void> = Promise.resolve();

function _enqueue<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    _queue = _queue.then(() => {
      try {
        resolve(fn());
      } catch (err) {
        reject(err);
      }
    });
  });
}

function _readFromDisk(): StoreData {
  try {
    const raw = JSON.parse(fs.readFileSync(config.storeFile, "utf8"));
    return {
      btcTxs:     raw.btcTxs     ?? [],
      solTxs:     raw.solTxs     ?? [],
      btcPending: raw.btcPending ?? {},
      solPending: raw.solPending ?? {},
    };
  } catch {
    return { btcTxs: [], solTxs: [], btcPending: {}, solPending: {} };
  }
}

function _atomicWrite(data: StoreData): void {
  const json = JSON.stringify(data, null, 2);
  const tmpFile = config.storeFile + `.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, json, "utf8");
  fs.renameSync(tmpFile, config.storeFile);
}

// ── Lock file ─────────────────────────────────────────────────────────────────

const _lockFile = config.storeFile + ".lock";

/**
 * Atomically acquires the lock file using fs.openSync('wx').
 * 'wx' = exclusive create: fails with EEXIST if the file already exists.
 * This is an atomic OS-level operation, eliminating the TOCTOU race
 * that exists between existsSync() + writeFileSync().
 */
function _acquireLock(): void {
  try {
    const fd = fs.openSync(_lockFile, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;

    // Lock file exists — check if the owning PID is still alive
    let rawPid: string;
    try {
      rawPid = fs.readFileSync(_lockFile, "utf8").trim();
    } catch {
      // Can't read it — likely a partial write; remove and retry
      try { fs.unlinkSync(_lockFile); } catch {}
      return _acquireLock();
    }

    const pid = parseInt(rawPid, 10);
    if (isNaN(pid)) {
      // Corrupted lock file
      fs.unlinkSync(_lockFile);
      return _acquireLock();
    }

    try {
      process.kill(pid, 0); // signal 0 = liveness check only
      // PID is alive — another instance is running
      throw new Error(
        `Another watcher instance is already running (PID ${pid}). ` +
        `Remove ${_lockFile} to override.`
      );
    } catch (killErr: any) {
      if (killErr.code === "ESRCH") {
        // Process not running — stale lock
        logger.warn("[store] Stale lock file found (process not running) — removing", { pid });
        fs.unlinkSync(_lockFile);
        return _acquireLock();
      }
      throw killErr; // re-throw our "already running" error
    }
  }
}

function _releaseLock(): void {
  try { fs.unlinkSync(_lockFile); } catch {}
}

// ── Orphaned temp file cleanup ────────────────────────────────────────────────

function _cleanOrphanedTempFiles(): void {
  const dir  = path.dirname(config.storeFile);
  const base = path.basename(config.storeFile);
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.startsWith(base + ".tmp.")) {
        fs.unlinkSync(path.join(dir, file));
        logger.warn("[store] Cleaned up orphaned temp file", { file });
      }
    }
  } catch {
    // Non-fatal — directory may not exist yet
  }
}

// ── Stale pending entry resolution ───────────────────────────────────────────

/**
 * On restart, any pending entries are cleared and retried.
 * We do NOT auto-promote to processed — retrying is safer than silently
 * losing a donation. The lock file prevents two instances from running
 * concurrently, making duplicate donations from retry rare.
 */
function _resolveStalePending(data: StoreData): void {
  let changed = false;
  const now = Date.now();

  for (const [txid, startedAt] of Object.entries(data.btcPending)) {
    logger.warn("[store] Found in-flight BTC tx from previous run — will retry", {
      txid, ageSec: Math.floor((now - startedAt) / 1000),
    });
    delete data.btcPending[txid];
    changed = true;
    // NOTE: intentionally NOT added to btcTxs — will be retried this run.
    // If the Base tx actually confirmed, this causes one duplicate donation.
    // That is preferable to silently missing the donation.
  }

  for (const [sig, startedAt] of Object.entries(data.solPending)) {
    logger.warn("[store] Found in-flight SOL tx from previous run — will retry", {
      sig, ageSec: Math.floor((now - startedAt) / 1000),
    });
    delete data.solPending[sig];
    changed = true;
  }

  if (changed) _atomicWrite(data);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Must be called once at startup before any polling begins.
 * Acquires the instance lock, cleans up crash artifacts, and populates
 * in-memory Sets from the persisted store.
 *
 * Signal handlers (SIGINT/SIGTERM) are intentionally NOT registered here.
 * index.ts registers those before calling initStore() so there is no
 * window where a signal goes unhandled.
 */
export function initStore(): void {
  _cleanOrphanedTempFiles();
  _acquireLock();

  const data = _readFromDisk();
  _resolveStalePending(data);

  // Populate in-memory Sets from disk state
  data.btcTxs.forEach((t) => _btcSeen.add(t));
  Object.keys(data.btcPending).forEach((t) => _btcSeen.add(t));
  data.solTxs.forEach((t) => _solSeen.add(t));
  Object.keys(data.solPending).forEach((t) => _solSeen.add(t));

  // Release lock on any process exit (including process.exit() calls)
  process.on("exit", _releaseLock);
}

// ── BTC ───────────────────────────────────────────────────────────────────────

/**
 * Returns true if this txid has been processed OR is currently in-flight.
 * Reads from in-memory Set — O(1), consistent with pending disk writes.
 */
export function isBtcProcessed(txid: string): boolean {
  return _btcSeen.has(txid);
}

/** Mark txid as in-flight (donation started but not yet confirmed on Base). */
export async function markBtcPending(txid: string): Promise<void> {
  _btcSeen.add(txid); // immediate in-memory update prevents same-cycle duplicates
  return _enqueue(() => {
    const data = _readFromDisk();
    if (!data.btcPending[txid]) {
      data.btcPending[txid] = Date.now();
      _atomicWrite(data);
    }
  });
}

/** Move txid from pending → processed (donation confirmed on Base). */
export async function markBtcProcessed(txid: string): Promise<void> {
  _btcSeen.add(txid); // already there, but explicit
  return _enqueue(() => {
    const data = _readFromDisk();
    delete data.btcPending[txid];
    if (!data.btcTxs.includes(txid)) data.btcTxs.push(txid);
    _atomicWrite(data);
  });
}

/**
 * Remove txid from pending (donation failed — allow retry on next poll cycle).
 * Removes from in-memory Set so the next poll cycle will attempt it again.
 */
export async function clearBtcPending(txid: string): Promise<void> {
  _btcSeen.delete(txid); // allow re-processing on next poll cycle
  return _enqueue(() => {
    const data = _readFromDisk();
    delete data.btcPending[txid];
    _atomicWrite(data);
  });
}

// ── SOL ───────────────────────────────────────────────────────────────────────

/**
 * Returns true if this signature has been processed OR is currently in-flight.
 * Reads from in-memory Set — O(1), consistent with pending disk writes.
 */
export function isSolProcessed(signature: string): boolean {
  return _solSeen.has(signature);
}

/** Mark signature as in-flight (donation started but not yet confirmed on Base). */
export async function markSolPending(signature: string): Promise<void> {
  _solSeen.add(signature);
  return _enqueue(() => {
    const data = _readFromDisk();
    if (!data.solPending[signature]) {
      data.solPending[signature] = Date.now();
      _atomicWrite(data);
    }
  });
}

/** Move signature from pending → processed (donation confirmed on Base). */
export async function markSolProcessed(signature: string): Promise<void> {
  _solSeen.add(signature);
  return _enqueue(() => {
    const data = _readFromDisk();
    delete data.solPending[signature];
    if (!data.solTxs.includes(signature)) data.solTxs.push(signature);
    _atomicWrite(data);
  });
}

/**
 * Remove signature from pending (donation failed — allow retry on next poll cycle).
 */
export async function clearSolPending(signature: string): Promise<void> {
  _solSeen.delete(signature);
  return _enqueue(() => {
    const data = _readFromDisk();
    delete data.solPending[signature];
    _atomicWrite(data);
  });
}
