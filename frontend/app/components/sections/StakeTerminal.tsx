"use client";

import { Loader2 } from "lucide-react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { getExplorerUrl, formatUSDC, STAKE_PRESETS } from "../../lib/contracts";
import { useScrollReveal } from "../../hooks/useScrollReveal";

interface StakeTerminalProps {
  isConnected: boolean;
  tab: "stake" | "unstake";
  setTab: (tab: "stake" | "unstake") => void;
  amount: string;
  setAmount: (amount: string) => void;
  parsedAmount: bigint;
  onStake: () => void;
  onUnstake: () => void;
  onMaxUnstake: () => void;
  staking: {
    step: string;
    isProcessing: boolean;
    txHash?: string;
    usdcBalance: bigint;
    usdcBalanceFormatted: string;
    stakerPrincipalFormatted: string;
    causeSharePct: string;
    causeShareBps: bigint;
    reset: () => void;
  };
}

export function StakeTerminal({
  isConnected,
  tab,
  setTab,
  amount,
  setAmount,
  parsedAmount,
  onStake,
  onUnstake,
  onMaxUnstake,
  staking,
}: StakeTerminalProps) {
  const isSuccess = staking.step === "success";
  const exceedsBalance =
    tab === "stake" && parsedAmount > 0n && parsedAmount > staking.usdcBalance;
  const ref = useScrollReveal<HTMLDivElement>({ y: 35, duration: 0.7 });

  if (!isConnected) {
    return (
      <div ref={ref}>
        <section className="bg-surface-container rounded-[2rem] p-1 overflow-hidden shadow-2xl relative">
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-secondary-container/10 blur-[80px] rounded-full" />
          <div className="bg-surface-container-low rounded-[1.9rem] p-8 relative z-10 text-center space-y-4">
            <p className="text-on-surface-variant">
              Connect your wallet to stake.
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div ref={ref}>
    <section className="bg-surface-container rounded-[2rem] p-1 overflow-hidden shadow-2xl relative">
      {/* Background Glow */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-secondary-container/10 blur-[80px] rounded-full" />
      <div className="bg-surface-container-low rounded-[1.9rem] p-6 relative z-10">
        {/* Tab Switcher */}
        <div className="flex bg-surface-container-lowest p-1.5 rounded-2xl mb-8">
          {(["stake", "unstake"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setAmount("");
                staking.reset();
              }}
              className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold capitalize transition-all ${
                tab === t
                  ? "bg-surface-container-high text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* APY Badge */}
        <div className="flex justify-between items-center mb-6">
          <span className="text-on-surface-variant text-sm font-medium">
            Yield Strategy
          </span>
          <div className="bg-tertiary-container/20 px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-tertiary-container/30">
            <span className="text-sm text-tertiary">
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
            </span>
            <span className="text-tertiary font-bold text-xs tracking-wider">
              4.2% APY (Aave V3)
            </span>
          </div>
        </div>

        {/* Input Section */}
        <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/15 mb-4 group focus-within:border-primary/40 transition-colors">
          <div className="flex justify-between items-center mb-4">
            <label className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest">
              Amount to {tab}
            </label>
            {tab === "unstake" ? (
              <button
                onClick={onMaxUnstake}
                className="text-on-surface-variant text-xs hover:text-primary transition-colors"
              >
                Staked: {staking.stakerPrincipalFormatted} USDC
              </button>
            ) : (
              <span className="text-on-surface-variant text-xs">
                Balance: {staking.usdcBalanceFormatted} USDC
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <input
              className="bg-transparent border-none p-0 text-4xl font-headline font-bold text-on-surface focus:ring-0 focus:outline-none w-2/3 placeholder:text-outline-variant/50"
              placeholder="0.00"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                const sanitized = e.target.value.replace(/[^0-9.]/g, "");
                const parts = sanitized.split(".");
                setAmount(
                  parts.length > 2
                    ? parts[0] + "." + parts.slice(1).join("")
                    : sanitized
                );
              }}
            />
            <div className="flex items-center gap-2 bg-surface-container-high py-2 px-3 rounded-xl">
              <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-black text-white">
                $
              </div>
              <span className="font-bold text-on-surface">USDC</span>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {(tab === "stake" ? STAKE_PRESETS : [50, 100, 250]).map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p.toString())}
                className="px-3 py-1 rounded-lg bg-surface-container-high text-[10px] font-bold text-on-surface-variant hover:bg-surface-variant transition-colors"
              >
                ${p}
              </button>
            ))}
            {tab === "unstake" && (
              <button
                onClick={onMaxUnstake}
                className="px-3 py-1 rounded-lg bg-surface-container-high text-[10px] font-bold text-on-surface-variant hover:bg-surface-variant transition-colors"
              >
                MAX
              </button>
            )}
          </div>
          {exceedsBalance && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-tertiary">
              <span className="material-symbols-outlined text-sm">warning</span>
              Amount exceeds your USDC balance ({staking.usdcBalanceFormatted})
            </p>
          )}
        </div>

        {/* Yield Preview */}
        {tab === "stake" && parsedAmount > 0n && (
          <div className="px-4 py-3 flex items-start gap-3 mb-8">
            <span className="text-lg text-primary-container mt-0.5">
              <span className="material-symbols-outlined">
                volunteer_activism
              </span>
            </span>
            <div>
              <p className="text-on-surface text-sm font-medium">
                <span className="text-primary font-bold">
                  ~{staking.causeSharePct} (
                  {formatUSDC(
                    (parsedAmount * staking.causeShareBps) / 10000n
                  )}{" "}
                  USDC)
                </span>{" "}
                of your yield will support the campaign.
              </p>
              <p className="text-on-surface-variant text-[11px] mt-1">
                Calculated based on current pool liquidity and protocol
                incentives.
              </p>
            </div>
          </div>
        )}

        {/* Success State */}
        {isSuccess && (
          <div className="mb-6 p-4 rounded-2xl bg-primary/10 border border-primary/20 text-center space-y-3">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl text-primary">
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              </span>
            </div>
            <h2 className="text-xl font-headline font-bold text-on-surface">
              {tab === "stake"
                ? "Staking Successful"
                : "Unstaking Successful"}
            </h2>
            <p className="text-on-surface-variant text-sm">
              {tab === "stake"
                ? `You've staked ${amount} USDC and are now powering change.`
                : `You've unstaked ${amount} USDC.`}
            </p>
            {staking.txHash && (
              <a
                href={getExplorerUrl(staking.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-surface-container-highest py-4 rounded-2xl text-on-surface font-bold hover:bg-surface-bright transition-colors"
              >
                View Transaction
              </a>
            )}
            <button
              onClick={() => {
                staking.reset();
                setAmount("");
              }}
              className="w-full py-4 text-primary text-sm font-bold"
            >
              Back to Staking
            </button>
          </div>
        )}

        {/* Execute Button */}
        {!isSuccess && (
          <button
            onClick={tab === "stake" ? onStake : onUnstake}
            disabled={
              !amount || parseFloat(amount) <= 0 || staking.isProcessing
            }
            className="w-full bg-gradient-to-r from-primary-container to-secondary-container py-5 rounded-2xl text-white font-headline font-extrabold text-lg shadow-xl shadow-primary-container/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {staking.isProcessing ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {staking.step === "approving" ? "Approving…" : "Processing…"}
              </>
            ) : (
              <>
                <span className="text-xl">
                  <span
                    className="material-symbols-outlined"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    lock
                  </span>
                </span>
                {tab === "stake" ? "Stake" : "Unstake"} USDC
              </>
            )}
          </button>
        )}

        {/* Help Link */}
        <div className="mt-6 text-center">
          <span className="text-on-surface-variant text-xs">
            How does yield redirection work?
          </span>
        </div>
      </div>
    </section>
    </div>
  );
}
