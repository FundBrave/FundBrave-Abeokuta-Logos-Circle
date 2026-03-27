"use client";

import { useState, useEffect } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useStaking } from "../hooks/useStaking";
import { useCampaignStats } from "../hooks/useCampaignStats";
import { TARGET_CHAIN_ID, TARGET_CHAIN } from "../lib/contracts";
import { SubPageNav } from "../components/sections/SubPageNav";
import { StakePageHeader } from "../components/sections/StakePageHeader";
import { StakePositionCard } from "../components/sections/StakePositionCard";
import { StakeSplitConfigurator } from "../components/sections/StakeSplitConfigurator";
import { StakeTerminal } from "../components/sections/StakeTerminal";
import { StakeTransactionBanner } from "../components/sections/StakeTransactionBanner";
import { StakeContextStats } from "../components/sections/StakeContextStats";
import { StakeImpactLoop } from "../components/sections/StakeImpactLoop";

export default function StakePage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const stats = useCampaignStats();
  const staking = useStaking();

  const [tab, setTab] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");

  const isOnWrongChain = isConnected && !!chain && chain.id !== (TARGET_CHAIN_ID as number);

  // Deadline urgency
  const deadlineSec = Number(stats.deadline);
  const nowSec      = Math.floor(Date.now() / 1000);
  const daysLeft    = deadlineSec > 0 ? Math.max(0, Math.ceil((deadlineSec - nowSec) / 86400)) : null;
  const deadlineUrgency =
    daysLeft === null ? null
    : daysLeft <= 3  ? "critical"
    : daysLeft <= 7  ? "urgent"
    : daysLeft <= 30 ? "warning"
    : "notice";

  // Reset state on disconnect or wallet switch
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

  const handleStake = () => {
    if (parsedAmount) staking.stakeUSDC(parsedAmount);
  };
  const handleUnstake = () => {
    if (parsedAmount) staking.unstakeUSDC(parsedAmount);
  };
  const handleMaxUnstake = () => {
    if (staking.stakerPrincipal > 0n)
      setAmount((Number(staking.stakerPrincipal) / 1e6).toString());
  };

  const deadlineBannerStyles: Record<string, string> = {
    notice:   "bg-blue-500/10 border-blue-500/30 text-blue-300",
    warning:  "bg-amber-500/10 border-amber-500/30 text-amber-300",
    urgent:   "bg-orange-500/10 border-orange-500/30 text-orange-300",
    critical: "bg-red-500/10  border-red-500/30  text-red-300",
  };

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-body">
      {/* Floating background glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-container opacity-[0.03] blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-secondary-container opacity-[0.05] blur-[100px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed top-[40%] right-[10%] w-[20%] h-[20%] bg-tertiary-container opacity-[0.02] blur-[80px] rounded-full -z-10 pointer-events-none" />

      <SubPageNav />

      <main className="pt-28 pb-32 px-4 max-w-2xl mx-auto space-y-10">
        <StakePageHeader />

        {/* Wrong-chain guard */}
        {isOnWrongChain && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400">warning</span>
              <p className="text-amber-300 text-sm font-medium">
                Your wallet is on <strong>{chain?.name}</strong>. Switch to{" "}
                <strong>{TARGET_CHAIN.name}</strong> to stake.
              </p>
            </div>
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN_ID as number })}
              disabled={isSwitching}
              className="shrink-0 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-4 py-1.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50"
            >
              {isSwitching ? "Switching…" : "Switch Network"}
            </button>
          </div>
        )}

        {/* Deadline banner */}
        {daysLeft !== null && deadlineUrgency ? (
          <div className={`p-4 rounded-2xl border flex items-center gap-3 ${deadlineBannerStyles[deadlineUrgency]}`}>
            <span className="material-symbols-outlined">schedule</span>
            <p className="text-sm font-medium">
              {deadlineUrgency === "critical"
                ? `⚠️ Campaign ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}! Claim your yield now or it will be locked.`
                : deadlineUrgency === "urgent"
                ? `Campaign ends in ${daysLeft} days. Claim yield before the deadline.`
                : deadlineUrgency === "warning"
                ? `${daysLeft} days left — remember to claim your yield before the campaign closes.`
                : `Campaign closes in ${daysLeft} days. Unstake and claim yield any time before then.`}
            </p>
          </div>
        ) : (
          <div className={`p-4 rounded-2xl border flex items-center gap-3 ${deadlineBannerStyles["notice"]}`}>
            <span className="material-symbols-outlined">schedule</span>
            <p className="text-sm font-medium">
              Remember to claim your yield before the campaign deadline. Unclaimed yield cannot be withdrawn after the campaign closes.
            </p>
          </div>
        )}

        <StakeTransactionBanner
          step={staking.step}
          errorMsg={staking.errorMsg ?? undefined}
        />

        <StakePositionCard
          stakerPrincipal={staking.stakerPrincipal}
          stakerPrincipalFormatted={staking.stakerPrincipalFormatted}
          pendingYieldFormatted={staking.pendingYieldFormatted}
          pendingCauseFormatted={staking.pendingCauseFormatted}
          pendingYield={staking.pendingYield}
          pendingCause={staking.pendingCause}
          isProcessing={staking.isProcessing}
          step={staking.step}
          onClaimYield={staking.claimYield}
          onCompoundYield={staking.compoundYield}
        />

        <StakeSplitConfigurator
          currentCauseBps={staking.causeShareBps}
          onSave={staking.saveSplit}
          isSaving={staking.step === "settingsplit"}
        />

        <StakeTerminal
          isConnected={isConnected}
          tab={tab}
          setTab={setTab}
          amount={amount}
          setAmount={setAmount}
          parsedAmount={parsedAmount}
          onStake={handleStake}
          onUnstake={handleUnstake}
          onMaxUnstake={handleMaxUnstake}
          staking={staking}
        />

        <StakeContextStats
          totalStaked={stats.totalStakedFormatted}
          totalStakedRaw={stats.totalStaked}
          yieldGenerated={stats.totalYieldGeneratedFormatted}
          yieldGeneratedRaw={stats.totalYieldGenerated}
          supporters={Number(stats.donorCount)}
        />

        <StakeImpactLoop />
      </main>
    </div>
  );
}
