import * as fs from "fs";
import * as path from "path";

function require_env(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optional_env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

// Load .env file manually (no dotenv dependency)
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

export const config = {
  // ── EVM / Base ─────────────────────────────────────────────────────────
  /** Base RPC endpoint (mainnet or Sepolia) */
  baseRpcUrl:        require_env("BASE_RPC_URL"),
  /** 0x-prefixed private key of the float wallet on Base */
  watcherPrivateKey: require_env("WATCHER_PRIVATE_KEY"),
  /** AbeokutaCampaign contract address on Base */
  campaignAddress:   require_env("CAMPAIGN_ADDRESS") as `0x${string}`,
  /** AbeokutaStaking contract address on Base (optional — harvest disabled if not set) */
  stakingAddress:    optional_env("STAKING_ADDRESS", "") as `0x${string}` | "",
  /** USDC contract address on Base */
  usdcAddress:       require_env("USDC_ADDRESS") as `0x${string}`,

  // ── Bitcoin ────────────────────────────────────────────────────────────
  /** Bitcoin address to watch for deposits */
  btcAddress:        optional_env("BTC_ADDRESS", ""),
  /** Blockstream API base URL */
  blockstreamApiUrl: optional_env("BLOCKSTREAM_API_URL", "https://blockstream.info/api"),

  // ── Solana ─────────────────────────────────────────────────────────────
  /** Solana address to watch for deposits */
  solAddress:        optional_env("SOL_ADDRESS", ""),
  /** Solana RPC endpoint */
  solRpcUrl:         optional_env("SOL_RPC_URL", "https://api.mainnet-beta.solana.com"),
  /** USDC mint on Solana (mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v) */
  solUsdcMint:       optional_env("SOL_USDC_MINT", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),

  // ── Polling intervals ──────────────────────────────────────────────────
  btcPollIntervalMs:     parseInt(optional_env("BTC_POLL_INTERVAL_MS", "30000")),
  solPollIntervalMs:     parseInt(optional_env("SOL_POLL_INTERVAL_MS", "10000")),
  /** Gap #1: How often to call harvestAndDistribute on the staking contract (default 24h) */
  harvestIntervalMs:     parseInt(optional_env("HARVEST_INTERVAL_MS", String(24 * 60 * 60 * 1000))),

  // ── Bitcoin confirmations ──────────────────────────────────────────────
  /**
   * Minimum BTC confirmations before processing a deposit.
   * W-C4: Default raised to 6 (industry standard ~1 hour) to guard against
   * chain reorgs. A reorg at depth 3 could undo the BTC payment after USDC
   * is already irreversibly credited on Base.
   */
  btcMinConfirmations: parseInt(optional_env("BTC_MIN_CONFIRMATIONS", "6")),

  // ── State ──────────────────────────────────────────────────────────────
  /** JSON file to persist processed tx hashes/signatures */
  storeFile: optional_env("STORE_FILE", path.resolve(__dirname, "..", "processed_txs.json")),

  // ── Price feed ─────────────────────────────────────────────────────────
  /** CoinGecko price cache TTL in ms */
  priceCacheTtlMs: parseInt(optional_env("PRICE_CACHE_TTL_MS", "60000")),
  /**
   * W-C3: Log a warning when using a stale price older than this (seconds).
   * Default: 60s — at this age the price is stale but still usable.
   */
  stalePriceWarnSec: parseInt(optional_env("STALE_PRICE_WARN_SEC", "60")),
  /**
   * W-C3: Refuse to use stale prices older than this (seconds).
   * Default: 120s — beyond 2 min in volatile markets the price error is unacceptable.
   */
  stalePriceMaxSec: parseInt(optional_env("STALE_PRICE_MAX_SEC", "120")),

  // ── Min/max donation threshold ────────────────────────────────────────
  /** Minimum USD value of a deposit to trigger a donation (avoids dust) */
  minDonationUsd: parseFloat(optional_env("MIN_DONATION_USD", "1.0")),
  /**
   * F-005: Maximum USD value of a single deposit the watcher will process.
   * Guards against over-crediting when the price oracle returns a stale high value.
   * The on-chain circuit breaker caps at 5,000 USDC/tx, but this watcher-side cap
   * prevents wasted on-chain tx attempts and provides an earlier signal of anomalies.
   * Default: $5,000 (matches on-chain circuit breaker per-tx limit).
   */
  maxDonationUsd: parseFloat(optional_env("MAX_DONATION_USD", "5000")),

  // ── Health check server ────────────────────────────────────────────────
  /**
   * W-L1: HTTP port for the /health endpoint used by Kubernetes/Docker probes.
   * Set to 0 to disable.
   */
  healthPort: parseInt(optional_env("HEALTH_PORT", "3001")),
} as const;
