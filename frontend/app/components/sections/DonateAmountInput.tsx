"use client";

import { MIN_DONATION_USD, MAX_DONATION_USD } from "../../lib/contracts";

interface DonateAmountInputProps {
  amount: string;
  onChange: (value: string) => void;
  tokenSymbol: string;
  presets: readonly number[];
}

export function DonateAmountInput({
  amount,
  onChange,
  tokenSymbol,
  presets,
}: DonateAmountInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip non-numeric chars (prevents e, +, -, scientific notation)
    const sanitized = e.target.value.replace(/[^0-9.]/g, "");
    // Only allow one decimal point
    const parts = sanitized.split(".");
    onChange(
      parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized
    );
  };

  const displaySymbol = tokenSymbol;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-bold tracking-widest text-on-surface-variant uppercase font-label">
          Amount
        </label>
        <div className="relative group">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={handleChange}
            placeholder="0.00"
            className="w-full bg-surface-container-lowest border-none rounded-xl py-6 px-6 text-3xl font-bold font-headline focus:ring-2 focus:ring-tertiary/40 transition-all text-on-surface placeholder-outline-variant"
            aria-label="Donation amount"
          />
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 text-on-surface-variant font-bold">
            <span>{displaySymbol}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p.toString())}
            className="px-4 py-2 rounded-lg bg-surface-container-high text-sm font-medium hover:bg-surface-variant transition-colors border border-outline-variant/10 cursor-pointer"
            aria-label={`Preset: ${tokenSymbol === "ETH" || tokenSymbol === "WETH" ? "" : "$"}${p}`}
          >
{tokenSymbol === "ETH" || tokenSymbol === "WETH" ? "" : "$"}{p}
          </button>
        ))}
      </div>

      {amount && parseFloat(amount) > 0 && parseFloat(amount) < MIN_DONATION_USD && (
        <p className="text-amber-400 text-xs">
          Minimum donation is ${MIN_DONATION_USD} USDC
        </p>
      )}
      {amount && parseFloat(amount) > MAX_DONATION_USD && (
        <p className="text-amber-400 text-xs">
          Maximum per-transaction is ${MAX_DONATION_USD.toLocaleString()} USDC
          (circuit breaker limit)
        </p>
      )}
    </div>
  );
}
