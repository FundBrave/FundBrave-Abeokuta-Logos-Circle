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
 */

import { config } from "./config";
import { pollBtc } from "./watchers/btcWatcher";
import { pollSol } from "./watchers/solWatcher";
import { getFloatBalance } from "./contract";
import { formatUnits } from "viem";

// ── Startup banner ─────────────────────────────────────────────────────────────

async function printStartupInfo(): Promise<void> {
  console.log("=".repeat(60));
  console.log(" Abeokuta Mini — Deposit Watcher");
  console.log("=".repeat(60));
  console.log(`Campaign contract : ${config.campaignAddress}`);
  console.log(`USDC contract     : ${config.usdcAddress}`);
  console.log(`BTC address       : ${config.btcAddress || "(not configured)"}`);
  console.log(`SOL address       : ${config.solAddress || "(not configured)"}`);
  console.log(`BTC poll interval : ${config.btcPollIntervalMs / 1000}s`);
  console.log(`SOL poll interval : ${config.solPollIntervalMs / 1000}s`);

  try {
    const floatBal = await getFloatBalance();
    console.log(`Float wallet USDC : ${formatUnits(floatBal, 6)} USDC`);
    if (floatBal < 10_000_000n) {
      console.warn(
        "⚠  Float wallet has less than 10 USDC — top up before expecting deposits!"
      );
    }
  } catch (err) {
    console.error("Could not fetch float wallet balance:", err);
  }

  console.log("=".repeat(60));
}

// ── Polling loops ──────────────────────────────────────────────────────────────

function startBtcPolling(): void {
  if (!config.btcAddress) {
    console.log("[btc] No BTC_ADDRESS configured — watcher disabled");
    return;
  }
  console.log(`[btc] Polling every ${config.btcPollIntervalMs / 1000}s`);

  const run = async () => {
    try {
      await pollBtc();
    } catch (err) {
      console.error("[btc] Unhandled error in poll:", err);
    }
  };

  run(); // immediate first poll
  setInterval(run, config.btcPollIntervalMs);
}

function startSolPolling(): void {
  if (!config.solAddress) {
    console.log("[sol] No SOL_ADDRESS configured — watcher disabled");
    return;
  }
  console.log(`[sol] Polling every ${config.solPollIntervalMs / 1000}s`);

  const run = async () => {
    try {
      await pollSol();
    } catch (err) {
      console.error("[sol] Unhandled error in poll:", err);
    }
  };

  run(); // immediate first poll
  setInterval(run, config.solPollIntervalMs);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await printStartupInfo();
  startBtcPolling();
  startSolPolling();

  // Keep process alive
  process.on("SIGINT",  () => { console.log("\nShutting down..."); process.exit(0); });
  process.on("SIGTERM", () => { console.log("\nShutting down..."); process.exit(0); });
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
