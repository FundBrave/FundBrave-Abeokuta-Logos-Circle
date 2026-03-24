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

// W-C2: fn may return T or Promise<T>. Using Promise.resolve() flattens the nested
// promise so async callbacks are awaited and their errors are correctly propagated.
function _enqueue<T>(fn: () => T | Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    _queue = _queue.then(() => Promise.resolve(fn()).then(resolve, reject));
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

// Saved at initStore() time for use by verifyAndResolveStalePending()
let _staleBtcPending: Record<string, number> = {};
let _staleSolPending: Record<string, number> = {};

/**
 * On restart, stale pending entries are saved for async verification.
 * We do NOT delete them here — that happens in verifyAndResolveStalePending()
 * after checking the Base chain. The in-memory Sets still include them so
 * duplicate processing within the same run is prevented.
 */
function _captureStalePending(data: StoreData): void {
  const now = Date.now();
  for (const [txid, startedAt] of Object.entries(data.btcPending)) {
    logger.warn("[store] Found in-flight BTC tx from previous run — verifying on-chain", {
      txid, ageSec: Math.floor((now - startedAt) / 1000),
    });
    _staleBtcPending[txid] = startedAt;
  }
  for (const [sig, startedAt] of Object.entries(data.solPending)) {
    logger.warn("[store] Found in-flight SOL tx from previous run — verifying on-chain", {
      sig, ageSec: Math.floor((now - startedAt) / 1000),
    });
    _staleSolPending[sig] = startedAt;
  }
}

/**
 * W-C1: Verify stale pending entries against the Base chain before deciding to retry.
 *
 * For each entry: if a Donated event from the float wallet is found in the relevant
 * block range, mark it as processed (no retry). Otherwise, clear it for retry.
 *
 * @param checker  Async function that queries Base chain for a Donated event.
 *                 Passed in from contract.ts to avoid circular imports.
 */
export async function verifyAndResolveStalePending(
  checker: (startedAtMs: number) => Promise<boolean>
): Promise<void> {
  const btcEntries = Object.entries(_staleBtcPending);
  const solEntries = Object.entries(_staleSolPending);
  if (btcEntries.length === 0 && solEntries.length === 0) return;

  for (const [txid, startedAt] of btcEntries) {
    const alreadyDonated = await checker(startedAt);
    if (alreadyDonated) {
      logger.info("[store] W-C1: Base chain confirms BTC tx was donated — marking processed", { txid });
      await markBtcProcessed(txid);
    } else {
      logger.warn("[store] W-C1: BTC tx not confirmed on Base — clearing for retry", { txid });
      await clearBtcPending(txid);
    }
    delete _staleBtcPending[txid];
  }

  for (const [sig, startedAt] of solEntries) {
    const alreadyDonated = await checker(startedAt);
    if (alreadyDonated) {
      logger.info("[store] W-C1: Base chain confirms SOL tx was donated — marking processed", { sig });
      await markSolProcessed(sig);
    } else {
      logger.warn("[store] W-C1: SOL tx not confirmed on Base — clearing for retry", { sig });
      await clearSolPending(sig);
    }
    delete _staleSolPending[sig];
  }
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
  _captureStalePending(data); // W-C1: save stale entries; resolution happens async in verifyAndResolveStalePending()

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
