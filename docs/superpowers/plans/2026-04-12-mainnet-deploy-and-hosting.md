# Mainnet Deploy & Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy all three Abeokuta Mini smart contracts to Base mainnet, host the Next.js frontend on Vercel, and run the BTC/SOL watcher service on Railway (or a VPS).

**Architecture:** Three sequential phases — contracts first (produces addresses), then frontend and watcher in parallel. The watcher is a long-running Node.js process with a `/health` endpoint; the frontend is a statically-optimized Next.js 15 site.

**Tech Stack:** Hardhat (deploy), Base mainnet (chain ID 8453), Vercel (frontend), Railway (watcher), Gnosis Safe (treasury), Alchemy (RPC), Basescan (verification).

---

## STOP — Credentials Checklist

**You cannot start Task 1 without all of these. Collect them first.**

| # | Item | Where to get it |
|---|------|----------------|
| 1 | **Deployer private key** with ≥ 0.05 ETH on Base mainnet | Your EOA wallet |
| 2 | **Gnosis Safe address** on Base mainnet | Create at https://safe.global (choose Base network) |
| 3 | **Alchemy API key** with Base mainnet enabled | https://dashboard.alchemy.com |
| 4 | **Basescan API key** | https://basescan.org/myapikey |
| 5 | **BRIDGE_ADDRESS** — FundBraveBridge on Base mainnet | FundBrave team (this is a hard deploy blocker) |
| 6 | **PLATFORM_WALLET** — FundBrave fee recipient address | FundBrave team |
| 7 | **Watcher hot wallet** private key + public address | Generate a fresh EOA (e.g. `cast wallet new`) |
| 8 | **WalletConnect Project ID** | https://cloud.walletconnect.com |
| 9 | **BTC deposit address** | The treasury Bitcoin wallet the watcher monitors |
| 10 | **SOL deposit address** | The treasury Solana wallet the watcher monitors |
| 11 | **3 multisig signer addresses** | Abeokuta lead, Logos Network rep, Community rep |

---

## Phase 1 — Smart Contract Deployment to Base Mainnet

### Task 1: Create contracts `.env` with mainnet values

**Files:**
- Create: `contracts/.env` (never commit — already in .gitignore)

- [ ] **Step 1: Create the env file**

```bash
cat > contracts/.env << 'EOF'
# Deployer EOA (must have ≥ 0.05 ETH on Base mainnet for gas)
PRIVATE_KEY=0x<your_deployer_private_key>

# Alchemy — use the Base Mainnet app key
ALCHEMY_API_KEY=<your_alchemy_key>

# Basescan API key for contract verification
BASESCAN_API_KEY=<your_basescan_key>

# Gnosis Safe on Base mainnet — receives donations after campaign ends
TREASURY_MULTISIG=0x<your_gnosis_safe_address>

# FundBrave fee recipient (from FundBrave team)
PLATFORM_WALLET=0x<fundbrave_platform_wallet>

# FundBraveBridge already deployed on Base mainnet (from FundBrave team)
# REQUIRED — deploy script throws if unset on mainnet
BRIDGE_ADDRESS=0x<fundbrave_bridge_on_base_mainnet>

# Watcher hot wallet PUBLIC address (for campaign.setWatcher())
WATCHER_ADDRESS=0x<watcher_hot_wallet_public_key>
EOF
```

- [ ] **Step 2: Verify the file was created correctly**

```bash
cat contracts/.env
```
Expected: all 7 variables filled, no `0x` placeholder remaining.

- [ ] **Step 3: Confirm the deployer has enough ETH for gas**

```bash
# Install cast if you don't have it: https://getfoundry.sh
cast balance <your_deployer_address> --rpc-url https://mainnet.base.org
```
Expected: output shows ≥ `50000000000000000` (0.05 ETH).

---

### Task 2: Run the mainnet deployment

**Files:**
- Read: `contracts/deploy/01_deploy_abeokuta.js`

- [ ] **Step 1: Install dependencies**

```bash
cd contracts && npm install
```

- [ ] **Step 2: Compile contracts**

```bash
npm run compile
```
Expected: `Compiled N Solidity files successfully`.

- [ ] **Step 3: Run the deploy script**

```bash
npx hardhat run deploy/01_deploy_abeokuta.js --network base
```

