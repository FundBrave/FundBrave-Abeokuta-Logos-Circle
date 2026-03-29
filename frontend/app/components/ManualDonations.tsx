"use client";

import { TokenIcon } from "./ui/TokenIcon";

/**
 * ManualDonations
 *
 * Displays copyable donation addresses for:
 *  • The campaign smart contract (any EVM wallet → send USDC directly)
 *  • Bitcoin  (BTC treasury wallet — manually credited within 24–48 h)
 *  • Solana   (SOL/USDC-SPL treasury wallet — manually credited within 24–48 h)
 *
 * No wallet connection required — pure clipboard UI.
 */

import { useState } from "react";
import { Copy, Check, ExternalLink, AlertCircle } from "lucide-react";
import { CONTRACT_ADDRESSES, MANUAL_DONATION_ADDRESSES, getAddressExplorerUrl } from "../lib/contracts";

// ─── Copyable address row ─────────────────────────────────────────────────────

function CopyRow({
  label,
  address,
  href,
  mono = true,
}: {
  label: string;
  address: string;
  href?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Clipboard API not available (e.g. HTTP, iframe sandbox)
      console.warn("Clipboard API unavailable — user must copy manually");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2.5">
      {/* Address text */}
      <span
        className={`flex-1 text-xs text-white/70 truncate select-all ${mono ? "font-mono" : ""}`}
        title={address}
      >
        {address}
      </span>

      {/* Explorer link */}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0"
          title="View on explorer"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}

      {/* Copy button */}
      <button
        onClick={handleCopy}
        className={`flex-shrink-0 transition-colors ${
          copied ? "text-green-400" : "text-white/40 hover:text-white"
        }`}
        title={copied ? "Copied!" : `Copy ${label}`}
      >
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

// ─── Chain icon (inline SVG, no external deps) ────────────────────────────────

function BitcoinIcon() {
  return (
    <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none">
      <circle cx="16" cy="16" r="16" fill="#F7931A" />
      <path
        d="M22.6 13.8c.3-2-1.2-3-3.3-3.7l.7-2.7-1.6-.4-.7 2.6-1.3-.3.7-2.6-1.6-.4-.7 2.7-1-.3v-.1l-2.2-.5-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8.9l-.8 3.3c.1 0 .2.1.3.1l-.3-.1-1.1 4.5c-.1.2-.3.5-.7.4 0 .1-1.2-.3-1.2-.3L10 21l2.1.5 1.1.3-.7 2.7 1.6.4.7-2.7 1.3.3-.7 2.7 1.6.4.7-2.7c2.7.5 4.8.3 5.6-2.2.7-1.9-.04-3-1.4-3.7 1-.2 1.8-1 2-2.5zm-3.5 4.9c-.5 2-3.8.9-4.9.6l.9-3.5c1.1.3 4.5.8 4 2.9zm.5-4.9c-.5 1.8-3.4.9-4.4.7l.8-3.2c1 .2 3.9.7 3.6 2.5z"
        fill="white"
      />
    </svg>
  );
}

function SolanaIcon() {
  return (
    <svg viewBox="0 0 32 32" className="w-6 h-6" fill="none">
      <circle cx="16" cy="16" r="16" fill="#9945FF" />
      <path d="M10 20.5h12l-2.5 2.5H10l2.5-2.5z" fill="url(#sg)" />
      <path d="M10 14.75h12l-2.5 2.5H10l2.5-2.5z" fill="url(#sg2)" />
      <path d="M10 9h12l-2.5 2.5H10L12.5 9z" fill="url(#sg3)" />
      <defs>
        <linearGradient id="sg"  x1="10" y1="21.75" x2="22" y2="21.75" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
        <linearGradient id="sg2" x1="10" y1="16"    x2="22" y2="16"    gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
        <linearGradient id="sg3" x1="10" y1="10.25" x2="22" y2="10.25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#00FFA3"/><stop offset="1" stopColor="#DC1FFF"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function DonationCard({
  icon,
  title,
  subtitle,
  accent,
  address,
  explorerHref,
  note,
  noteIcon,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  accent: string;  // Tailwind border colour class
  address: string;
  explorerHref?: string;
  note: string;
  noteIcon?: React.ReactNode;
  empty?: string;  // message when address is not configured
}) {
  if (!address && empty) {
    return (
      <div className={`glass rounded-xl p-4 border-l-2 ${accent} opacity-50`}>
        <div className="flex items-center gap-3 mb-2">
          {icon}
          <div>
            <div className="text-sm font-medium text-white">{title}</div>
            <div className="text-xs text-white/40">{subtitle}</div>
          </div>
        </div>
        <p className="text-xs text-white/30 italic">{empty}</p>
      </div>
    );
  }

  return (
    <div className={`glass rounded-xl p-4 border-l-2 ${accent}`}>
      <div className="flex items-center gap-3 mb-3">
        {icon}
        <div>
          <div className="text-sm font-medium text-white">{title}</div>
          <div className="text-xs text-white/40">{subtitle}</div>
        </div>
      </div>

      <CopyRow label={title} address={address} href={explorerHref} />

      <div className="flex items-start gap-1.5 mt-2.5">
        {noteIcon ?? <AlertCircle className="w-3 h-3 text-white/25 flex-shrink-0 mt-0.5" />}
        <p className="text-xs text-white/35 leading-relaxed">{note}</p>
      </div>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function ManualDonations() {
  const contractAddress = CONTRACT_ADDRESSES.campaign;
  const btcAddress      = MANUAL_DONATION_ADDRESSES.bitcoin;
  const solAddress      = MANUAL_DONATION_ADDRESSES.solana;

  return (
    <div className="space-y-3">
      {/* Section heading */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-white/30 uppercase tracking-wider font-medium">
          Other ways to donate
        </span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Contract address — any EVM wallet */}
      <DonationCard
        icon={<TokenIcon symbol="USDC" size={24} />}
        title="Send USDC directly"
        subtitle="Any EVM wallet · Base Sepolia"
        accent="border-[#2563EB]"
        address={contractAddress}
        explorerHref={contractAddress !== "0x0000000000000000000000000000000000000000" ? getAddressExplorerUrl(contractAddress) : undefined}
        note="Send USDC (6 decimals) to this contract address from any EVM-compatible wallet. Your donation is recorded on-chain automatically."
      />

      {/* Bitcoin */}
      <DonationCard
        icon={<TokenIcon symbol="BTC" size={24} />}
        title="Donate with Bitcoin"
        subtitle="BTC · Native Bitcoin network"
        accent="border-[#F7931A]"
        address={btcAddress}
        note="Send any amount of BTC to this address. We convert all BTC donations to USDC and credit them to the campaign within 24–48 hours."
        empty="Bitcoin address not yet configured — check back soon."
      />

      {/* Solana */}
      <DonationCard
        icon={<TokenIcon symbol="SOL" size={24} />}
        title="Donate with Solana"
        subtitle="SOL or USDC-SPL · Solana network"
        accent="border-[#9945FF]"
        address={solAddress}
        note="Send SOL or USDC (SPL token) to this address. Donations are credited to the campaign within 24–48 hours. Please send a note or email us your tx hash."
        empty="Solana address not yet configured — check back soon."
      />

      <p className="text-center text-white/20 text-xs pt-1">
        For BTC/SOL donations, email{" "}
        <span className="text-white/35">hello@abeokutalogos.org</span> with your tx hash for faster crediting.
      </p>
    </div>
  );
}
