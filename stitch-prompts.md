# Stitch Prompts — FundBrave Abeokuta Logos Circle

---

## 1. Dashboard Page (`/dashboard`)

Redesign the transparency dashboard for a Web3 fundraising campaign (FundBrave × Logos Network — empowering women entrepreneurs in Abeokuta, Nigeria). Campaign goal: $1,000–$2,500 USDC. Dark theme, premium feel.

**Color palette:** Primary blue `#2563EB`, secondary purple `#7C3AED`, accent orange `#F97316`, dark bg `#0A0E1A`, card bg `#111827`, text `#F1F5F9`, muted `#94A3B8`, success `#10B981`. Font: Inter. Use glass morphism (`backdrop-blur`, `border: 1px solid rgba(255,255,255,0.08)`).

**Header:** Sticky, glass morphism. Left: back arrow + FundBrave logo (link to `/`). Right: "Transparency Dashboard" label + RainbowKit ConnectButton.

**Layout — 6 sections stacked vertically, max-width 5xl:**

### Section 1: Campaign Progress Hero Card (full width)
- Large raised amount (4xl font bold white): "$X,XXX" with "of $2,500 USDC" muted beside it
- Progress percentage on the right (2xl font, blue)
- Thick gradient progress bar below (blue → purple → orange), animated fill with GSAP on load
- Below the bar: three items spaced — "Min goal: $1,000" | "X days left" (or "Campaign ended") | "Deadline: Month Day, Year"
- Subtle glow/shadow on the card

### Section 2: Stats Grid (4 columns desktop, 2 mobile)
Four glass cards, each with:
- Small colored icon in a rounded square (top-left)
- Large bold number (2xl)
- Small muted label below
- Cards: Unique Donors (blue icon), Total Raised (orange icon), Total Staked (green icon), Yield Generated (purple icon)
- GSAP: counter animation (count up from 0) when scrolled into view
- Hover: subtle lift + border brightening

### Section 3: Fund Flow Visualization (NEW)
A visual diagram showing where money goes:
- Three horizontal flow lanes with animated dotted lines connecting them:
  - **Donations** → Campaign Contract → Multisig Treasury
  - **Staking** → Aave V3 Vault → Yield splits (79% campaign / 19% staker / 2% platform)
  - **Cross-chain** → LayerZero Bridge → Campaign Contract
- Use small icons/badges for each node (DollarSign, TrendingUp, Shield, Globe)
- Animated pulse dots moving along the lines (CSS animation)
- This makes the transparency *visual*, not just numbers
- On mobile: stack vertically as a simple flow list instead of a diagram

### Section 4: Multisig Treasury Section
- Header: Shield icon (green) + "Multisig Treasury" + "Requires 2-of-3 signatures to withdraw"
- Gnosis Safe address in a monospace pill with external link to block explorer
- Three signer cards stacked:
  - Each shows: signer name (e.g. "Abeokuta Circle Lead 1", "Logos Network"), truncated address in mono, external link icon
  - Subtle hover highlight
- Below signers: "Smart Contracts" subsection listing 4 contracts (Campaign, Staking Pool, Bridge, USDC) each with label + mono address + explorer link

### Section 5: Recent Donations Feed
- Header: "Recent Donations" with a count badge
- List of donation entries, each showing:
  - Avatar/identicon placeholder
  - Truncated wallet address (mono)
  - Amount donated
  - Time ago
  - Explorer link
- Subtle slide-in-from-left GSAP animation, staggered

### Section 6: Bottom CTA Card
- Centered text: "Ready to contribute?"
- Subtitle: "Every donation directly funds women entrepreneurs in Abeokuta."
- Two buttons side by side: "Donate Now" (orange primary) | "Stake to Support" (blue outline secondary)

### Global GSAP Animations (ScrollTrigger)
- Progress bar: animate fill from 0% to current on load
- Stats: counter animation (0 → value) on scroll
- Fund flow: pulse dots animate continuously, lanes fade in staggered
- Donation feed: slide-in stagger
- All cards: fade-in-up on scroll (threshold 0.2)

