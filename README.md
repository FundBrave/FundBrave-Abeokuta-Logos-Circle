# Abeokuta Logos Circle — FundBrave Mini

A focused fundraising app for the **Empowering Women Entrepreneurs in Abeokuta** campaign, built on FundBrave infrastructure in partnership with [Logos Network](https://logos.co).

**Goal**: Raise $1,000–$2,500 USDC to fund online education courses (Coursera, Udemy, AltSchool Africa) for 20–30 women entrepreneurs in Abeokuta, Nigeria.

---

## Architecture

```
packages/abeokuta-mini/
├── contracts/                  # Solidity smart contracts
│   ├── contracts/
│   │   ├── AbeokutaCampaign.sol    # Main campaign contract
│   │   ├── AbeokutaStaking.sol     # Aave-yield staking
│   │   ├── interfaces/             # ISwapAdapter, IAavePool
│   │   ├── libraries/              # CircuitBreaker (reused from FundBrave)
│   │   └── mocks/                  # MockUSDC, MockAavePool, MockSwapAdapter (tests)
│   ├── deploy/
│   │   └── 01_deploy_abeokuta.js
│   ├── test/
│   │   ├── AbeokutaCampaign.test.js
│   │   └── AbeokutaStaking.test.js
│   └── hardhat.config.js
│
└── frontend/                   # Next.js 15 campaign site
    └── app/
        ├── page.tsx                # Landing page (hero + progress + CTAs)
        ├── donate/page.tsx         # Donation flow
        ├── stake/page.tsx          # Staking flow
        ├── dashboard/page.tsx      # Transparency dashboard
        ├── hooks/
        │   ├── useCampaignStats.ts
        │   ├── useDonate.ts
        │   └── useStaking.ts
        ├── lib/
        │   └── contracts.ts        # ABIs, addresses, helpers
        └── components/
            ├── ProgressBar.tsx
            ├── RecentDonations.tsx
            ├── FundBraveLogo.tsx
            └── LogosLogo.tsx
```

## Donation Flows

| Flow | Path | Description |
|------|------|-------------|
| USDC (same-chain) | `approve → donateUSDC()` | Direct USDC deposit |
| ERC20 (same-chain) | `approve → donateERC20(token, amount)` | Auto-swapped to USDC via DEX |
| ETH (same-chain) | `donateETH{value}()` | Auto-swapped to USDC via DEX |
| Cross-chain | FundBraveBridge → `creditDonation()` | LayerZero V2 bridge; supports ETH, Polygon, Arbitrum, Optimism |

## Staking Flow

1. Staker approves USDC for `AbeokutaStaking`
2. `stake(amount)` → USDC deposited into Aave V3
3. Yield accrues daily; anyone can call `harvestAndDistribute()`
4. Yield split: 79% → campaign, 19% → staker, 2% → platform
5. `claimYield()` → staker receives their 19%
6. `unstake(amount)` → principal returned instantly

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

# Deploy to Base Sepolia
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

---

## Deployment Checklist

### Testnet (Base Sepolia)
- [ ] Deploy contracts (`npm run deploy:testnet`)
- [ ] Note contract addresses from `deployments/84532.json`
- [ ] Create Gnosis Safe on Base Sepolia (https://app.safe.global)
- [ ] Set `TREASURY_MULTISIG` in `.env`
- [ ] Set bridge contract: `campaign.setBridgeContract(FUND_BRAVE_BRIDGE_ADDRESS)`
- [ ] Update frontend `.env.local` with all contract addresses
- [ ] Test all flows end-to-end: USDC donation, ERC20 swap donation, staking, yield harvest
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
- The bridge/staking pool authorization is access-controlled via `onlyBridgeOrStaking`
- `withdrawToTreasury()` can only be called by the treasury multisig or owner
- Withdrawal is blocked if campaign is still active and min goal not reached

---

## Reused from FundBrave

| Component | Source | Notes |
|-----------|--------|-------|
| `CircuitBreaker.sol` | `packages/contracts/contracts/libraries/` | Copied verbatim |
| `FundBraveBridge.sol` | `packages/contracts/contracts/` | Reused as-is, point at `AbeokutaCampaign` |
| `UniswapAdapter.sol` / `OneInchAdapter.sol` | `packages/contracts/contracts/adapters/` | Use existing deployed instance |
| `WalletProvider` (RainbowKit + wagmi) | `packages/frontend/app/provider/WalletProvider.tsx` | Adapted |
| CSS variables / design system | `packages/frontend/app/globals.css` | Same `--primary`, `--purple`, `glass` tokens |
| `useDonate` / `useStake` hooks | `packages/frontend/app/hooks/` | Adapted for standalone campaign |

---

*Built with ❤️ for the Abeokuta community.*
