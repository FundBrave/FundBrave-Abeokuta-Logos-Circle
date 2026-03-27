"use client";

interface DonateSummaryCardProps {
  amount: string;
  tokenSymbol: string;
}

export function DonateSummaryCard({
  amount,
  tokenSymbol,
}: DonateSummaryCardProps) {
  const displaySymbol = tokenSymbol;
  const numAmount = parseFloat(amount) || 0;
  // Estimate: campaign receives amount minus small gas overhead
  const netAmount = Math.max(numAmount - 0.15, 0).toFixed(2);

  return (
    <div className="bg-surface-container-low/50 rounded-xl p-5 border border-outline-variant/10 space-y-3">
      <div className="flex justify-between items-center text-sm">
        <span className="text-on-surface-variant">You donate</span>
        <span className="font-bold">
          {numAmount.toFixed(2)} {displaySymbol}
        </span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="text-on-surface-variant">Campaign receives</span>
        <span className="font-bold text-primary">
          {netAmount} USDC{" "}
          <span className="text-xs font-normal text-on-surface-variant/60">
            (after gas)
          </span>
        </span>
      </div>
      <div className="pt-2 border-t border-outline-variant/10 flex justify-between items-center text-xs uppercase tracking-widest font-bold">
        <span className="text-on-surface-variant/60">Network</span>
        <span className="flex items-center gap-1.5 text-on-surface">
          <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
          Base
        </span>
      </div>
    </div>
  );
}
