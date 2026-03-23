# Abeokuta Logos Circle — FundBrave Mini

A focused fundraising app for the **Empowering Women Entrepreneurs in Abeokuta** campaign, built on FundBrave infrastructure in partnership with [Logos Network](https://logos.co).

**Goal**: Raise $1,000–$2,500 USDC to fund online education courses (Coursera, Udemy, AltSchool Africa) for 20–30 women entrepreneurs in Abeokuta, Nigeria.

---

## Architecture

```
packages/abeokuta-mini/
├── contracts/                      # Solidity smart contracts
│   ├── contracts/
│   │   ├── AbeokutaCampaign.sol        # Main campaign contract
│   │   ├── AbeokutaStaking.sol         # Aave-yield staking
│   │   ├── AbeokutaBridgeReceiver.sol  # Destination-side LayerZero receiver
│   │   ├── interfaces/                 # ISwapAdapter, IAavePool
│   │   ├── libraries/                  # CircuitBreaker (reused from FundBrave)
│   │   └── mocks/                      # MockUSDC, MockAavePool, MockSwapAdapter (tests)
│   ├── deploy/
│   │   └── 01_deploy_abeokuta.js       # Deploys all 3 contracts + wires them together
│   ├── test/
│   │   ├── AbeokutaCampaign.test.js
│   │   └── AbeokutaStaking.test.js
│   └── hardhat.config.js
│
├── frontend/                       # Next.js campaign site
│   └── app/
│       ├── page.tsx                    # Landing page (hero + progress + CTAs)
│       ├── donate/page.tsx             # Donation flow (same-chain + cross-chain)
│       ├── stake/page.tsx              # Staking flow
│       ├── dashboard/page.tsx          # Transparency dashboard
│       ├── hooks/
│       │   ├── useCampaignStats.ts
│       │   ├── useDonate.ts
│       │   ├── useCrossChainDonate.ts  # LayerZero cross-chain donation flow
│       │   └── useStaking.ts
│       ├── lib/
│       │   └── contracts.ts            # ABIs, addresses, helpers, getSourceChain()
│       └── components/
│           ├── ProgressBar.tsx
│           ├── RecentDonations.tsx
│           ├── CrossChainDonate.tsx    # Cross-chain UI (auto-shown on non-Base chains)
│           ├── ManualDonations.tsx     # BTC / SOL / direct-EVM donation addresses
│           ├── StatCard.tsx            # Reusable stat display card
│           ├── FundBraveLogo.tsx
│           └── LogosLogo.tsx
│
└── watcher/                        # Centralized deposit watcher (Node.js / TypeScript)
    └── src/
        ├── index.ts                    # Entry point — starts BTC + SOL polling loops
        ├── config.ts                   # Env-var config loader (no dotenv dep)
        ├── contract.ts                 # Viem client + donateUSDC() float-wallet helper
        ├── price.ts                    # CoinGecko price feed (BTC + SOL, cached)
        ├── store.ts                    # File-backed dedup store (processed_txs.json)
        └── watchers/
            ├── btcWatcher.ts           # Polls Blockstream API for confirmed BTC txs
            └── solWatcher.ts           # Polls Solana RPC for SOL + USDC-SPL transfers
```

---

## Donation Flows

| Flow | Path | Description |
|------|------|-------------|
| USDC (same-chain) | `approve → donateUSDC()` | Direct USDC deposit |
| ERC20 (same-chain) | `approve → donateERC20(token, amount)` | Auto-swapped to USDC via DEX |
| ETH (same-chain) | `donateETH{value}()` | Auto-swapped to USDC via DEX |
| Cross-chain (EVM) | FundBraveBridge → `AbeokutaBridgeReceiver` → `creditDonation()` | LayerZero V2; supports Ethereum, Polygon, Arbitrum, Optimism |
| Bitcoin | Float-wallet watcher → `donateUSDC()` | Watcher detects confirmed BTC deposits, converts to USDC, credits campaign within minutes |
| Solana (SOL / USDC-SPL) | Float-wallet watcher → `donateUSDC()` | Same float-wallet pattern for SOL and Solana USDC |

---

## Staking Flow

1. Staker approves USDC for `AbeokutaStaking`
2. `stake(amount)` → USDC deposited into Aave V3
3. Yield accrues daily; anyone can call `harvestAndDistribute()`
4. Yield split: 79% → campaign, 19% → staker, 2% → platform
5. `claimYield()` → staker receives their 19%
6. `unstake(amount)` → principal returned instantly

---

## Cross-chain Architecture

```
Source chain (e.g. Ethereum)
  └── FundBraveBridge.sendCrossChainAction
        → LayerZero V2 message
          → Base FundBraveBridge._lzReceive
            → AbeokutaBridgeReceiver.handleCrossChainDonation
              → AbeokutaCampaign.creditDonation
```

`AbeokutaBridgeReceiver` sits on Base and is registered as `localFundraiserFactory` on the dedicated Base `FundBraveBridge`. It maps LayerZero EIDs to human-readable chain names (Ethereum, Polygon, Arbitrum, Optimism, Rootstock, and testnets).

**Frontend**: `CrossChainDonate` auto-renders when the user is on a non-Base chain. It quotes the LayerZero fee via `quoteCrossChainAction`, skips the ERC20 `approve` step if allowance is already sufficient, and shows step-by-step progress.

---

## Non-EVM Deposit Watcher

The `watcher/` service bridges Bitcoin and Solana donations into on-chain USDC using the **float wallet** pattern:

1. A dedicated wallet on Base holds pre-approved USDC.
2. The watcher polls the BTC (Blockstream API) and SOL (Solana JSON-RPC) watch addresses.
3. On each new confirmed deposit it fetches the live price from CoinGecko, converts to USDC, and calls `donateUSDC()` on the campaign contract.
4. Processed tx hashes/signatures are persisted to `processed_txs.json` to prevent double-processing across restarts.

The frontend `ManualDonations` component displays copyable BTC and SOL addresses so donors without EVM wallets can still contribute.

---

## Treasury & Multisig

Funds are held by a **Gnosis Safe** multisig (configured as `treasury` in `AbeokutaCampaign`). The campaign contract does not enforce withdrawal signatures itself — it simply sends funds to the Safe address, which requires N-of-M approvals to move.

**Suggested setup**: 2-of-3 Safe with Abeokuta circle leads + Logos Network as signers.

Set up at https://app.safe.global — choose Base or Base Sepolia.

---

## Setup

### Prerequisites
- Node.js 20+
- A WalletConnect project ID (free at https://cloud.walletconnect.com)
- An Alchemy API key for Base Sepolia RPC

### Contracts

```bash
cd packages/abeokuta-mini/contracts
npm install

# Run tests
npm test

# Deploy to Base Sepolia (deploys Campaign + Staking + BridgeReceiver and wires them)
cp ../.env.example .env
# Edit .env — set PRIVATE_KEY, ALCHEMY_API_KEY, TREASURY_MULTISIG
npm run deploy:testnet
```

After deployment, copy the addresses from `deployments/84532.json` into your frontend `.env.local`.

### Frontend

```bash
cd packages/abeokuta-mini/frontend
npm install

cp ../.env.example .env.local
# Edit .env.local — set contract addresses + NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

npm run dev   # runs on http://localhost:3002
npm run build
```

### Watcher (BTC + SOL deposits)

```bash
cd packages/abeokuta-mini/watcher
npm install

cp .env.example .env
# Edit .env:
#   BASE_RPC_URL        — Base mainnet or Sepolia RPC
#   WATCHER_PRIVATE_KEY — Float wallet private key (must hold USDC on Base)
#   CAMPAIGN_ADDRESS    — Deployed AbeokutaCampaign address
#   USDC_ADDRESS        — USDC on Base
#   BTC_ADDRESS         — Bitcoin treasury address to watch (optional)
#   SOL_ADDRESS         — Solana treasury address to watch (optional)

npm run dev          # dev mode with ts-node
npm run dev:watch    # dev mode with nodemon restart
npm run build && npm start  # production
```

> **Float wallet**: The watcher wallet needs enough USDC to cover the donations it credits. Keep at least $50–$100 USDC in it and top it up as needed. It also needs a small amount of ETH for gas.

---

## Deployment Checklist

### Testnet (Base Sepolia)
- [ ] Deploy contracts (`npm run deploy:testnet`) — deploys Campaign, Staking, BridgeReceiver
- [ ] Note contract addresses from `deployments/84532.json`
- [ ] Create Gnosis Safe on Base Sepolia (https://app.safe.global)
- [ ] Set `TREASURY_MULTISIG` in `.env`
- [ ] Deploy `FundBraveBridge` on Base Sepolia; set `localFundraiserFactory = BridgeReceiver`
- [ ] If bridge wasn't known at deploy time: `receiver.setBridge(BRIDGE_ADDRESS)`
- [ ] Deploy `FundBraveBridge` on each source chain; configure `setPeer(BASE_EID, BASE_BRIDGE_ADDR)`
- [ ] Update frontend `.env.local` with all contract addresses + per-chain bridge addresses
- [ ] Configure BTC/SOL treasury addresses; update `NEXT_PUBLIC_BTC_ADDRESS` / `NEXT_PUBLIC_SOL_ADDRESS`
- [ ] Fund the watcher float wallet with USDC + ETH; start the watcher service
- [ ] Test all flows end-to-end: USDC donation, ERC20 swap donation, cross-chain donation, staking, yield harvest, BTC/SOL watcher
- [ ] Verify contracts on BaseScan: `npm run verify`

### Mainnet (Base)
- [ ] Repeat above with `npm run deploy:mainnet`
- [ ] Create mainnet Gnosis Safe with 3 real signers (Abeokuta leads + Logos)
- [ ] Use `2-of-3` threshold
- [ ] Test with small amounts first
- [ ] Share Safe URL with all signers

---

## Security Notes

- `AbeokutaCampaign` uses the `CircuitBreaker` library from FundBrave:
  - Max single donation: 5,000 USDC
  - Max hourly: 10,000 USDC
  - Max daily: 30,000 USDC
- All donation paths use `nonReentrant`
- `AbeokutaBridgeReceiver` is `Pausable` and gated by `onlyBridge`; only the registered `FundBraveBridge` on Base can call it
- The bridge/staking pool authorization is access-controlled via `onlyBridgeOrStaking` on the campaign
- `withdrawToTreasury()` can only be called by the treasury multisig or owner
- Withdrawal is blocked if campaign is still active and min goal not reached
- Watcher float wallet: keep its private key in a secure secrets manager (not in version control); it only needs `donateUSDC` permission — never grant it campaign admin rights

---

## Reused from FundBrave

| Component | Source | Notes |
|-----------|--------|-------|
| `CircuitBreaker.sol` | `packages/contracts/contracts/libraries/` | Copied verbatim |
| `FundBraveBridge.sol` | `packages/contracts/contracts/` | Reused as-is; `AbeokutaBridgeReceiver` registered as `localFundraiserFactory` |
| `UniswapAdapter.sol` / `OneInchAdapter.sol` | `packages/contracts/contracts/adapters/` | Use existing deployed instance |
| `WalletProvider` (RainbowKit + wagmi) | `packages/frontend/app/provider/WalletProvider.tsx` | Adapted in `providers.tsx` |
| CSS variables / design system | `packages/frontend/app/globals.css` | Same `--primary`, `--purple`, `glass` tokens |
| `useDonate` / `useStake` hooks | `packages/frontend/app/hooks/` | Adapted for standalone campaign |

---

*Built with ❤️ for the Abeokuta community.*
