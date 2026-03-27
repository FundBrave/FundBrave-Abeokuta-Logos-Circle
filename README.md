# Abeokuta Logos Circle — FundBrave

A focused fundraising campaign built on FundBrave infrastructure in partnership with [Logos](https://logos.co).

**Goal**: Raise **$2,000 USDC** to fund online education courses (Coursera, Udemy, AltSchool Africa) for 20–30 women entrepreneurs in Abeokuta, Nigeria.

---

## Architecture

Three independently deployed packages:

```
abeokuta-mini/
├── contracts/                          # Hardhat / Solidity smart contracts (Base)
│   ├── contracts/
│   │   ├── AbeokutaCampaign.sol            # Central hub — donation tracking, withdrawals, circuit breaker
│   │   ├── AbeokutaStaking.sol             # Aave V3 yield staking with per-staker split
│   │   ├── AbeokutaBridgeReceiver.sol      # LayerZero V2 destination receiver on Base
│   │   ├── interfaces/                     # ISwapAdapter, IAbeokutaCampaign
│   │   ├── libraries/                      # CircuitBreaker (reused from FundBrave)
│   │   └── mocks/                          # MockUSDC, MockAavePool, MockSwapAdapter (tests only)
│   ├── deploy/
│   │   └── 01_deploy_abeokuta.js           # Deploys all 3 contracts and wires them together
│   └── test/
│       ├── AbeokutaCampaign.test.js
│       ├── AbeokutaStaking.test.js
│       └── AbeokutaBridgeReceiver.test.js
│
├── frontend/                           # Next.js 15 campaign site
│   └── app/
│       ├── page.tsx                        # Landing page (hero + progress + stats + gallery)
│       ├── donate/page.tsx                 # Donation flow (USDC / ERC20 / ETH / cross-chain)
│       ├── stake/page.tsx                  # Staking flow (stake / unstake / claim / compound)
│       ├── dashboard/page.tsx              # Transparency dashboard (on-chain stats + fund flow)
│       ├── admin/page.tsx                  # Owner-only: withdraw to treasury, harvest yield
│       ├── hooks/
│       │   ├── useCampaignStats.ts         # Live campaign + staking stats (multicall, 30s poll)
│       │   ├── useDonate.ts                # USDC / ERC20 / ETH donation flows
│       │   ├── useCrossChainDonate.ts      # LayerZero cross-chain donation flow
│       │   ├── useStaking.ts               # Stake / unstake / claim / compound / split flows
│       │   └── useAdmin.ts                 # Admin actions with toast notifications
│       ├── lib/
│       │   └── contracts.ts                # ABIs, addresses, helpers — single source of truth
│       └── components/
│           ├── RecentDonations.tsx         # Merges on-chain array + cross-chain event logs
│           ├── CrossChainDonate.tsx        # Cross-chain UI (auto-shown on non-Base wallets)
│           ├── ManualDonations.tsx         # BTC / SOL copyable deposit addresses
│           ├── sections/                   # Page sections (Hero, ProgressCard, StatsBar, …)
│           └── ui/                         # Shared primitives (GradientButton, GlassCard, …)
│
└── watcher/                            # Node.js / TypeScript deposit watcher service
    └── src/
        ├── index.ts                        # Entry point — starts BTC + SOL polling loops
        ├── config.ts                       # Env-var config loader (no dotenv)
        ├── contract.ts                     # Viem client + sequential tx queue (nonce safety)
        ├── price.ts                        # CoinGecko price feed (BTC + SOL, 60s cache)
        ├── store.ts                        # File-backed dedup store (processed_txs.json)
        └── watchers/
            ├── btcWatcher.ts               # Polls Blockstream API for confirmed BTC txs
            └── solWatcher.ts               # Polls Solana RPC for SOL + USDC-SPL transfers
```

---

## Donation Flows

| Flow | Path | Description |
|------|------|-------------|
| USDC (same-chain) | `approve → donateUSDC()` | Direct USDC deposit on Base |
| ERC20 (same-chain) | `approve → donateERC20(token, amount, minUsdcOut)` | Auto-swapped to USDC via Uniswap V2; 5% slippage floor |
| ETH (same-chain) | `donateETH{value}(minUsdcOut)` | Auto-swapped WETH→USDC; 5% slippage floor |
| Cross-chain (EVM) | `FundBraveBridge → AbeokutaBridgeReceiver → creditDonation()` | LayerZero V2; Ethereum, Polygon, Arbitrum, Optimism |
| Bitcoin | Float-wallet watcher → `donateUSDC()` | Watcher detects confirmed BTC deposits, converts via CoinGecko price, credits within minutes |
| Solana | Float-wallet watcher → `donateUSDC()` | Same pattern for SOL and Solana USDC-SPL |

Cross-chain donations do **not** appear in the contract's `_allDonations` array (gas optimisation for LayerZero's 200k gasLimit). The frontend reads them directly from `Donated` event logs via `getLogs` and merges them into the Recent Supporters feed.