Expected output (last lines):
```
========================================
Deployment complete!
----------------------------------------
AbeokutaCampaign:       0x<ADDRESS_A>
AbeokutaStaking:        0x<ADDRESS_B>
AbeokutaBridgeReceiver: 0x<ADDRESS_C>
========================================
```

**Record these 3 addresses — every later task needs them.**

- [ ] **Step 4: Confirm the deployment file was saved**

```bash
cat contracts/deployments/8453.json
```
Expected: JSON with all 3 contract addresses, chainId 8453, and today's date.

---

### Task 3: Verify contracts on Basescan

**Why:** Unverified contracts show bytecode on Basescan. Users will not trust an unverified campaign contract with real money.

- [ ] **Step 1: Copy the verify commands printed by the deploy script**

The deploy script prints exact `npx hardhat verify` commands at the end. Copy them from your terminal output. They look like:

```bash
npx hardhat verify --network base 0x<ADDRESS_A> \
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  "0x<SWAP_ADAPTER>" \
  "0x<TREASURY>" \
  "1000000000" \
  "2500000000" \
  "<DEADLINE_TS>"

npx hardhat verify --network base 0x<ADDRESS_B> \
  "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" \
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB" \
  "0x<ADDRESS_A>" \
  "0x<PLATFORM_WALLET>"

npx hardhat verify --network base 0x<ADDRESS_C> \
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  "0x<ADDRESS_A>" \
  "0x<BRIDGE_ADDRESS>"
```

- [ ] **Step 2: Run each verify command (one at a time)**

Wait for each to succeed before running the next. If you get a "Already Verified" error, that's fine — move on.

Expected for each:
```
Successfully verified contract AbeokutaCampaign on the block explorer.
https://basescan.org/address/0x<ADDRESS>#code
```

- [ ] **Step 3: Confirm on Basescan**

Open `https://basescan.org/address/0x<ADDRESS_A>#code` in a browser.
Expected: Contract tab shows Solidity source, not just bytecode.

---

### Task 4: Transfer UniswapAdapterUSDC ownership to treasury

**Why:** The deploy script deploys UniswapAdapterUSDC with the deployer as owner. An EOA holding ownership of a production adapter is a single point of failure. Transfer it to the Gnosis Safe.

- [ ] **Step 1: Get the swap adapter address from the deployment file**

```bash
cat contracts/deployments/8453.json | grep SwapAdapter
```
Note the address: `0x<SWAP_ADAPTER_ADDRESS>`.

- [ ] **Step 2: Transfer ownership via cast**

```bash
cast send 0x<SWAP_ADAPTER_ADDRESS> \
  "transferOwnership(address)" \
  0x<YOUR_GNOSIS_SAFE_ADDRESS> \
  --rpc-url https://base-mainnet.g.alchemy.com/v2/<ALCHEMY_API_KEY> \
  --private-key 0x<DEPLOYER_PRIVATE_KEY>
```

Expected: transaction hash printed and no revert.

- [ ] **Step 3: Verify new owner**

```bash
cast call 0x<SWAP_ADAPTER_ADDRESS> "owner()(address)" \
  --rpc-url https://base-mainnet.g.alchemy.com/v2/<ALCHEMY_API_KEY>
```
Expected: `0x<YOUR_GNOSIS_SAFE_ADDRESS>`.

---

### Task 5: Fund watcher float wallet and set approval

**Why:** The watcher uses a float wallet pattern — it holds real USDC on Base mainnet and calls `donateUSDCFor()` when a BTC/SOL deposit is detected. It needs USDC pre-funded and a `MaxUint256` approval set on the campaign contract.

- [ ] **Step 1: Fund the watcher hot wallet with USDC**

Send at least **500 USDC** (real USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) and at least **0.01 ETH** for gas to the watcher hot wallet address on Base mainnet. Use your exchange or any wallet with USDC on Base.

- [ ] **Step 2: Verify the balance arrived**

```bash
cast call 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  "balanceOf(address)(uint256)" \
  0x<WATCHER_HOT_WALLET_ADDRESS> \
  --rpc-url https://mainnet.base.org
```
Expected: a number ≥ `500000000` (500 USDC in 6-decimal units).

