/**
 * Abeokuta Mini — Centralized deposit watcher
 *
 * Detects BTC and SOL deposits to the campaign's watch addresses,
 * converts them to USDC value, and calls donateUSDC() on the Base campaign
 * contract using the float wallet pattern.
 *
 * Usage:
 *   cp .env.example .env   # fill in your values
 *   npm run dev            # run in watch mode
 *
 * W-L1: Exposes GET /health on HEALTH_PORT (default 3001) for container probes.
 * W-M2: Float wallet warning threshold tied to minDonationUsd (not hardcoded).
 * Dedup: Poll cycles skip if a previous cycle is still running.
 */

import * as http from "http";
import { config } from "./config";
import { initStore } from "./store";
import { pollBtc } from "./watchers/btcWatcher";
import { pollSol } from "./watchers/solWatcher";
import { getFloatBalance } from "./contract";
import { formatUnits } from "viem";
import { logger } from "./logger";

// ── Health state ───────────────────────────────────────────────────────────────

let _lastBtcPollAt = 0;
let _lastSolPollAt = 0;
let _startedAt     = 0;

// ── Startup banner ─────────────────────────────────────────────────────────────

async function printStartupInfo(): Promise<void> {
  logger.info("=".repeat(60));
  logger.info(" Abeokuta Mini — Deposit Watcher");
  logger.info("=".repeat(60));
  logger.info(`Campaign contract : ${config.campaignAddress}`);
  logger.info(`USDC contract     : ${config.usdcAddress}`);
  logger.info(`BTC address       : ${config.btcAddress || "(not configured)"}`);
  logger.info(`SOL address       : ${config.solAddress || "(not configured)"}`);
  logger.info(`BTC poll interval : ${config.btcPollIntervalMs / 1000}s`);
  logger.info(`SOL poll interval : ${config.solPollIntervalMs / 1000}s`);
  logger.info(`BTC min confirms  : ${config.btcMinConfirmations}`);

  try {
    const floatBal = await getFloatBalance();
    logger.info(`Float wallet USDC : ${formatUnits(floatBal, 6)} USDC`);

    // W-M2: Threshold is 10× minDonationUsd (not a hardcoded 10 USDC)
    const warnThreshold = BigInt(Math.ceil(config.minDonationUsd * 10)) * 1_000_000n;
    if (floatBal < warnThreshold) {
      logger.warn(
        `Float wallet has less than ${formatUnits(warnThreshold, 6)} USDC ` +
        `(10× min donation) — top up before expecting deposits!`,
        { balance: formatUnits(floatBal, 6), threshold: formatUnits(warnThreshold, 6) }
      );
    }
  } catch (err) {
    logger.error("Could not fetch float wallet balance", { error: String(err) });
  }

  logger.info("=".repeat(60));
}

// ── Health check HTTP server ───────────────────────────────────────────────────

function startHealthServer(): void {
  if (config.healthPort === 0) {
    logger.info("[health] Health server disabled (HEALTH_PORT=0)");
    return;
  }

  const server = http.createServer((req, res) => {
    if (req.url !== "/health") {
      res.writeHead(404);
      res.end();
      return;
    }

    const now = Date.now();
    const body = JSON.stringify({
      status:       "ok",
      uptimeSec:    Math.floor((now - _startedAt) / 1_000),
      btcLastPollAt: _lastBtcPollAt ? new Date(_lastBtcPollAt).toISOString() : null,
      solLastPollAt: _lastSolPollAt ? new Date(_lastSolPollAt).toISOString() : null,
      btcAddress:   config.btcAddress || null,
      solAddress:   config.solAddress || null,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });

  server.listen(config.healthPort, () => {
    logger.info(`[health] HTTP server listening on :${config.healthPort}/health`);
  });

  server.on("error", (err) => {
    logger.error("[health] HTTP server error", { error: String(err) });
  });
}

// ── Shutdown state ─────────────────────────────────────────────────────────────

let _shuttingDown = false;
const _intervals: NodeJS.Timeout[] = [];

// ── Polling loops ──────────────────────────────────────────────────────────────

function startBtcPolling(): void {
  if (!config.btcAddress) {
    logger.info("[btc] No BTC_ADDRESS configured — watcher disabled");
    return;
  }
  logger.info(`[btc] Polling every ${config.btcPollIntervalMs / 1000}s (min ${config.btcMinConfirmations} confirmations)`);

  // Dedup guard — prevents overlapping poll cycles
  let _running = false;

  const run = async () => {
    if (_shuttingDown || _running) return;
    _running = true;
    try {
      await pollBtc();
      _lastBtcPollAt = Date.now();
    } catch (err) {
      logger.error("[btc] Unhandled error in poll", { error: String(err) });
    } finally {
      _running = false;
    }
  };

  run(); // immediate first poll
  _intervals.push(setInterval(run, config.btcPollIntervalMs));
}

function startSolPolling(): void {
  if (!config.solAddress) {
    logger.info("[sol] No SOL_ADDRESS configured — watcher disabled");
    return;
  }
  logger.info(`[sol] Polling every ${config.solPollIntervalMs / 1000}s`);

  // Dedup guard — prevents overlapping poll cycles
  let _running = false;

  const run = async () => {
    if (_shuttingDown || _running) return;
    _running = true;
    try {
      await pollSol();
      _lastSolPollAt = Date.now();
    } catch (err) {
      logger.error("[sol] Unhandled error in poll", { error: String(err) });
    } finally {
      _running = false;
    }
  };

  run(); // immediate first poll
  _intervals.push(setInterval(run, config.solPollIntervalMs));
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logger.info(`[shutdown] Received ${signal} — stopping polling...`);

  for (const id of _intervals) clearInterval(id);

  // Give in-flight operations a moment to complete
  await new Promise((r) => setTimeout(r, 2_000));
  logger.info("[shutdown] Bye!");
  process.exit(0);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  _startedAt = Date.now();

  // Register signal handlers BEFORE initStore() and any async work so there is
  // no window where a SIGINT/SIGTERM goes unhandled. store.ts relies on this
  // ordering and does not register its own SIGINT/SIGTERM handlers.
  process.on("SIGINT",  () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // W-H3: Acquire instance lock and clean up any crash artifacts
  initStore();

  await printStartupInfo();
  startHealthServer();
  startBtcPolling();
  startSolPolling();
}

main().catch((err) => {
  logger.error("Fatal startup error", { error: String(err) });
  process.exit(1);
});
