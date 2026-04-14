/**
 * Contract configuration for Abeokuta Mini
 * Addresses, ABIs, and chain configuration
 */

import type { Address } from "viem";
import { base, baseSepolia } from "wagmi/chains";

// ─── Env var validation ────────────────────────────────────────────────────────
//
// IMPORTANT: Next.js only inlines NEXT_PUBLIC_* variables when accessed via
// static literal property names: process.env.NEXT_PUBLIC_FOO.
// Dynamic access like process.env[name] is NOT inlined and arrives as undefined
// in the client bundle. So we pass the already-resolved value into validators.

/** Validate that a resolved env var value is present. */
function requireEnv(name: string, val: string | undefined, fallback?: string): string {
  const resolved = val || fallback;
  if (!resolved) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Check your .env.local file or deployment configuration.`
    );
  }
  return resolved;
}

/** FE-C2: Validate that a resolved env var value is a valid EVM address. */
function requireAddress(name: string, val: string | undefined, fallback?: string): Address {
  const resolved = requireEnv(name, val, fallback);
  if (!/^0x[a-fA-F0-9]{40}$/.test(resolved)) {
    throw new Error(
      `Environment variable ${name} ("${resolved}") is not a valid EVM address. ` +
      `Expected 0x followed by 40 hex characters.`
    );
  }
  return resolved as Address;
}

// ─── Chain IDs ────────────────────────────────────────────────────────────────

export const TARGET_CHAIN    = base;  // mainnet
export const TARGET_CHAIN_ID = base.id;

// ─── Contract Addresses ───────────────────────────────────────────────────────
// These are populated after deployment. Update from deployments/<chainId>.json

// Each process.env.NEXT_PUBLIC_* is a static literal access — Next.js inlines
// these at compile time so they are available in the client bundle.
const ADDRESSES_SEPOLIA = {
  campaign:        requireAddress("NEXT_PUBLIC_CAMPAIGN_ADDRESS",  process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS),
  staking:         requireAddress("NEXT_PUBLIC_STAKING_ADDRESS",   process.env.NEXT_PUBLIC_STAKING_ADDRESS),
  usdc:            requireAddress("NEXT_PUBLIC_USDC_ADDRESS",      process.env.NEXT_PUBLIC_USDC_ADDRESS, "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE"),
  treasury:        requireAddress("NEXT_PUBLIC_TREASURY_ADDRESS",  process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
  fundBraveBridge: requireAddress("NEXT_PUBLIC_BRIDGE_ADDRESS",    process.env.NEXT_PUBLIC_BRIDGE_ADDRESS, "0x0000000000000000000000000000000000000000"),
};

export const CONTRACT_ADDRESSES = ADDRESSES_SEPOLIA;

export const USDC_DECIMALS = 6;

// ─── Non-EVM manual donation addresses ───────────────────────────────────────
// These are treasury-controlled wallets monitored by the campaign organisers.
// Donations are manually converted to USDC and credited within 24–48 hours.

export const MANUAL_DONATION_ADDRESSES = {
  bitcoin: process.env.NEXT_PUBLIC_BTC_ADDRESS  || "",
  solana:  process.env.NEXT_PUBLIC_SOL_ADDRESS  || "",
};

// ─── Campaign parameters ─────────────────────────────────────────────────────

export const CAMPAIGN_GOAL_MIN_USDC = 2_000;  // $2,000
export const CAMPAIGN_GOAL_MAX_USDC = 2_000;  // $2,000

// ─── FE-L3: Centralized UI constants ─────────────────────────────────────────
// Keeping these in one place ensures they stay in sync with on-chain limits.

/** Minimum donation accepted by the contract ($1 USDC) */
export const MIN_DONATION_USD = 1;
/** Maximum per-transaction donation (circuit breaker: 5000 USDC/tx) */
export const MAX_DONATION_USD = 5_000;
/** FE-M2: Prompt for confirmation when donation exceeds this threshold */
export const HIGH_VALUE_USD = 500;

/** Quick-select amounts shown on the donate page (USDC/stablecoin) */
export const PRESET_AMOUNTS = [10, 25, 50, 100, 250] as const;
/** Quick-select amounts for native ETH / WETH donations */
export const PRESET_AMOUNTS_ETH = [0.005, 0.01, 0.025, 0.05, 0.1] as const;
/** Quick-select amounts shown on the stake page */
export const STAKE_PRESETS  = [50, 100, 250, 500] as const;

// ─── Supported tokens for donation ───────────────────────────────────────────

export interface TokenInfo {
  symbol:   string;
  name:     string;
  address:  Address | "native";
  decimals: number;
  isNative: boolean;
  coingeckoId?: string;
}

export const SUPPORTED_TOKENS: TokenInfo[] = [
  {
    symbol:      "USDC",
    name:        "USD Coin",
    address:     CONTRACT_ADDRESSES.usdc,
    decimals:    6,
    isNative:    false,
    coingeckoId: "usd-coin",
  },
  {
    symbol:      "ETH",
    name:        "Ethereum",
    address:     "native",
    decimals:    18,
    isNative:    true,
    coingeckoId: "ethereum",
  },
  {
    symbol:      "DAI",
    name:        "Dai Stablecoin",
    // FE-H4: Fallback address is testnet-only. On mainnet, NEXT_PUBLIC_DAI_ADDRESS must be set
    // explicitly — a missing env var on mainnet would silently use a wrong contract address.
    address:     requireAddress(
      "NEXT_PUBLIC_DAI_ADDRESS",
      process.env.NEXT_PUBLIC_DAI_ADDRESS,
      (TARGET_CHAIN_ID as number) !== 8453 ? "0xD5F45AE6088fE7DadA621C8A70F94abE3F46f7Bf" : undefined
    ),
    decimals:    18,
    isNative:    false,
    coingeckoId: "dai",
  },
  {
    symbol:      "WETH",
    name:        "Wrapped Ether",
    // FE-H4: Same mainnet guard as DAI.
    address:     requireAddress(
      "NEXT_PUBLIC_WETH_ADDRESS",
      process.env.NEXT_PUBLIC_WETH_ADDRESS,
      (TARGET_CHAIN_ID as number) !== 8453 ? "0x8140C9fE21D9639FD69E9eF345Be39d767eE7FE2" : undefined
    ),
    decimals:    18,
    isNative:    false,
    coingeckoId: "weth",
  },
];

// ─── LayerZero destination EIDs ──────────────────────────────────────────────

export const DST_EID_BASE_SEPOLIA = 40245;   // testnet
export const DST_EID_BASE         = 30184;   // mainnet
export const DST_EID              = DST_EID_BASE_SEPOLIA; // switch to mainnet when ready

// ─── Source chains for cross-chain donations ──────────────────────────────────

export interface SourceChain {
  name:        string;
  chainId:     number;
  lzEid:       number;   // LayerZero endpoint ID (used by THIS chain as source)
  icon:        string;
  usdcAddress: Address;  // USDC contract on this chain
  bridgeAddress: Address; // FundBraveBridge deployed on this chain
  nativeCurrency: string;
}

export const SOURCE_CHAINS: SourceChain[] = [
  {
    name:           "Base Sepolia",
    chainId:        84532,
    lzEid:          40245,
    icon:           "🔵",
    usdcAddress:    (process.env.NEXT_PUBLIC_USDC_ADDRESS   || "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE") as Address,
    bridgeAddress:  (process.env.NEXT_PUBLIC_BRIDGE_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
    nativeCurrency: "ETH",
  },
  {
    name:           "Base",
    chainId:        8453,
    lzEid:          30184,
    icon:           "🔵",
    usdcAddress:    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
    bridgeAddress:  (process.env.NEXT_PUBLIC_BRIDGE_BASE_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
    nativeCurrency: "ETH",
  },
  {
    name:           "Ethereum",
    chainId:        1,
    lzEid:          30101,
    icon:           "⟠",
    usdcAddress:    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    bridgeAddress:  (process.env.NEXT_PUBLIC_BRIDGE_ETHEREUM_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
    nativeCurrency: "ETH",
  },
  {
    name:           "Polygon",
    chainId:        137,
    lzEid:          30109,
    icon:           "🟣",
    usdcAddress:    "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as Address,
    bridgeAddress:  (process.env.NEXT_PUBLIC_BRIDGE_POLYGON_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
    nativeCurrency: "MATIC",
  },
  {
    name:           "Arbitrum",
    chainId:        42161,
    lzEid:          30110,
    icon:           "🔷",
    usdcAddress:    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
    bridgeAddress:  (process.env.NEXT_PUBLIC_BRIDGE_ARBITRUM_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
    nativeCurrency: "ETH",
  },
  {
    name:           "Optimism",
    chainId:        10,
    lzEid:          30111,
    icon:           "🔴",
    usdcAddress:    "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" as Address,
    bridgeAddress:  (process.env.NEXT_PUBLIC_BRIDGE_OPTIMISM_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
    nativeCurrency: "ETH",
  },
  // ── Status Network Testnet ───────────────────────────────────────────────────
  // Logos/Status L2 testnet. LayerZero V2 is not yet deployed on Status Network,
  // so bridgeAddress defaults to zero — the UI shows a "bridge not configured" banner.
  // Once LZ is available: deploy FundBraveBridge on Status Network and set
  // NEXT_PUBLIC_BRIDGE_STATUS_ADDRESS to enable cross-chain donations from there.
  ...((TARGET_CHAIN_ID as number) === 84532 ? [
    {
      name:           "Status Network",
      chainId:        1660990954,
      lzEid:          0,   // LayerZero endpoint not yet deployed on Status Network testnet
      icon:           "🔷",
      usdcAddress:    (process.env.NEXT_PUBLIC_STATUS_USDC_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
      bridgeAddress:  (process.env.NEXT_PUBLIC_BRIDGE_STATUS_ADDRESS || "0x0000000000000000000000000000000000000000") as Address,
      nativeCurrency: "ETH",
    },
  ] as SourceChain[] : []),

  // ── Other testnet source chains (only active when targeting Base Sepolia) ────
  // These use the mock USDC and FundBraveBridge deployed by 02_deploy_source_bridge.js.
  // Included here so getSourceChain(11155111/11155420) resolves correctly when a user
  // switches to these chains in the testnet donate flow.
  ...((TARGET_CHAIN_ID as number) === 84532 ? [
    {
      name:           "Ethereum Sepolia",
      chainId:        11155111,
      lzEid:          40161,
      icon:           "⟠",
      // MockUSDC deployed by 02_deploy_source_bridge.js on Ethereum Sepolia
      usdcAddress:    "0x601566d18cdaE8D4347bB6ba43C5C2247D9c1f5a" as Address,
      bridgeAddress:  "0xbf07FCC10F057E897B2e67982d990701E7434e50" as Address,
      nativeCurrency: "ETH",
    },
    {
      name:           "Optimism Sepolia",
      chainId:        11155420,
      lzEid:          40232,
      icon:           "🔴",
      // MockUSDC deployed by 02_deploy_source_bridge.js on Optimism Sepolia
      usdcAddress:    "0xf1d8e639A2402eD519055326468F99DCfCB3e74b" as Address,
      bridgeAddress:  "0xB3aA5B4c39e7D0A67fC986A4F442d93E17fF26B6" as Address,
      nativeCurrency: "ETH",
    },
  ] as SourceChain[] : []),
];

/** Look up source chain config by EVM chain ID */
export function getSourceChain(chainId: number): SourceChain | undefined {
  return SOURCE_CHAINS.find((c) => c.chainId === chainId);
}

/** Returns true if chainId is one of our BASE target chains */
export function isBaseChain(chainId: number): boolean {
  return chainId === 8453 || chainId === 84532;
}

// ─── Multisig Treasury Config ─────────────────────────────────────────────────

export const MULTISIG_SIGNERS = [
  { name: "Abeokuta Lead",  address: process.env.NEXT_PUBLIC_SIGNER_1 || "0x0000000000000000000000000000000000000000" },
  { name: "Logos",  address: process.env.NEXT_PUBLIC_SIGNER_2 || "0x0000000000000000000000000000000000000000" },
  { name: "Community Rep",  address: process.env.NEXT_PUBLIC_SIGNER_3 || "0x0000000000000000000000000000000000000000" },
];

export const REQUIRED_SIGS = parseInt(process.env.NEXT_PUBLIC_REQUIRED_SIGS || "2");
export const TOTAL_SIGS    = MULTISIG_SIGNERS.length;

// ─── ABIs (minimal — only functions the frontend calls) ───────────────────────

export const CAMPAIGN_ABI = [
  // Read
  {
    name: "getCampaignStats",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_totalRaised",     type: "uint256" },
      { name: "_goalMin",         type: "uint256" },
      { name: "_goalMax",         type: "uint256" },
      { name: "_deadline",        type: "uint256" },
      { name: "_donorCount",      type: "uint256" },
      { name: "_donationsCount",  type: "uint256" },
      { name: "_isActive",        type: "bool"    },
      { name: "_minGoalReached",  type: "bool"    },
    ],
  },
  {
    name: "getRecentDonations",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit",  type: "uint256" },
    ],
    outputs: [
      {
        name: "records",
        type: "tuple[]",
        components: [
          { name: "donor",       type: "address" },
          { name: "amount",      type: "uint256" },
          { name: "timestamp",   type: "uint256" },
          { name: "tokenIn",     type: "address" },
          { name: "sourceChain", type: "string"  },
        ],
      },
    ],
  },
  {
    name: "progressBps",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "treasury",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  // Write
  {
    name: "donateUSDC",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "donateERC20",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn",    type: "address" },
      { name: "amountIn",   type: "uint256" },
      { name: "minUsdcOut", type: "uint256" },  // Gap #5: slippage protection; pass 0 for none
    ],
    outputs: [],
  },
  {
    name: "donateETH",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "minUsdcOut", type: "uint256" },  // Gap #5: slippage protection; pass 0 for none
    ],
    outputs: [],
  },
  {
    name: "claimRefund",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "donorTotalContributed",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "donor", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "withdrawToTreasury",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  // Events
  {
    name: "Donated",
    type: "event",
    inputs: [
      { name: "donor",       type: "address", indexed: true  },
      { name: "usdcAmount",  type: "uint256", indexed: false },
      { name: "tokenIn",     type: "address", indexed: false },
      { name: "sourceChain", type: "string",  indexed: false },
    ],
  },
] as const;

export const STAKING_ABI = [
  // Read
  {
    name: "getStakingStats",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "_totalPrincipal",      type: "uint256" },
      { name: "_totalYieldGenerated", type: "uint256" },
      { name: "_lastHarvest",         type: "uint256" },
      { name: "_currentAaveBalance",  type: "uint256" },
      { name: "_unrealizedYield",     type: "uint256" },
    ],
  },
  {
    name: "stakerPrincipal",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "pendingYield",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "staker", type: "address" }],
    outputs: [
      { name: "stakerPortion", type: "uint256" },
      { name: "causePortion",  type: "uint256" },
    ],
  },
  // Per-staker split
  {
    name: "getStakerSplit",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "staker", type: "address" }],
    outputs: [
      { name: "causeShare",  type: "uint16" },
      { name: "stakerShare", type: "uint16" },
    ],
  },
  {
    name: "setYieldSplit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_causeShare",  type: "uint16" },
      { name: "_stakerShare", type: "uint16" },
    ],
    outputs: [],
  },
  // Constants for UI validation
  {
    name: "PLATFORM_SHARE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "DISTRIBUTABLE_BPS",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Write
  {
    name: "stake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "unstake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claimYield",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "harvestAndDistribute",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    name: "compound",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  // SC-C1: Escrowed cause yield
  {
    name: "pendingCauseYield",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "staker", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "pendingCauseTimestamp",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "staker", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "CAUSE_YIELD_RESCUE_WINDOW",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "retryCauseCredit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "staker", type: "address" }],
    outputs: [],
  },
  {
    name: "rescueEscrowedCause",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  // Test-only: MockUSDC.mint() — public on testnet, will revert on real ERC20
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ─── Utility ──────────────────────────────────────────────────────────────────

export function formatUSDC(amount: bigint): string {
  const num = Number(amount) / 1e6;
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Cast to number so TypeScript doesn't emit TS2367 when TARGET_CHAIN_ID is a literal type
const _chainId = TARGET_CHAIN_ID as number;

export function getExplorerUrl(txHash: string): string {
  const base = _chainId === 8453
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";
  return `${base}/tx/${txHash}`;
}

export function getAddressExplorerUrl(address: string): string {
  const base = _chainId === 8453
    ? "https://basescan.org"
    : "https://sepolia.basescan.org";
  return `${base}/address/${address}`;
}

/**
 * FE-H2: Map raw wallet/contract errors to user-friendly messages.
 * Prevents exposing internal revert reasons or wallet internals in the UI.
 */
export function friendlyError(err: unknown): string {
  const msg = err instanceof Error
    ? err.message
    : (typeof err === "string" ? err : "Unknown error");
  if (/user rejected|user denied|cancelled/i.test(msg))
    return "Transaction cancelled.";
  if (/insufficient funds/i.test(msg))
    return "Insufficient funds for this transaction.";
  if (/ERC20InsufficientAllowance/i.test(msg))
    return "Token allowance insufficient — please approve and try again.";
  if (/ERC20InsufficientBalance/i.test(msg))
    return "Insufficient token balance.";
  if (/CircuitBreaker|rate.?limit/i.test(msg))
    return "Transaction exceeds the rate limit. Try a smaller amount or wait before retrying.";
  if (/execution reverted/i.test(msg))
    return "Transaction was rejected by the contract. Check your balance and try again.";
  if (/network changed|chain mismatch|does not match the target chain/i.test(msg))
    return "Wrong network — please switch to the correct chain in your wallet.";
  if (/nonce/i.test(msg))
    return "Transaction ordering error — please reset your wallet activity and try again.";
  if (/gas/i.test(msg))
    return "Gas estimation failed — the transaction may revert.";
  if (/too many errors|retrying in|RPC endpoint/i.test(msg))
    return "Your wallet's RPC endpoint is overloaded. In MetaMask: click the network → edit Base Sepolia → add RPC URL: https://sepolia.base.org";
  return "Transaction failed. Please try again.";
}

// ─── Uniswap V2 Router (for swap quote / slippage floor) ─────────────────────
// Same router address is used on both Base mainnet and Base Sepolia.

export const UNISWAP_ROUTER_ADDRESS: Address = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
/** WETH on Base (used as the intermediate hop for ERC20→USDC swaps) */
export const WETH_ADDRESS: Address            = "0x4200000000000000000000000000000000000006";

export const UNISWAP_ROUTER_ABI = [
  {
    name: "getAmountsOut",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256"   },
      { name: "path",     type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;

// ─── Bridge ABI (FundBraveBridge on source chains) ────────────────────────────

export const BRIDGE_ABI = [
  // Quote LayerZero fee before sending
  {
    name: "quoteCrossChainAction",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_dstEid",       type: "uint32"  },
      { name: "_fundraiserId", type: "uint256" },
      { name: "_action",       type: "uint8"   },
      { name: "_usdcAmount",   type: "uint256" },
    ],
    outputs: [
      { name: "nativeFee",  type: "uint256" },
      { name: "lzTokenFee", type: "uint256" },
    ],
  },
  // ERC20 (USDC) cross-chain donation — user pays LZ fee as msg.value
  {
    name: "sendCrossChainAction",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_dstEid",       type: "uint32"  },
      { name: "_fundraiserId", type: "uint256" },
      { name: "_action",       type: "uint8"   },
      { name: "_tokenIn",      type: "address" },
      { name: "_amountIn",     type: "uint256" },
    ],
    outputs: [],
  },
  // Native ETH donation — msg.value = nativeAmount + lzFee
  {
    name: "sendCrossChainActionNative",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "_dstEid",        type: "uint32"  },
      { name: "_fundraiserId",  type: "uint256" },
      { name: "_action",        type: "uint8"   },
      { name: "_nativeAmount",  type: "uint256" },
    ],
    outputs: [],
  },
] as const;