- [ ] **Step 3: Set MaxUint256 approval from watcher wallet to campaign**

```bash
cast send 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  "approve(address,uint256)" \
  0x<CAMPAIGN_ADDRESS_A> \
  115792089237316195423570985008687907853269984665640564039457584007913129639935 \
  --rpc-url https://base-mainnet.g.alchemy.com/v2/<ALCHEMY_API_KEY> \
  --private-key 0x<WATCHER_HOT_WALLET_PRIVATE_KEY>
```

Expected: transaction hash, no revert.

- [ ] **Step 4: Confirm allowance**

```bash
cast call 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  "allowance(address,address)(uint256)" \
  0x<WATCHER_HOT_WALLET_ADDRESS> \
  0x<CAMPAIGN_ADDRESS_A> \
  --rpc-url https://mainnet.base.org
```
Expected: `115792089237316195423570985008687907853269984665640564039457584007913129639935` (MaxUint256).

---

## Phase 2 — Frontend Deployment (Vercel)

### Task 6: Switch frontend code from testnet to mainnet

**Files:**
- Modify: `frontend/app/lib/contracts.ts` (lines 42–43, 154)

- [ ] **Step 1: Switch the target chain constants**

In `frontend/app/lib/contracts.ts`, change lines 42–43:

```typescript
// BEFORE
export const TARGET_CHAIN    = baseSepolia;
export const TARGET_CHAIN_ID = baseSepolia.id;

// AFTER
export const TARGET_CHAIN    = base;
export const TARGET_CHAIN_ID = base.id;
```

- [ ] **Step 2: Switch the LayerZero destination EID**

Change line 154:

```typescript
// BEFORE
export const DST_EID = DST_EID_BASE_SEPOLIA;

// AFTER
export const DST_EID = DST_EID_BASE;
```

- [ ] **Step 3: Update ADDRESSES_SEPOLIA to mainnet values**

Change the `ADDRESSES_SEPOLIA` object and rename it (lines 50–58):

```typescript
// BEFORE
const ADDRESSES_SEPOLIA = {
  campaign:        requireAddress("NEXT_PUBLIC_CAMPAIGN_ADDRESS",  process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS),
  staking:         requireAddress("NEXT_PUBLIC_STAKING_ADDRESS",   process.env.NEXT_PUBLIC_STAKING_ADDRESS),
  usdc:            requireAddress("NEXT_PUBLIC_USDC_ADDRESS",      process.env.NEXT_PUBLIC_USDC_ADDRESS, "0xf269f54304f8DB2dB613341CC7E189B02BEf98dE"),
  treasury:        requireAddress("NEXT_PUBLIC_TREASURY_ADDRESS",  process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
  fundBraveBridge: requireAddress("NEXT_PUBLIC_BRIDGE_ADDRESS",    process.env.NEXT_PUBLIC_BRIDGE_ADDRESS, "0x0000000000000000000000000000000000000000"),
};

export const CONTRACT_ADDRESSES = ADDRESSES_SEPOLIA;

// AFTER
const ADDRESSES_MAINNET = {
  campaign:        requireAddress("NEXT_PUBLIC_CAMPAIGN_ADDRESS",  process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS),
  staking:         requireAddress("NEXT_PUBLIC_STAKING_ADDRESS",   process.env.NEXT_PUBLIC_STAKING_ADDRESS),
  usdc:            requireAddress("NEXT_PUBLIC_USDC_ADDRESS",      process.env.NEXT_PUBLIC_USDC_ADDRESS, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  treasury:        requireAddress("NEXT_PUBLIC_TREASURY_ADDRESS",  process.env.NEXT_PUBLIC_TREASURY_ADDRESS),
  fundBraveBridge: requireAddress("NEXT_PUBLIC_BRIDGE_ADDRESS",    process.env.NEXT_PUBLIC_BRIDGE_ADDRESS, "0x0000000000000000000000000000000000000000"),
};

export const CONTRACT_ADDRESSES = ADDRESSES_MAINNET;
```

- [ ] **Step 4: Run a type-check to confirm no breakage**

```bash
cd frontend && npm run type-check
```
Expected: `0 errors`.

- [ ] **Step 5: Commit the frontend changes**

