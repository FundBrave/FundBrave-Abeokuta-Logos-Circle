"use client";

import { useState, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
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
  RefreshCw,
  Clock,
  Bell,
} from "lucide-react";
import { useStaking } from "../hooks/useStaking";
import { useCampaignStats } from "../hooks/useCampaignStats";
import { FundBraveLogo } from "../components/FundBraveLogo";
import { getExplorerUrl, formatUSDC, STAKE_PRESETS, TARGET_CHAIN, TARGET_CHAIN_ID } from "../lib/contracts";

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
  const { address, isConnected, chain } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const isOnWrongChain = isConnected && !!chain && chain.id !== (TARGET_CHAIN_ID as number);
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

  // Deadline banner logic
  const deadlineSec   = Number(stats.deadline);          // 0 if not loaded
  const nowSec        = Math.floor(Date.now() / 1000);
  const daysLeft      = deadlineSec > 0 ? Math.max(0, Math.ceil((deadlineSec - nowSec) / 86400)) : null;
  const hasYield      = staking.pendingYield > 0n || staking.pendingCause > 0n;
  const deadlineUrgency =
    daysLeft === null            ? null :
    daysLeft <= 3                ? "critical" :
    daysLeft <= 7                ? "urgent" :
    daysLeft <= 30               ? "warning" :
                                   "notice";

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

        {/* Deadline / yield-claim reminder banner */}
        {isConnected && staking.stakerPrincipal > 0n && deadlineUrgency && (
          <div className={`rounded-2xl p-4 mb-6 flex items-start gap-3 border ${
            deadlineUrgency === "critical"
              ? "bg-red-500/10 border-red-500/30"
              : deadlineUrgency === "urgent"
              ? "bg-amber-500/10 border-amber-500/30"
              : deadlineUrgency === "warning"
              ? "bg-amber-500/10 border-amber-500/20"
              : "bg-[#2563EB]/10 border-[#2563EB]/20"
          }`}>
            <Bell className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
              deadlineUrgency === "critical" ? "text-red-400" :
              deadlineUrgency === "urgent"   ? "text-amber-400" :
              deadlineUrgency === "warning"  ? "text-amber-400" :
              "text-[#2563EB]"
            }`} />
            <div>
              {deadlineUrgency === "critical" && (
                <>
                  <p className="text-red-400 font-semibold text-sm">
                    {daysLeft === 0 ? "Campaign ends today!" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left — claim now!`}
                  </p>
                  <p className="text-white/60 text-xs mt-0.5">
                    Yield not claimed before the deadline is lost. Claim or compound immediately.
                  </p>
                </>
              )}
              {deadlineUrgency === "urgent" && (
                <>
                  <p className="text-amber-400 font-semibold text-sm">
                    {daysLeft} days until campaign ends
                  </p>
                  <p className="text-white/60 text-xs mt-0.5">
                    {hasYield
                      ? "You have unclaimed yield — claim it before the deadline so your contribution reaches the campaign."
                      : "Remember to claim any yield you earn before the campaign deadline."}
                  </p>
                </>
              )}
              {deadlineUrgency === "warning" && (
                <>
                  <p className="text-amber-300 font-medium text-sm">
                    {daysLeft} days remaining
                  </p>
                  <p className="text-white/60 text-xs mt-0.5">
                    Yield is only credited to the campaign when you claim or compound. Don&apos;t forget before the deadline.
                  </p>
                </>
              )}
              {deadlineUrgency === "notice" && (
                <p className="text-[#2563EB] text-sm">
                  Your yield must be claimed or compounded before the campaign ends ({daysLeft} days away) to reach the campaign.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Claim / Compound yield — always visible when staked so buttons are discoverable */}
        {isConnected && staking.stakerPrincipal > 0n && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3">
            <div>
              <div className="text-white font-medium text-sm">
                {hasYield ? "Ready to claim" : "Yield"}
              </div>
              <div className="text-xs mt-0.5 space-y-0.5">
                {hasYield ? (
                  <>
                    <span className="text-green-400">${staking.pendingYieldFormatted} to you</span>
                    <span className="text-white/30"> · </span>
                    <span className="text-[#2563EB]">${staking.pendingCauseFormatted} to campaign</span>
                  </>
                ) : (
                  <span className="text-white/40">Yield accrues as Aave earns interest · harvested daily</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={staking.compoundYield}
                disabled={staking.isProcessing || !hasYield}
                title="Re-stake your yield portion to compound returns"
                className="border border-green-500/50 bg-green-500/10 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed text-green-400 font-medium py-2 px-3 rounded-xl transition-colors text-sm cursor-pointer min-h-10"
                aria-label="Compound yield"
              >
                {staking.isProcessing && staking.step === "compounding" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : <RefreshCw className="w-4 h-4" />}
              </button>
              <button
                onClick={staking.claimYield}
                disabled={staking.isProcessing || !hasYield}
                className="border border-[#2563EB] bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-[#2563EB] font-medium py-2 px-3 rounded-xl transition-colors text-sm cursor-pointer min-h-10"
                aria-label="Claim yield"
              >
                {staking.isProcessing && staking.step === "claiming" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : "Claim"}
              </button>
            </div>
          </div>
        )}

        {/* SC-C1: Escrowed cause yield panel */}
        {isConnected && staking.escapedCauseYield > 0n && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <Clock className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-amber-300 text-sm font-medium">
                  ${staking.escapedCauseFormatted} cause yield escrowed
                </div>
                <div className="text-amber-300/60 text-xs mt-0.5">
                  The campaign was unavailable when you last claimed. This yield is held
                  safely and can be sent to the campaign once it resumes.
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={staking.retryCauseCredit}
                    disabled={staking.isProcessing}
                    className="flex items-center gap-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                    aria-label="Retry sending escrowed yield to campaign"
                  >
                    {staking.isProcessing && staking.step === "retrying" ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : <RefreshCw className="w-3 h-3" />}
                    Retry to campaign
                  </button>

                  {staking.canRescue && (
                    <button
                      onClick={staking.rescueEscrowedCause}
                      disabled={staking.isProcessing}
                      className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/20 text-white/60 px-3 py-2 rounded-xl transition-colors cursor-pointer disabled:opacity-40"
                      aria-label="Rescue escrowed yield to your wallet (30-day window)"
                    >
                      {staking.isProcessing && staking.step === "rescuing" ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : null}
                      Rescue to wallet
                    </button>
                  )}
                </div>
              </div>
            </div>
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
        ) : isOnWrongChain ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-6 text-center">
            <p className="text-amber-400 font-medium mb-1">Wrong network</p>
            <p className="text-white/50 text-sm mb-4">
              Staking requires {TARGET_CHAIN.name}. Your wallet is on {chain?.name ?? "an unknown network"}.
            </p>
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID as number })}
              disabled={isSwitching}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-medium py-2 px-6 rounded-xl transition-colors cursor-pointer"
            >
              {isSwitching ? "Switching…" : `Switch to ${TARGET_CHAIN.name}`}
            </button>
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
                <div className="mt-2 text-xs text-white/40">
                  Your principal is returned in full when you unstake.
                  Yield earned will split: <span className="text-[#2563EB]">{staking.causeSharePct} → campaign</span>
                  {" · "}
                  <span className="text-green-400">{staking.stakerSharePct} → you</span>
                  {" · "}
                  <span>2% platform</span>
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
                  <div className="text-white/50 text-xs">A wallet prompt will appear shortly</div>
                </div>
              </div>
            )}
            {(staking.step === "confirming" || staking.step === "unstaking" || staking.step === "claiming" || staking.step === "compounding" || staking.step === "retrying" || staking.step === "rescuing") && (
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

            {/* How to withdraw — shown once the user has an active stake */}
            {staking.stakerPrincipal > 0n && (
              <div className="mt-6 bg-[#111827] border border-white/10 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="w-4 h-4 text-white/40" />
                  <span className="text-sm font-medium text-white/70">How to withdraw</span>
                </div>
                <ol className="space-y-3">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#2563EB]/20 text-[#2563EB] text-xs flex items-center justify-center font-bold">1</span>
                    <div>
                      <p className="text-white/80 text-sm font-medium">Get your principal back</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        Switch to the <strong className="text-white/60">Unstake</strong> tab above, enter the amount you want to withdraw, and confirm the transaction. Your USDC returns to your wallet immediately — no waiting period.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-500/20 text-green-400 text-xs flex items-center justify-center font-bold">2</span>
                    <div>
                      <p className="text-white/80 text-sm font-medium">Claim your yield</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        Once yield accrues, use the <strong className="text-white/60">Claim</strong> button in the Yield panel above. Your share goes straight to your wallet; the campaign&apos;s share is credited automatically. Or use <strong className="text-white/60">Compound</strong> to re-stake your portion for more yield.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white/10 text-white/40 text-xs flex items-center justify-center font-bold">!</span>
                    <div>
                      <p className="text-white/80 text-sm font-medium">Claim before the deadline</p>
                      <p className="text-white/40 text-xs mt-0.5">
                        Yield is only sent to the campaign when you claim or compound. If you don&apos;t claim before the campaign ends, your yield portion won&apos;t reach the campaign.
                      </p>
                    </div>
                  </li>
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
