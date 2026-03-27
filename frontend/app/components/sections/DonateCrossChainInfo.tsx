"use client";

import { useState } from "react";

const SUPPORTED_CHAINS = [
  { name: "Ethereum",        icon: "⟠" },
  { name: "Polygon",         icon: "🟣" },
  { name: "Arbitrum",        icon: "🔷" },
  { name: "Optimism",        icon: "🔴" },
];

export function DonateCrossChainInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-outline-variant/15 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex justify-between items-center px-4 py-3 hover:bg-surface-container-high/40 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-on-surface-variant">
          <span className="material-symbols-outlined text-base text-primary">swap_horiz</span>
          Donating from another chain?
        </div>
        <span
          className={`material-symbols-outlined text-on-surface-variant text-base transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        >
          expand_more
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-5 pt-1 space-y-4 bg-surface-container-low/30">
          {/* How it works */}
          <p className="text-xs text-on-surface-variant leading-relaxed">
            You can donate USDC directly from Ethereum, Polygon, Arbitrum, or
            Optimism — no manual bridging needed. The donation is routed to Base
            automatically via{" "}
            <span className="text-primary font-semibold">LayerZero V2</span>.
          </p>

          {/* Supported chains */}
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_CHAINS.map((c) => (
              <span
                key={c.name}
                className="flex items-center gap-1.5 text-xs bg-surface-container-high px-3 py-1 rounded-full border border-outline-variant/15 text-on-surface-variant"
              >
                <span>{c.icon}</span>
                {c.name}
              </span>
            ))}
          </div>

          {/* Step-by-step */}
          <ol className="space-y-2 text-xs text-on-surface-variant">
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">1</span>
              <span>Switch your wallet network to Ethereum, Polygon, Arbitrum, or Optimism.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">2</span>
              <span>This page auto-detects the switch and shows the cross-chain donation form.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">3</span>
              <span>Approve USDC, then confirm. A small LayerZero messaging fee (paid in native gas) is added on top — your donation arrives on Base within a few minutes.</span>
            </li>
          </ol>

          {/* Fee note */}
          <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2">
            <span className="material-symbols-outlined text-amber-400 text-sm mt-0.5">info</span>
            <p className="text-xs text-amber-300/80">
              The LayerZero fee is typically $0.50–$2 in native gas (ETH/MATIC) and is shown before you confirm.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