---

## Staking Flow

1. Staker approves USDC → `AbeokutaStaking`
2. `stake(amount)` → USDC deposited into Aave V3
3. Yield accrues continuously; anyone calls `harvestAndDistribute()`
4. Default yield split: **79%** → campaign, **19%** → staker, **2%** → platform fee
5. Per-staker split customisable via `setYieldSplit(causeShare, stakerShare)` (must sum to 9800 bps)
6. `claimYield()` → staker receives their portion; campaign receives its portion via `creditDonation()`
7. `compound()` → re-stakes the staker's yield portion instead of withdrawing it
8. `unstake(amount)` → principal returned instantly from Aave

**Escrowed cause yield (SC-C1):** If the campaign contract rejects a `creditDonation()` call (e.g. campaign ended), the cause yield is escrowed. The staker can call `retryCauseCredit()` to retry, or after a 30-day window, `rescueEscrowedCause()` to recover the yield themselves.

---

## Cross-chain Architecture

```
Source chain (e.g. Ethereum)
  └── FundBraveBridge.sendCrossChainAction()
        → LayerZero V2 message
          → Base FundBraveBridge._lzReceive()
            → AbeokutaBridgeReceiver.receiveCrossChainDonation()
              → AbeokutaCampaign.creditDonation(donor, amount, sourceChain)
```

`AbeokutaBridgeReceiver` sits on Base and maps LayerZero EIDs to chain name strings (e.g. `30101 → "ethereum"`). It is registered as the `localFundraiserFactory` on the Base `FundBraveBridge` deployment.

---

## Non-EVM Deposit Watcher

The `watcher/` service bridges Bitcoin and Solana donations to on-chain USDC using the **float wallet** pattern:

1. A dedicated Base wallet holds pre-approved USDC (`approve(campaign, maxUint256)` — one-time setup).
2. Watcher polls BTC (Blockstream API, 30s) and SOL (Solana RPC, 10s) watch addresses.
3. On each new confirmed deposit: fetch live price from CoinGecko → convert to USDC → call `donateUSDCFor(derivedDonorAddress, amount)` using a deterministic pseudo-address (`keccak256("btc:" + senderAddress)`).
4. Processed tx hashes are persisted to `processed_txs.json` (atomic writes) to prevent double-processing across restarts.
5. Optional: set `STAKING_ADDRESS` to enable automatic `harvestAndDistribute()` calls on a configurable interval (`HARVEST_INTERVAL_MS`, default 24h).

> **Float wallet**: keep at least $50–$100 USDC in it and a small ETH balance for gas. Store the private key in a secrets manager — never commit it.

---

## Treasury & Multisig

Funds are held by a **Gnosis Safe** multisig set as `treasury` in `AbeokutaCampaign`. The contract sends funds to the Safe address; the Safe requires N-of-M approvals to move them.

Suggested setup: **2-of-3 Safe** — Abeokuta circle lead + Logos + community representative.

Set up at https://app.safe.global (choose Base or Base Sepolia).

---

## Security

