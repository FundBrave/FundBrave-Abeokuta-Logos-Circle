"use client";

import {
  CONTRACT_ADDRESSES,
  shortenAddress,
  getAddressExplorerUrl,
} from "../../lib/contracts";

const CONTRACTS = [
  { label: "Campaign Contract", address: CONTRACT_ADDRESSES.campaign },
  { label: "Staking Vault", address: CONTRACT_ADDRESSES.staking },
  { label: "Liquidity Bridge", address: CONTRACT_ADDRESSES.fundBraveBridge },
  { label: "USDC Escrow", address: CONTRACT_ADDRESSES.usdc },
];

export function TransparencyContracts() {
  return (
    <div className="glass-card rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="p-6 border-b border-outline-variant/5 bg-white/5">
        <h3 className="font-headline text-xl font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-2xl">
            terminal
          </span>
          Smart Contracts
        </h3>
      </div>
      <div className="divide-y divide-outline-variant/5">
        {CONTRACTS.map(({ label, address }) => (
          <a
            key={label}
            href={getAddressExplorerUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors"
          >
            <span className="font-medium">{label}</span>
            <code className="text-xs font-mono bg-surface-container px-2 py-1 rounded text-primary-fixed-dim">
              {shortenAddress(address)}
            </code>
          </a>
        ))}
      </div>
    </div>
  );
}
