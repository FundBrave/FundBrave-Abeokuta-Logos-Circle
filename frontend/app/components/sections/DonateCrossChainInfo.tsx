"use client";

import { useState } from "react";

export function DonateCrossChainInfo() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="group cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex justify-between items-center py-2 border-b border-outline-variant/10">
        <span className="text-sm font-medium text-on-surface-variant group-hover:text-on-surface transition-colors">
          Donating from another chain?
        </span>
        <span
          className={`material-symbols-outlined text-on-surface-variant transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        >
          expand_more
        </span>
      </div>
      {expanded && (
        <div className="mt-4 flex items-center gap-4 text-xs text-on-surface-variant/70 leading-relaxed">
          <span className="material-symbols-outlined text-lg">bolt</span>
          Powered by LayerZero. Supports seamless cross-chain bridging from
          Optimism, Arbitrum, and Polygon directly to this vault.
        </div>
      )}
    </div>
  );
}