```bash
git add frontend/app/lib/contracts.ts
git commit -m "feat: switch frontend to Base mainnet"
```

---

### Task 7: Create frontend `.env.local` with mainnet values

**Files:**
- Create: `frontend/.env.local` (already in .gitignore — do NOT commit)

- [ ] **Step 1: Create the env file**

```bash
cat > frontend/.env.local << 'EOF'
# ─── Contract addresses from contracts/deployments/8453.json ───────────────
NEXT_PUBLIC_CAMPAIGN_ADDRESS=0x<ADDRESS_A>
NEXT_PUBLIC_STAKING_ADDRESS=0x<ADDRESS_B>
NEXT_PUBLIC_TREASURY_ADDRESS=0x<YOUR_GNOSIS_SAFE_ADDRESS>
NEXT_PUBLIC_BRIDGE_ADDRESS=0x<FUNDBRAVE_BRIDGE_ON_BASE_MAINNET>

# ─── Cross-chain bridge addresses (FundBraveBridge on each source chain) ──
# Leave as 0x0 for chains where FundBrave hasn't deployed yet
NEXT_PUBLIC_BRIDGE_BASE_ADDRESS=0x<BRIDGE_ADDRESS>
NEXT_PUBLIC_BRIDGE_ETHEREUM_ADDRESS=0x<ETH_MAINNET_BRIDGE_ADDRESS>
NEXT_PUBLIC_BRIDGE_POLYGON_ADDRESS=0x<POLYGON_BRIDGE_ADDRESS>
NEXT_PUBLIC_BRIDGE_ARBITRUM_ADDRESS=0x<ARBITRUM_BRIDGE_ADDRESS>
NEXT_PUBLIC_BRIDGE_OPTIMISM_ADDRESS=0x<OPTIMISM_BRIDGE_ADDRESS>

# ─── Non-EVM treasury addresses ──────────────────────────────────────────
NEXT_PUBLIC_BTC_ADDRESS=<your_btc_address>
NEXT_PUBLIC_SOL_ADDRESS=<your_sol_address>

# ─── Token addresses on Base mainnet ───────────────────────────────────────
NEXT_PUBLIC_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
NEXT_PUBLIC_DAI_ADDRESS=0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb
NEXT_PUBLIC_WETH_ADDRESS=0x4200000000000000000000000000000000000006

# ─── WalletConnect ────────────────────────────────────────────────────────
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<your_walletconnect_project_id>

# ─── Multisig display ─────────────────────────────────────────────────────
NEXT_PUBLIC_SIGNER_1=0x<abeokuta_lead_address>
NEXT_PUBLIC_SIGNER_2=0x<logos_network_address>
NEXT_PUBLIC_SIGNER_3=0x<community_rep_address>
NEXT_PUBLIC_REQUIRED_SIGS=2
EOF
```

- [ ] **Step 2: Test that the frontend builds successfully with mainnet env**

```bash
cd frontend && npm run build
```
Expected: `✓ Compiled successfully`, no missing env var errors.

---

### Task 8: Deploy frontend to Vercel

- [ ] **Step 1: Install Vercel CLI (if not already installed)**

```bash
npm install -g vercel
```

- [ ] **Step 2: Link the project to Vercel**

```bash
cd frontend && vercel link
```
Follow the prompts: select your Vercel account and create a new project called `abeokuta-mini`.

- [ ] **Step 3: Add all environment variables to Vercel**

For every line in `frontend/.env.local`, run:

```bash
vercel env add NEXT_PUBLIC_CAMPAIGN_ADDRESS production
# paste: 0x<ADDRESS_A>

vercel env add NEXT_PUBLIC_STAKING_ADDRESS production
# paste: 0x<ADDRESS_B>

vercel env add NEXT_PUBLIC_TREASURY_ADDRESS production
# paste: 0x<GNOSIS_SAFE>

vercel env add NEXT_PUBLIC_BRIDGE_ADDRESS production
# paste: 0x<FUNDBRAVE_BRIDGE>

vercel env add NEXT_PUBLIC_USDC_ADDRESS production
# paste: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

vercel env add NEXT_PUBLIC_DAI_ADDRESS production
# paste: 0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb

vercel env add NEXT_PUBLIC_WETH_ADDRESS production
# paste: 0x4200000000000000000000000000000000000006

vercel env add NEXT_PUBLIC_BTC_ADDRESS production
# paste: <your_btc_address>

vercel env add NEXT_PUBLIC_SOL_ADDRESS production
# paste: <your_sol_address>

vercel env add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID production
# paste: <your_wc_project_id>

vercel env add NEXT_PUBLIC_SIGNER_1 production
# paste: 0x<signer_1>

vercel env add NEXT_PUBLIC_SIGNER_2 production
# paste: 0x<signer_2>

vercel env add NEXT_PUBLIC_SIGNER_3 production
# paste: 0x<signer_3>

vercel env add NEXT_PUBLIC_REQUIRED_SIGS production
# paste: 2

# Add cross-chain bridge addresses for each source chain:
vercel env add NEXT_PUBLIC_BRIDGE_ETHEREUM_ADDRESS production
vercel env add NEXT_PUBLIC_BRIDGE_POLYGON_ADDRESS production
vercel env add NEXT_PUBLIC_BRIDGE_ARBITRUM_ADDRESS production
vercel env add NEXT_PUBLIC_BRIDGE_OPTIMISM_ADDRESS production
```

- [ ] **Step 4: Deploy to production**

```bash
cd frontend && vercel --prod
```
Expected output:
```
✓  Deployed to https://abeokuta-mini.vercel.app
```

- [ ] **Step 5: Smoke-test the live site**

Open `https://abeokuta-mini.vercel.app` in a browser.
Check:
- Campaign progress bar loads (reads from Base mainnet)
- Donate page shows correct USDC address
- WalletConnect modal opens when clicking "Connect Wallet"
- No console errors about missing env vars

---

## Phase 3 — Watcher Service Deployment (Railway)

### Task 9: Prepare watcher environment for mainnet

**Files:**
- Create: `watcher/.env` (never commit)

- [ ] **Step 1: Create the watcher env file**

```bash
cat > watcher/.env << 'EOF'
# ─── EVM / Base mainnet ──────────────────────────────────────────────────────
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/<ALCHEMY_API_KEY>
WATCHER_PRIVATE_KEY=0x<WATCHER_HOT_WALLET_PRIVATE_KEY>
CAMPAIGN_ADDRESS=0x<ADDRESS_A>
STAKING_ADDRESS=0x<ADDRESS_B>
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

# ─── BTC ─────────────────────────────────────────────────────────────────────
BTC_ADDRESS=<your_btc_address>
# BTC_MIN_CONFIRMATIONS=6   # default — change only if you know what you're doing

# ─── Solana ───────────────────────────────────────────────────────────────────
SOL_ADDRESS=<your_sol_address>
SOL_RPC_URL=https://api.mainnet-beta.solana.com
SOL_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# ─── Polling ─────────────────────────────────────────────────────────────────
BTC_POLL_INTERVAL_MS=30000
SOL_POLL_INTERVAL_MS=10000
HARVEST_INTERVAL_MS=86400000   # 24h

# ─── Health check (used by Railway/Fly probes) ────────────────────────────────
HEALTH_PORT=3001

# ─── Donation thresholds ──────────────────────────────────────────────────────
MIN_DONATION_USD=1.0
MAX_DONATION_USD=5000
EOF
```

- [ ] **Step 2: Test the watcher compiles and starts locally (dry-run)**

```bash
cd watcher && npm install && npm run build
```
Expected: `dist/index.js` created, zero TypeScript errors.

```bash
npm start
```
Expected: startup banner printed, float wallet USDC balance shown, no crashes. Press Ctrl+C to stop.

---

### Task 10: Deploy watcher to Railway

Railway is recommended because it handles persistent processes, restarts on crash, and environment variables via its dashboard.

- [ ] **Step 1: Create a Railway account**

Go to https://railway.app and sign up (GitHub login is easiest).

- [ ] **Step 2: Create a new project**

Click "New Project" → "Deploy from GitHub repo" → select `abeokuta-mini` repo.
Set the root directory to `watcher`.

- [ ] **Step 3: Add all environment variables in Railway dashboard**