### Responsive
- Stats grid: 4 cols → 2 cols on mobile
- Fund flow diagram: horizontal lanes → vertical flow list on mobile
- CTA buttons: side by side → stacked on mobile

**Tech:** Next.js App Router ("use client"), Tailwind CSS, GSAP + ScrollTrigger, lucide-react icons, RainbowKit. No additional dependencies.

---

## 2. Donate Page (`/donate`)

Redesign the donation page for a Web3 fundraising campaign (FundBrave × Logos Network — empowering women entrepreneurs in Abeokuta, Nigeria). Goal: $1,000–$2,500 USDC. Dark theme, premium feel.

**Color palette:** Primary blue `#2563EB`, secondary purple `#7C3AED`, accent orange `#F97316`, dark bg `#0A0E1A`, card bg `#111827`, text `#F1F5F9`, muted `#94A3B8`, success `#10B981`. Font: Inter. Glass morphism cards.

**Header:** Sticky glass. Left: back arrow + FundBrave logo (link to `/`). Right: RainbowKit ConnectButton.

**Layout — single column, max-width 2xl, centered:**

### 1. Mini Campaign Progress Banner (top)
- Compact horizontal card: "Campaign raised $X,XXX of $2,500" on the left, small progress bar + percentage on the right
- Thin gradient progress bar (blue → purple → orange)
- Subtle, not distracting — just context

### 2. Page Title
- Icon (Heart with gradient background) + "Make a Donation" heading
- Subtitle: "All donations are converted to USDC and held in a transparent multisig treasury."

### 3. Donation Card (main focus — large glass card with sections inside)

**Section A: Token Selector**
- Label: "Select token"
- Horizontal pill buttons: USDC, ETH, DAI, USDT (grid of 4)
- Selected state: filled orange with glow shadow
- Unselected: dark bg with border, hover brightens
- Below pills: small muted note if non-USDC: "ETH will be automatically swapped to USDC via DEX"

**Section B: Amount Input**
- Large clean input field with token symbol on the right
- Below: preset amount buttons ($5, $10, $25, $50, $100) as small rounded pills
- Validation messages below: min/max warnings in amber

**Section C: Donation Summary (appears when amount > 0)**
- Compact breakdown card inside the main card:
  - "You donate" → amount + token
  - "Campaign receives" → equivalent USDC
  - "Network" → Base logo + "Base" (or detected chain)
- Divider line

**Section D: Cross-Chain Info**
- Collapsed by default, expandable
- "Donating from another chain?" with expand chevron
- When expanded: shows supported chains (Ethereum, Polygon, Arbitrum, Optimism) with chain icons
- Note: "Switch network in your wallet to donate cross-chain via LayerZero"

**Section E: Action Button**
- Full width orange CTA: "Donate $X USDC" with Heart icon
- Disabled state: 40% opacity
- Loading states: spinning loader + step text ("Step 1/2: Approving..." → "Step 2/2: Donating...")
- High-value warning: amber card above button asking for confirmation

### 4. Manual Donations Section (below main card)
- Collapsible section for non-EVM donations (BTC, SOL)
- Muted styling, secondary importance

### 5. Success Screen (replaces everything on success)
- Centered card with large green checkmark circle (animated scale-in)
- "Thank you!" heading
- "Your donation of X USDC has been confirmed"
- "You're helping empower women entrepreneurs in Abeokuta"
- View transaction link (blue, opens explorer)
- Two buttons: "Back to campaign" (outline) | "Donate again" (orange)
- Confetti or subtle particle animation on success

### GSAP Animations
- Page load: card fades in + slides up (0.6s ease-out)
- Token selection: smooth color transition
- Amount presets: subtle scale bounce on click
- Summary card: slide-down reveal when amount entered
- Success checkmark: scale from 0 → 1 with elastic easing
- Step banners: slide-in from top

**Not connected state:** Centered card with "Connect your wallet to donate" + ConnectButton

**Tech:** Next.js App Router ("use client"), Tailwind CSS, GSAP, lucide-react, RainbowKit, wagmi/viem.

---

## 3. Stake Page (`/stake`)

