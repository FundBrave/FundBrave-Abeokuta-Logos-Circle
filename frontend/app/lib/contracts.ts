/**
 * Contract configuration for Abeokuta Mini
 * Addresses, ABIs, and chain configuration
 */

import type { Address } from "viem";
import { base, baseSepolia } from "wagmi/chains";

// ─── Chain IDs ────────────────────────────────────────────────────────────────

export const TARGET_CHAIN    = baseSepolia;  // Switch to `base` for mainnet
export const TARGET_CHAIN_ID = baseSepolia.id;

// ─── Contract Addresses ───────────────────────────────────────────────────────
// These are populated after deployment. Update from deployments/<chainId>.json

const ADDRESSES_SEPOLIA = {
  campaign:     (process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS     || "0x0000000000000000000000000000000000000000") as Address,
  staking:      (process.env.NEXT_PUBLIC_STAKING_ADDRESS      || "0x0000000000000000000000000000000000000000") as Address,
  usdc:         (process.env.NEXT_PUBLIC_USDC_ADDRESS         || "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE") as Address,
  treasury:     (process.env.NEXT_PUBLIC_TREASURY_ADDRESS     || "0x0000000000000000000000000000000000000000") as Address,
  fundBraveBridge: (process.env.NEXT_PUBLIC_BRIDGE_ADDRESS    || "0xb3C210cB2075e72B10f00c41e30120480017a136") as Address,
};

export const CONTRACT_ADDRESSES = ADDRESSES_SEPOLIA;

export const USDC_DECIMALS = 6;

// ─── Non-EVM manual donation addresses ───────────────────────────────────────
// These are treasury-controlled wallets monitored by the campaign organisers.
// Donations are manually converted to USDC and credited within 24–48 hours.

export const MANUAL_DONATION_ADDRESSES = {
  bitcoin: (process.env.NEXT_PUBLIC_BTC_ADDRESS || "") as string,
  solana:  (process.env.NEXT_PUBLIC_SOL_ADDRESS || "") as string,
};

// ─── Campaign parameters ─────────────────────────────────────────────────────

export const CAMPAIGN_GOAL_MIN_USDC = 1_000;  // $1,000
export const CAMPAIGN_GOAL_MAX_USDC = 2_500;  // $2,500

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
    address:     (process.env.NEXT_PUBLIC_DAI_ADDRESS || "0xD5F45AE6088fE7DadA621C8A70F94abE3F46f7Bf") as Address,
    decimals:    18,
    isNative:    false,
    coingeckoId: "dai",
  },
  {
    symbol:      "WETH",
    name:        "Wrapped Ether",
    address:     (process.env.NEXT_PUBLIC_WETH_ADDRESS || "0x8140C9fE21D9639FD69E9eF345Be39d767eE7FE2") as Address,
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
    usdcAddress:    (process.env.NEXT_PUBLIC_USDC_ADDRESS || "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE") as Address,
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
];

/** Look up source chain config by EVM chain ID */
export function getSourceChain(chainId: number): SourceChain | undefined {
  return SOURCE_CHAINS.find((c) => c.chainId === chainId);
}

/** Returns true if chainId is one of our BASE target chains */
export function isBaseChain(chainId: number): boolean {
  return chainId === 8453 || chainId === 84532;
}

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
      { name: "tokenIn",  type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "donateETH",
    type: "function",
    stateMutability: "payable",
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

export function getExplorerUrl(txHash: string): string {
  return `https://sepolia.basescan.org/tx/${txHash}`;
}

export function getAddressExplorerUrl(address: string): string {
  return `https://sepolia.basescan.org/address/${address}`;
}

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
