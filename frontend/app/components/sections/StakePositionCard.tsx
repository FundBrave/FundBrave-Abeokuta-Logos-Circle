"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useScrollReveal } from "../../hooks/useScrollReveal";

interface StakePositionCardProps {
  stakerPrincipal: bigint;
  stakerPrincipalFormatted: string;
  pendingYieldFormatted: string;
  pendingCauseFormatted: string;
  pendingYield: bigint;
  pendingCause: bigint;
  isProcessing: boolean;
  step: string;
  onClaimYield: () => void;
  onCompoundYield: () => void;
}

export function StakePositionCard({
  stakerPrincipal,
  stakerPrincipalFormatted,
  pendingYieldFormatted,
  pendingCauseFormatted,
  pendingYield,
  pendingCause,
  isProcessing,
  step,
  onClaimYield,
  onCompoundYield,
}: StakePositionCardProps) {
  const hasYield    = pendingYield > 0n || pendingCause > 0n;
  const isStaked    = stakerPrincipal > 0n;
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useScrollReveal<HTMLElement>({ y: 30, duration: 0.6 });

  return (
    <section ref={ref} className="relative rounded-2xl p-[1px] bg-gradient-to-r from-primary-container via-secondary-container to-primary-container shadow-2xl">
      <div className="glass-card rounded-[15px] p-6 relative overflow-hidden group">
        {/* Watermark icon */}
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <span className="text-7xl">
            <span className="material-symbols-outlined">
              account_balance_wallet
            </span>
          </span>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-on-surface-variant text-xs font-label uppercase tracking-wider">
              <span className="text-sm">
                <span className="material-symbols-outlined">attach_money</span>
              </span>
              Your Stake
            </div>
            <div className="text-xl font-headline font-bold text-on-surface">
              ${stakerPrincipalFormatted}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-on-surface-variant text-xs font-label uppercase tracking-wider">
              <span className="text-sm">
                <span className="material-symbols-outlined">trending_up</span>
              </span>
              Your Yield
            </div>
            <div className="text-xl font-headline font-bold text-primary">
              ${pendingYieldFormatted}
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-on-surface-variant text-xs font-label uppercase tracking-wider">
              <span className="text-sm">
                <span className="material-symbols-outlined">favorite</span>
              </span>
              For Campaign
            </div>
            <div className="text-xl font-headline font-bold text-tertiary-fixed-dim">
              ${pendingCauseFormatted}
            </div>
          </div>
        </div>

        {/* Claim / Compound footer */}
        <div className="flex items-center justify-between pt-6 border-t border-outline-variant/20">
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              className="text-sm text-on-surface-variant hover:text-primary transition-colors"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={() => setShowTooltip((v) => !v)}
            >
              <span className="material-symbols-outlined">info</span>
            </button>
            <span className="text-on-surface-variant text-sm">
              Yield breakdown
            </span>
            {showTooltip && (
              <div className="absolute bottom-full left-0 mb-2 w-64 p-3 rounded-xl bg-surface-container-highest border border-outline-variant/30 text-xs text-on-surface shadow-xl z-20">
                <p className="font-semibold mb-1">How yield is split</p>
                <p className="text-on-surface-variant leading-relaxed">
                  Your yield is automatically divided between you and the
                  campaign based on your chosen split ratio. The platform retains
                  a fixed 2% fee.
                </p>
              </div>
            )}
          </div>

          {/* Always show actions when staked; disable when no yield yet */}
          {isStaked ? (
            <div className="flex items-center gap-2">
              <button
                onClick={onCompoundYield}
                disabled={isProcessing || !hasYield}
                title={!hasYield ? "No yield to compound yet" : "Re-stake your yield into Aave"}
                className="text-on-surface-variant hover:text-primary px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 border border-outline-variant/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isProcessing && step === "compounding" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Compound"
                )}
              </button>
              <button
                onClick={onClaimYield}
                disabled={isProcessing || !hasYield}
                title={!hasYield ? "No yield to claim yet" : "Claim your yield to your wallet"}
                className="bg-surface-container-highest hover:bg-surface-bright text-on-surface px-6 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 border border-outline-variant/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isProcessing && step === "claiming" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Claim Yield"
                )}
              </button>
            </div>
          ) : (
            <span className="text-on-surface-variant text-xs">
              Stake USDC below to start earning
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
