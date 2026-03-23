/**
 * Price feed via CoinGecko free API.
 * No API key required. Results cached for priceCacheTtlMs.
 */

import axios from "axios";
import { config } from "./config";

interface PriceCache {
  btcUsd: number;
  solUsd: number;
  fetchedAt: number;
}

let _cache: PriceCache | null = null;

export async function getBtcPrice(): Promise<number> {
  await _refreshIfStale();
  return _cache!.btcUsd;
}

export async function getSolPrice(): Promise<number> {
  await _refreshIfStale();
  return _cache!.solUsd;
}

async function _refreshIfStale(): Promise<void> {
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < config.priceCacheTtlMs) return;

  const { data } = await axios.get(
    "https://api.coingecko.com/api/v3/simple/price",
    {
      params: { ids: "bitcoin,solana", vs_currencies: "usd" },
      timeout: 10_000,
    }
  );

  _cache = {
    btcUsd: data.bitcoin.usd as number,
    solUsd: data.solana.usd as number,
    fetchedAt: now,
  };

  console.log(
    `[price] BTC=$${_cache.btcUsd.toLocaleString()}  SOL=$${_cache.solUsd.toFixed(2)}`
  );
}