In the service settings → Variables tab, add every line from `watcher/.env`:
- `BASE_RPC_URL`
- `WATCHER_PRIVATE_KEY`
- `CAMPAIGN_ADDRESS`
- `STAKING_ADDRESS`
- `USDC_ADDRESS`
- `BTC_ADDRESS`
- `SOL_ADDRESS`
- `SOL_RPC_URL`
- `SOL_USDC_MINT`
- `BTC_POLL_INTERVAL_MS`
- `SOL_POLL_INTERVAL_MS`
- `HARVEST_INTERVAL_MS`
- `HEALTH_PORT`
- `MIN_DONATION_USD`
- `MAX_DONATION_USD`

> **Security:** Never paste the private key into any chat, log, or commit. Only put it in Railway's encrypted Variables tab.

- [ ] **Step 4: Set the start command in Railway**

In the service settings → Settings tab, set:
- Build command: `npm install && npm run build`
- Start command: `npm start`

- [ ] **Step 5: Set the health check path**

In Railway service settings → Health checks:
- Path: `/health`
- Port: `3001`

- [ ] **Step 6: Deploy and watch logs**

Click "Deploy" and watch the Railway logs tab.

Expected log lines:
```
============================================================
 Abeokuta Mini — Deposit Watcher
============================================================
Campaign contract : 0x<ADDRESS_A>
USDC contract     : 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
BTC address       : <your_btc_address>
SOL address       : <your_sol_address>
Float wallet USDC : 500.000000 USDC
============================================================
[health] HTTP server listening on :3001/health
[btc] Polling every 30s (min 6 confirmations)
[sol] Polling every 10s
[harvest] Harvest automation enabled — calling harvestAndDistribute every 24h
```

- [ ] **Step 7: Verify the health endpoint**

```bash
curl https://<your-railway-app-url>/health
```
Expected:
```json
{"status":"ok","uptimeSec":42,"btcLastPollAt":"2026-04-12T...","solLastPollAt":"..."}
```

---

## Alternative: Watcher on a VPS (if Railway is not preferred)

If you'd rather use a DigitalOcean droplet, an AWS EC2 instance, or any Ubuntu server, use PM2 instead:

```bash
# On the server, after uploading the watcher/ directory and .env file:
npm install -g pm2
cd watcher && npm install && npm run build
pm2 start dist/index.js --name abeokuta-watcher
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
pm2 logs abeokuta-watcher   # watch live logs
```

---

## Post-Deployment Checklist

Run this after all three phases are complete:

- [ ] Open `https://basescan.org/address/0x<CAMPAIGN_ADDRESS>` — contract is verified ✓
- [ ] Open the live frontend URL — campaign stats load from Base mainnet ✓
- [ ] Check watcher Railway logs — no errors, polling both BTC and SOL ✓
- [ ] Check watcher health: `curl <railway-url>/health` → `"status":"ok"` ✓
- [ ] Make a small test donation (e.g. $1 USDC) through the frontend — appears in campaign stats ✓
- [ ] Confirm the Gnosis Safe owns the treasury via `cast call <campaign> "treasury()(address)"` ✓
- [ ] Confirm `setWatcher` was called: `cast call <campaign> "watcher()(address)"` → watcher hot wallet ✓

---

## What I Need From You (Summary)

Before I can execute **any** of the above tasks, I need these from you:

### Blocking prerequisites (can't deploy without these)

1. **FundBraveBridge address on Base mainnet** — reach out to FundBrave team; the deploy script throws without it
2. **Gnosis Safe address on Base mainnet** — create one at safe.global if you don't have one
3. **Deployer private key** — needs ≥ 0.05 ETH on Base mainnet

### Needed before frontend goes live

4. **WalletConnect Project ID** — from cloud.walletconnect.com (free)
5. **3 multisig signer public addresses** — shown on the campaign page as governance
6. **BTC treasury address** — wallet you control, monitored by the watcher
7. **SOL treasury address** — same

### Needed before watcher goes live

8. **Watcher hot wallet private key** — generate fresh: `cast wallet new`
9. **500+ USDC on Base mainnet** — fund the watcher float wallet (real USDC, not testnet)
10. **Alchemy API key** (also needed for deploy)

### Nice to have

11. **Basescan API key** — for contract verification (free at basescan.org)
12. **Platform wallet address** — FundBrave's fee recipient (can use deployer address temporarily if FundBrave hasn't confirmed)
