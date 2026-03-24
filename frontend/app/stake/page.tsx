"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  Loader2,
  AlertCircle,
  ExternalLink,
  Info,
  SlidersHorizontal,
  Check,
  ChevronDown,
} from "lucide-react";
import { useStaking } from "../hooks/useStaking";
import { useCampaignStats } from "../hooks/useCampaignStats";
import { FundBraveLogo } from "../components/FundBraveLogo";
import { getExplorerUrl, formatUSDC, STAKE_PRESETS } from "../lib/contracts";

// ─── Split configurator sub-component ────────────────────────────────────────

function SplitConfigurator({
  currentCauseBps,
  onSave,
  isSaving,
}: {
  currentCauseBps: bigint;
  onSave: (causeBps: number, stakerBps: number) => void;
  isSaving: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Slider controls causeShare (0–9800). stakerShare = 9800 - causeShare.
  const [causeBps, setCauseBps] = useState<number>(Number(currentCauseBps));

  const stakerBps   = 9800 - causeBps;
  const causePct    = (causeBps / 100).toFixed(0);
  const stakerPct   = (stakerBps / 100).toFixed(0);
  const isDirty     = causeBps !== Number(currentCauseBps);

  return (
    <div className="bg-[#111827] border border-white/10 rounded-2xl overflow-hidden mb-6">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-pointer min-h-12"
        aria-label="Toggle yield split configurator"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#2563EB]" />
          <span className="text-sm font-medium text-white">Your Yield Split</span>
          {isDirty && (
            <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full">
              unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Live summary pills */}
          <div className="flex items-center gap-1.5 text-xs">
            <span className="bg-[#2563EB]/30 text-[#2563EB] px-2 py-0.5 rounded-full">
              {causePct}% campaign
            </span>
            <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
              {stakerPct}% you
            </span>
            <span className="bg-white/5 text-white/30 px-2 py-0.5 rounded-full">
              2% platform
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Expanded configurator */}
      {open && (
        <div className="px-4 pb-4 border-t border-white/10 pt-4 space-y-5">
          {/* Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-white/50">
                Donate to campaign
              </label>
              <span className="text-xs text-white/50">
                Keep for myself
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={9800}
              step={100}
              value={causeBps}
              onChange={(e) => setCauseBps(Number(e.target.value))}
              className="w-full accent-[#2563EB] cursor-pointer"
              aria-label={`Yield split: ${causePct}% to campaign, ${stakerPct}% to you`}
            />

            {/* Visual split bar */}
            <div className="flex rounded-lg overflow-hidden h-3 mt-2">
              <div
                className="bg-[#2563EB] transition-all"
                style={{ width: `${causeBps / 98}%` }}
              />
              <div
                className="bg-green-500 transition-all"
                style={{ width: `${stakerBps / 98}%` }}
              />
              {/* Platform fee — always 2 of 100, but shown on its own 2% of bar */}
              <div className="bg-white/20 w-[2%]" />
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-[#2563EB]/10 rounded-xl p-3">
              <div className="text-xl font-bold text-[#2563EB]">{causePct}%</div>
              <div className="text-xs text-white/50 mt-0.5">Campaign</div>
            </div>
            <div className="bg-green-500/10 rounded-xl p-3">
              <div className="text-xl font-bold text-green-400">{stakerPct}%</div>
              <div className="text-xs text-white/50 mt-0.5">You</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <div className="text-xl font-bold text-white/30">2%</div>
              <div className="text-xs text-white/50 mt-0.5">Platform</div>
              <div className="text-[10px] text-white/20 mt-0.5">fixed</div>
            </div>
          </div>

          {/* Preset buttons */}
          <div>
            <p className="text-xs text-white/40 mb-2">Quick presets</p>
            <div className="flex gap-2 flex-wrap">
              {[
                { label: "Default (79/19)", cause: 7900 },
                { label: "Generous (90/8)",  cause: 9000 },
                { label: "Max donate",       cause: 9800 },
                { label: "Keep all",         cause: 0    },
              ].map(({ label, cause }) => (
                <button
                  key={label}
                  onClick={() => setCauseBps(cause)}
                  className={`text-xs rounded-lg px-3 py-2 border transition-all cursor-pointer min-h-9 ${
                    causeBps === cause
                      ? "border-[#2563EB] bg-[#2563EB]/20 text-white"
                      : "border-white/10 bg-white/5 text-white/50 hover:text-white hover:bg-white/10"
                  }`}
                  aria-label={`Preset: ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 text-xs text-white/40">
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <p>
              Your split applies when you claim yield. Changing it affects all
              unsettled yield since your last claim.
            </p>
          </div>

          {/* Save button */}
          <button
            onClick={() => { onSave(causeBps, stakerBps); setOpen(false); }}
            disabled={!isDirty || isSaving}
            className="bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2 px-3 rounded-xl transition-colors w-full text-sm flex items-center justify-center gap-2 cursor-pointer min-h-10"
          >
            {isSaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><Check className="w-4 h-4" /> Save Split</>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StakePage() {
  const { address, isConnected } = useAccount();
  const stats   = useCampaignStats();
  const staking = useStaking();

  const [tab, setTab]       = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");

  // FE-H1: Watch `address` (not `isConnected`) so state resets on both disconnect AND wallet switch.
  // isConnected stays true during wallet switch, so watching only it misses the switch case.
  useEffect(() => {
    if (!address) {
      setAmount("");
      setTab("stake");
      staking.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const parsedAmount = (() => {
    if (!amount) return 0n;
    const parts = amount.split(".");
    const whole = parts[0] || "0";
    const frac = (parts[1] || "").padEnd(6, "0").slice(0, 6);
    try {
      return BigInt(whole) * 1_000_000n + BigInt(frac);
    } catch {
      return 0n;
    }
  })();

  const handleStake   = () => { if (parsedAmount) staking.stakeUSDC(parsedAmount); };
  const handleUnstake = () => { if (parsedAmount) staking.unstakeUSDC(parsedAmount); };
  const handleMaxUnstake = () => {
    if (staking.stakerPrincipal > 0n)
      setAmount((Number(staking.stakerPrincipal) / 1e6).toString());
  };

  const isSuccess = staking.step === "success";

  return (
    <div className="min-h-screen bg-[#0A0E1A]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#111827] border-b border-white/10 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors cursor-pointer" aria-label="Back to home">
            <ArrowLeft className="w-4 h-4" />
            <FundBraveLogo className="h-7" />
          </Link>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#2563EB]/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-[#2563EB]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Stake to Support</h1>
        </div>
        <p className="text-white/50 text-sm mb-8">
          Earn Aave yield while contributing to the campaign. Choose how much of your yield to donate.
        </p>

        {/* Split configurator — always visible */}
        <SplitConfigurator
          currentCauseBps={staking.causeShareBps}
          onSave={staking.saveSplit}
          isSaving={staking.step === "settingsplit" || (staking.step === "confirming" && false)}
        />

        {/* Your position */}
        {isConnected && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
              <div className="text-lg font-bold text-white">${staking.stakerPrincipalFormatted}</div>
              <div className="text-xs text-white/50 mt-1">Your stake</div>
            </div>
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
              <div className="text-lg font-bold text-green-400">${staking.pendingYieldFormatted}</div>
              <div className="text-xs text-white/50 mt-1">Your yield</div>
            </div>
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-4">
              <div className="text-lg font-bold text-[#2563EB]">${staking.pendingCauseFormatted}</div>
              <div className="text-xs text-white/50 mt-1">For campaign</div>
            </div>
          </div>
        )}

        {/* Claim yield button */}
        {isConnected && (staking.pendingYield > 0n || staking.pendingCause > 0n) && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 mb-6 flex items-center justify-between">
            <div>
              <div className="text-white font-medium text-sm">Ready to claim</div>
              <div className="text-xs mt-0.5 space-y-0.5">
                <span className="text-green-400">${staking.pendingYieldFormatted} to you</span>
                <span className="text-white/30"> · </span>
                <span className="text-[#2563EB]">${staking.pendingCauseFormatted} to campaign</span>
              </div>
            </div>
            <button
              onClick={staking.claimYield}
              disabled={staking.isProcessing}
              className="border border-[#2563EB] bg-white/5 hover:bg-white/10 text-[#2563EB] font-medium py-2 px-3 rounded-xl transition-colors text-sm cursor-pointer min-h-10"
              aria-label="Claim yield"
            >
              {staking.isProcessing && staking.step === "claiming" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : "Claim"}
            </button>
          </div>
        )}

        {/* Main action */}
        {!isConnected ? (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-8 text-center">
            <p className="text-white/60 mb-4">Connect your wallet to stake.</p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-1 bg-white/5 rounded-xl p-1 mb-6">
              {(["stake", "unstake"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setAmount(""); staking.reset(); }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all cursor-pointer min-h-10 ${
                    tab === t
                      ? "bg-[#F97316] text-white"
                      : "text-white/50 hover:text-white"
                  }`}
                  aria-label={`Switch to ${t}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-white/60">Amount (USDC)</label>
                {tab === "unstake" && (
                  <button onClick={handleMaxUnstake} className="text-xs text-[#2563EB] hover:underline cursor-pointer" aria-label="Set max unstake amount">
                    Max: ${staking.stakerPrincipalFormatted}
                  </button>
                )}
                {tab === "stake" && (
                  <span className="text-xs text-white/40">
                    Balance: ${staking.usdcBalanceFormatted}
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    // FE-H1: Strip non-numeric chars (prevents e, +, -, scientific notation)
                    const sanitized = e.target.value.replace(/[^0-9.]/g, "");
                    const parts = sanitized.split(".");
                    setAmount(parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized);
                  }}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 transition-colors pr-16"
                  aria-label="Amount in USDC"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">USDC</span>
              </div>

              {tab === "stake" && parsedAmount > 0n && (
                <div className="mt-2 text-xs text-white/40 flex gap-3">
                  <span>
                    ~{staking.causeSharePct} (
                    {formatUSDC((parsedAmount * staking.causeShareBps) / 10000n)} USDC) → campaign
                  </span>
                  <span>
                    ~{staking.stakerSharePct} (
                    {formatUSDC((parsedAmount * staking.stakerShareBps) / 10000n)} USDC) → you
                  </span>
                </div>
              )}

              {tab === "stake" && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {STAKE_PRESETS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setAmount(p.toString())}
                      className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white/60 hover:text-white transition-all cursor-pointer min-h-9"
                      aria-label={`Preset: $${p}`}
                    >
                      ${p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {staking.errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{staking.errorMsg}</p>
              </div>
            )}

            {/* Step indicators */}
            {staking.step === "approving" && (
              <div className="bg-[#2563EB]/10 border border-[#2563EB]/30 rounded-2xl p-4 mb-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                <div>
                  <div className="text-white text-sm font-medium">Step 1/2: Approving USDC…</div>
                  <div className="text-white/50 text-xs">Confirm in your wallet</div>
                </div>
              </div>
            )}
            {staking.step === "staking" && (
              <div className="bg-[#2563EB]/10 border border-[#2563EB]/30 rounded-2xl p-4 mb-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                <div>
                  <div className="text-white text-sm font-medium">Step 2/2: Staking…</div>
                  <div className="text-white/50 text-xs">Confirm in your wallet</div>
                </div>
              </div>
            )}
            {(staking.step === "confirming" || staking.step === "unstaking" || staking.step === "claiming") && (
              <div className="bg-[#2563EB]/10 border border-[#2563EB]/30 rounded-2xl p-4 mb-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                <div className="text-white text-sm font-medium">Confirming on chain…</div>
              </div>
            )}

            {/* Success */}
            {isSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 mb-4 flex items-center justify-between">
                <div>
                  <div className="text-green-400 font-medium text-sm">
                    {tab === "stake" ? "Staked successfully!" : "Unstaked successfully!"}
                  </div>
                  {staking.txHash && (
                    <a
                      href={getExplorerUrl(staking.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#2563EB] flex items-center gap-1 mt-1 hover:underline cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" /> View transaction
                    </a>
                  )}
                </div>
                <button
                  onClick={() => { staking.reset(); setAmount(""); }}
                  className="text-xs text-white/50 hover:text-white cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}

            {/* Action button */}
            {!isSuccess && (
              <button
                onClick={tab === "stake" ? handleStake : handleUnstake}
                disabled={!amount || parseFloat(amount) <= 0 || staking.isProcessing}
                className="bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl transition-colors w-full text-base flex items-center justify-center gap-2 min-h-12 cursor-pointer"
                aria-label={`${tab === "stake" ? "Stake" : "Unstake"}${amount ? ` ${amount}` : ""} USDC`}
              >
                {staking.isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {staking.step === "approving" ? "Approving…" : "Processing…"}
                  </>
                ) : tab === "stake" ? (
                  `Stake${amount ? ` $${amount}` : ""} USDC`
                ) : (
                  `Unstake${amount ? ` $${amount}` : ""} USDC`
                )}
              </button>
            )}

            <p className="text-center text-white/30 text-xs mt-4">
              Staked USDC earns ~3–5% APY via Aave V3. Unstake any time.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
