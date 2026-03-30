"use client";

import type { TokenInfo } from "../../lib/contracts";
import { TokenIcon } from "../ui/TokenIcon";

interface DonateTokenSelectorProps {
  tokens: readonly TokenInfo[];
  selectedToken: TokenInfo;
  onSelect: (token: TokenInfo) => void;
}

export function DonateTokenSelector({
  tokens,
  selectedToken,
  onSelect,
}: DonateTokenSelectorProps) {
  return (
    <div className="space-y-4">
      <label className="text-sm font-bold tracking-widest text-on-surface-variant uppercase font-label">
        Select Asset
      </label>
      <div className="flex flex-wrap gap-3">
        {tokens.map((token) => {
          const isSelected = selectedToken.symbol === token.symbol;
          return (
            <button
              key={token.symbol}
              onClick={() => onSelect(token)}
              className={`flex items-center gap-2 px-3 md:px-5 py-2.5 rounded-full font-bold transition-all cursor-pointer ${
                isSelected
                  ? "bg-tertiary text-on-tertiary shadow-[0_0_20px_rgba(255,182,144,0.3)]"
                  : "bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/20"
              }`}
              aria-label={`Select ${token.symbol}`}
            >
              <TokenIcon symbol={token.symbol} size={18} />
              {token.symbol}
            </button>
          );
        })}
      </div>
      {selectedToken.symbol !== "USDC" && (
        <p className="text-on-surface-variant/60 text-xs">
          {selectedToken.symbol} will
          be automatically swapped to USDC via DEX.
        </p>
      )}
    </div>
  );
}
