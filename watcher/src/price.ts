/**
 * Price feed via CoinGecko free API.
 * No API key required. Results cached for priceCacheTtlMs.
 *
 * W-C2: All API values are validated before use (finite, positive, < $1M).
 * W-C3: Stale price window reduced to stalePriceMaxSec (default 120s).
 *       A WARN is logged when price age exceeds stalePriceWarnSec (default 60s).
 */

import axios from "axios";
import { config } from "./config";
import { logger } from "./logger";

interface PriceCache {
  btcUsd: number;
  solUsd: number;
  fetchedAt: number;
}

let _cache: PriceCache | null = null;
let _lastKnownCache: PriceCache | null = null;

export async function getBtcPrice(): Promise<number> {
  await _refreshIfStale();
  if (!_cache) throw new Error("No BTC price available");
  return _cache.btcUsd;
}

export async function getSolPrice(): Promise<number> {
  await _refreshIfStale();
  if (!_cache) throw new Error("No SOL price available");
  return _cache.solUsd;
}

/**
 * W-C2: Validates that a price value from the API is a finite positive number
 * within a plausible range ($0 < price < $1,000,000).
 */
function validatePrice(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) {
    throw new Error(`Invalid ${name} price from API: ${JSON.stringify(value)}`);
  }
  return n;
}

async function _refreshIfStale(): Promise<void> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < config.priceCacheTtlMs) return;

  try {
    const { data } = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: { ids: "bitcoin,solana", vs_currencies: "usd" },
        timeout: 10_000,
      }
    );

    // W-C2: Validate before storing
    const btcUsd = validatePrice(data?.bitcoin?.usd, "BTC/USD");
    const solUsd = validatePrice(data?.solana?.usd, "SOL/USD");

    _cache = { btcUsd, solUsd, fetchedAt: now };
    _lastKnownCache = { ..._cache };

    logger.info(`[price] BTC=$${btcUsd.toLocaleString()}  SOL=$${solUsd.toFixed(2)}`);
  } catch (err) {
    logger.error("[price] CoinGecko fetch failed", { error: String(err) });

    if (_lastKnownCache) {
      const staleSec = Math.floor((now - _lastKnownCache.fetchedAt) / 1_000);

      // W-C3: Hard ceiling — refuse prices older than stalePriceMaxSec (default 120s)
      if (staleSec >= config.stalePriceMaxSec) {
        _cache = null;
        logger.error(
          `[price] Stale price is ${staleSec}s old (limit: ${config.stalePriceMaxSec}s) — refusing to use`,
          { staleSec, limit: config.stalePriceMaxSec }
        );
        return;
      }

      // W-C3: Warn when entering the stale zone (> stalePriceWarnSec)
      if (staleSec >= config.stalePriceWarnSec) {
        logger.warn(
          `[price] Using stale price (${staleSec}s old) — market moves may affect donation accuracy`,
          { staleSec, warnThreshold: config.stalePriceWarnSec, maxThreshold: config.stalePriceMaxSec }
        );
      } else {
        logger.warn(`[price] Using cached price (${staleSec}s old)`);
      }

      _cache = _lastKnownCache;
    }
  }
}
