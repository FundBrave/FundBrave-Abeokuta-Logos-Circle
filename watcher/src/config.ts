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
  btcPollIntervalMs: parseInt(optional_env("BTC_POLL_INTERVAL_MS", "30000")),
  solPollIntervalMs: parseInt(optional_env("SOL_POLL_INTERVAL_MS", "10000")),

  // ── State ──────────────────────────────────────────────────────────────
  /** JSON file to persist processed tx hashes/signatures */
  storeFile: optional_env("STORE_FILE", path.resolve(__dirname, "..", "processed_txs.json")),

  // ── Price feed ─────────────────────────────────────────────────────────
  /** CoinGecko price cache TTL in ms */
  priceCacheTtlMs: parseInt(optional_env("PRICE_CACHE_TTL_MS", "60000")),

  // ── Min donation threshold ─────────────────────────────────────────────
  /** Minimum USD value of a deposit to trigger a donation (avoids dust) */
  minDonationUsd: parseFloat(optional_env("MIN_DONATION_USD", "1.0")),
} as const;