- **CircuitBreaker**: max 5,000 USDC/tx · 10,000 USDC/hr · 30,000 USDC/day
- All donation paths use `nonReentrant`
- `onlyBridgeOrStaking` gates `creditDonation()` — only registered bridge and staking contracts can call it
- `AbeokutaBridgeReceiver` is `Pausable` and gated by `onlyBridge`
- `withdrawToTreasury()` requires campaign ended + minimum goal reached (`GoalNotReached` revert otherwise)
- If deadline passes without reaching the goal, donors call `claimRefund()` to recover their USDC
- Slippage protection: `donateERC20` and `donateETH` accept a `minUsdcOut` parameter (frontend passes `expectedOut * 95 / 100`)

---

## Setup

### Prerequisites
- Node.js 20+
- WalletConnect project ID — https://cloud.walletconnect.com
- Alchemy API key for Base Sepolia / Base mainnet RPC

### Contracts

```bash
cd contracts
npm install
npm test                        # run all tests (227 passing)
npm run deploy:testnet          # deploy to Base Sepolia
npm run deploy:mainnet          # deploy to Base mainnet
```

After deployment, copy addresses from `deployments/{chainId}.json` into `frontend/.env.local`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# set NEXT_PUBLIC_CAMPAIGN_ADDRESS, NEXT_PUBLIC_STAKING_ADDRESS,
#     NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, and per-chain bridge addresses
npm run dev        # http://localhost:3002
npm run build
npm run lint
npm run type-check
```

### Watcher

```bash
cd watcher
npm install
# set env vars in shell (no .env file — see CLAUDE.md for full list):
#   BASE_RPC_URL, WATCHER_PRIVATE_KEY, CAMPAIGN_ADDRESS, USDC_ADDRESS
#   BTC_ADDRESS (optional), SOL_ADDRESS (optional)
#   STAKING_ADDRESS (optional — enables auto-harvest)
npm run dev          # ts-node, no compile step
npm run dev:watch    # nodemon auto-restart
npm run build && npm start   # production
```

---

## Deployment Checklist

### Testnet (Base Sepolia)
- [ ] `npm run deploy:testnet` — deploys Campaign, Staking, BridgeReceiver and wires them
- [ ] Copy addresses from `deployments/84532.json` to `frontend/.env.local`
- [ ] Create Gnosis Safe on Base Sepolia at https://app.safe.global
- [ ] Deploy `FundBraveBridge` on Base Sepolia; set `localFundraiserFactory = BridgeReceiver`
- [ ] Deploy `FundBraveBridge` on each source chain; `setPeer(BASE_EID, BASE_BRIDGE_ADDR)`
- [ ] Update `frontend/.env.local` with all bridge addresses per source chain
- [ ] Set `AbeokutaStaking.setStakingDeadline(campaignDeadline)` after deployment
- [ ] Fund float wallet with USDC + ETH; run one-time `approve(campaign, maxUint256)`; start watcher
- [ ] Test all flows: USDC, ERC20 swap, ETH swap, cross-chain, BTC/SOL watcher, staking, harvest, refund
- [ ] Verify contracts on BaseScan: `npm run verify`

### Mainnet (Base)
- [ ] Repeat above with `npm run deploy:mainnet`
- [ ] Create mainnet Gnosis Safe with 3 real signers; use 2-of-3 threshold
- [ ] Test with small amounts first before publicising

---

## Reused from FundBrave

| Component | Notes |
|-----------|-------|
| `CircuitBreaker.sol` | Copied verbatim into `contracts/libraries/` |
| `FundBraveBridge.sol` | External deployment; `AbeokutaBridgeReceiver` registered as `localFundraiserFactory` |
| `ISwapAdapter` | Uniswap V2 router used in Campaign for ERC20/ETH → USDC swaps |
| RainbowKit + wagmi stack | Adapted in `providers.tsx` with explicit per-chain transports |
| Design system tokens | `--primary`, `--secondary`, `glass`, `gradient-text` from FundBrave globals |

---

*Built for the Abeokuta community — powered by FundBrave × Logos.*
