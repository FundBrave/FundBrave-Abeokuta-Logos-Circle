"use client";

import { useState } from "react";
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
import { getExplorerUrl, formatUSDC } from "../lib/contracts";

const STAKE_PRESETS = [50, 100, 250, 500];

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
    <div className="glass rounded-xl overflow-hidden mb-6">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-[#8762fa]" />
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
            <span className="bg-[#450cf0]/30 text-[#8762fa] px-2 py-0.5 rounded-full">
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
              className="w-full accent-[#450cf0] cursor-pointer"
            />

            {/* Visual split bar */}
            <div className="flex rounded-lg overflow-hidden h-3 mt-2">
              <div
                className="bg-[#450cf0] transition-all"
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
            <div className="bg-[#450cf0]/10 rounded-xl p-3">
              <div className="text-xl font-bold text-[#8762fa]">{causePct}%</div>
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
                  className={`text-xs rounded-lg px-3 py-1.5 border transition-all ${
                    causeBps === cause
                      ? "border-[#450cf0] bg-[#450cf0]/20 text-white"
                      : "border-white/10 bg-white/5 text-white/50 hover:text-white hover:bg-white/10"
                  }`}
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
            className="btn-primary w-full text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
  const { isConnected } = useAccount();
  const stats   = useCampaignStats();
  const staking = useStaking();

  const [tab, setTab]       = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");

  const parsedAmount = amount
    ? BigInt(Math.floor(parseFloat(amount) * 1_000_000))
    : 0n;

  const handleStake   = () => { if (parsedAmount) staking.stakeUSDC(parsedAmount); };
  const handleUnstake = () => { if (parsedAmount) staking.unstakeUSDC(parsedAmount); };
  const handleMaxUnstake = () => {
    if (staking.stakerPrincipal > 0n)
      setAmount((Number(staking.stakerPrincipal) / 1e6).toString());
  };

  const isSuccess = staking.step === "success";

  return (
    <div className="min-h-screen bg-[#09011a]">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <FundBraveLogo className="h-7" />
          </Link>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-[#8762fa]/20 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-[#8762fa]" />
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
            <div className="glass rounded-xl p-4">
              <div className="text-lg font-bold text-white">${staking.stakerPrincipalFormatted}</div>
              <div className="text-xs text-white/50 mt-1">Your stake</div>
            </div>
            <div className="glass rounded-xl p-4">
              <div className="text-lg font-bold text-green-400">${staking.pendingYieldFormatted}</div>
              <div className="text-xs text-white/50 mt-1">Your yield</div>
            </div>
            <div className="glass rounded-xl p-4">
              <div className="text-lg font-bold text-[#8762fa]">${staking.pendingCauseFormatted}</div>
              <div className="text-xs text-white/50 mt-1">For campaign</div>
            </div>
          </div>
        )}

        {/* Claim yield button */}
        {isConnected && (staking.pendingYield > 0n || staking.pendingCause > 0n) && (
          <div className="glass rounded-xl p-4 mb-6 flex items-center justify-between">
            <div>
              <div className="text-white font-medium text-sm">Ready to claim</div>
              <div className="text-xs mt-0.5 space-y-0.5">
                <span className="text-green-400">${staking.pendingYieldFormatted} to you</span>
                <span className="text-white/30"> · </span>
                <span className="text-[#8762fa]">${staking.pendingCauseFormatted} to campaign</span>
              </div>
            </div>
            <button
              onClick={staking.claimYield}
              disabled={staking.isProcessing}
              className="btn-secondary text-sm"
            >
              {staking.isProcessing && staking.step === "claiming" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : "Claim"}
            </button>
          </div>
        )}

        {/* Main action */}
        {!isConnected ? (
          <div className="glass rounded-xl p-8 text-center">
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
                  className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                    tab === t
                      ? "bg-[#450cf0] text-white"
                      : "text-white/50 hover:text-white"
                  }`}
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
                  <button onClick={handleMaxUnstake} className="text-xs text-[#8762fa] hover:underline">
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
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="any"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-medium focus:outline-none focus:border-[#8762fa] transition-colors pr-16"
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
                      className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white/60 hover:text-white transition-all"
                    >
                      ${p}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {staking.errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{staking.errorMsg}</p>
              </div>
            )}

            {/* Step indicators */}
            {staking.step === "approving" && (
              <div className="bg-[#450cf0]/10 border border-[#450cf0]/30 rounded-xl p-4 mb-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#8762fa] animate-spin" />
                <div>
                  <div className="text-white text-sm font-medium">Step 1/2: Approving USDC…</div>
                  <div className="text-white/50 text-xs">Confirm in your wallet</div>
                </div>
              </div>
            )}
            {staking.step === "staking" && (
              <div className="bg-[#450cf0]/10 border border-[#450cf0]/30 rounded-xl p-4 mb-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#8762fa] animate-spin" />
                <div>
                  <div className="text-white text-sm font-medium">Step 2/2: Staking…</div>
                  <div className="text-white/50 text-xs">Confirm in your wallet</div>
                </div>
              </div>
            )}
            {(staking.step === "confirming" || staking.step === "unstaking" || staking.step === "claiming") && (
              <div className="bg-[#450cf0]/10 border border-[#450cf0]/30 rounded-xl p-4 mb-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-[#8762fa] animate-spin" />
                <div className="text-white text-sm font-medium">Confirming on chain…</div>
              </div>
            )}

            {/* Success */}
            {isSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-4 flex items-center justify-between">
                <div>
                  <div className="text-green-400 font-medium text-sm">
                    {tab === "stake" ? "Staked successfully!" : "Unstaked successfully!"}
                  </div>
                  {staking.txHash && (
                    <a
                      href={getExplorerUrl(staking.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#8762fa] flex items-center gap-1 mt-1 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" /> View transaction
                    </a>
                  )}
                </div>
                <button
                  onClick={() => { staking.reset(); setAmount(""); }}
                  className="text-xs text-white/50 hover:text-white"
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
                className="btn-primary w-full text-base disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