Redesign the staking page for a Web3 fundraising campaign (FundBrave × Logos Network). Users stake USDC into Aave V3, earn yield, and choose how much yield goes to the campaign vs themselves. Dark theme, premium DeFi feel.

**Color palette:** Same — `#2563EB`, `#7C3AED`, `#F97316`, `#0A0E1A`, `#111827`, `#F1F5F9`, `#94A3B8`, `#10B981`. Font: Inter. Glass morphism.

**Header:** Same sticky glass header — back arrow + FundBrave logo + ConnectButton.

**Layout — single column, max-width 2xl, centered:**

### 1. Page Header
- TrendingUp icon in a blue gradient rounded square + "Stake to Support" heading
- Subtitle: "Earn Aave yield while funding women's education. You choose the split."

### 2. Your Position Card (only when connected + has stake)
- Three stat boxes in a row:
  - "Your Stake" — white, large number, DollarSign icon
  - "Your Yield" — green, pending amount, TrendingUp icon
  - "For Campaign" — blue, pending cause amount, Heart icon
- Below stats: "Claim" button (appears when yield > 0) with breakdown tooltip: "$X to you · $X to campaign"
- Card has a subtle green left-border accent when yield is claimable

### 3. Yield Split Configurator (collapsible, visually rich)
- Header bar (always visible): SlidersHorizontal icon + "Your Yield Split" + live pills showing current split (e.g. "79% campaign | 19% you | 2% platform") + chevron
- When expanded:
  - **Visual split bar** — horizontal segmented bar: blue segment (campaign), green segment (you), small gray segment (platform 2% fixed)
  - **Slider** — range input, dragging updates the visual bar in real-time
  - Labels on ends: "Donate to campaign" ← → "Keep for myself"
  - **Three stat circles** below the slider:
    - Blue circle: X% Campaign
    - Green circle: X% You
    - Gray circle: 2% Platform (fixed label)
  - **Preset buttons:** "Default (79/19)" | "Generous (90/8)" | "Max donate (98/0)" | "Keep all (0/98)"
  - Selected preset: blue border + bg highlight
  - Info note: "Your split applies when you claim. Changing it affects all unsettled yield."
  - Save button: orange, full width, disabled when unchanged

### 4. Stake/Unstake Card (main action)
- **Tab switcher** at top: "Stake" | "Unstake" — pill toggle, selected = orange fill
- **Amount input** with USDC label on right
  - Stake tab: shows "Balance: $X" on the right of label
  - Unstake tab: shows "Max: $X" as clickable blue link
- **Preset buttons** (stake only): $10, $25, $50, $100, $250
- **Yield preview** (stake tab, when amount > 0): small muted text showing estimated split: "~79% ($X) → campaign · ~19% ($X) → you" based on amount and current split
- **APY badge:** Small pill near the input: "~3–5% APY via Aave V3" with sparkle icon
- **Action button:** Full width orange: "Stake $X USDC" or "Unstake $X USDC"
- **Step indicators:** Blue banners for "Approving..." → "Staking..." → "Confirming..."
- **Success banner:** Green, inline (not full page), with tx link + "Done" dismiss button

### 5. How It Works (bottom, educational)
- Three-step visual flow (horizontal on desktop, vertical on mobile):
  1. "Deposit USDC" → icon: Wallet → "Your USDC goes into Aave V3"
  2. "Earn Yield" → icon: TrendingUp → "Aave generates ~3-5% APY"
  3. "Split & Impact" → icon: Heart → "Yield splits between you and the campaign"
- Connected by dotted lines with animated pulse dots
- Muted card bg, subtle border

**Not connected state:** Same pattern — centered card with wallet connect prompt

### GSAP Animations
- Position cards: counter animation on mount
- Split configurator: smooth expand/collapse with height animation
- Split bar segments: animate width changes on slider drag (real-time, CSS transition)
- Stake/unstake tabs: smooth color swap
- How-it-works: staggered fade-in-up on scroll
- Success: slide-down from top
- Yield preview: fade-in when amount changes

**Tech:** Next.js App Router ("use client"), Tailwind CSS, GSAP + ScrollTrigger, lucide-react, RainbowKit, wagmi/viem.
