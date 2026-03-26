"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useStaking } from "../hooks/useStaking";
import { useCampaignStats } from "../hooks/useCampaignStats";
import { SubPageNav } from "../components/sections/SubPageNav";
import { StakePageHeader } from "../components/sections/StakePageHeader";
import { StakePositionCard } from "../components/sections/StakePositionCard";
import { StakeSplitConfigurator } from "../components/sections/StakeSplitConfigurator";
import { StakeTerminal } from "../components/sections/StakeTerminal";
import { StakeTransactionBanner } from "../components/sections/StakeTransactionBanner";
import { StakeContextStats } from "../components/sections/StakeContextStats";
import { StakeImpactLoop } from "../components/sections/StakeImpactLoop";

export default function StakePage() {
  const { address, isConnected } = useAccount();
  const stats = useCampaignStats();
  const staking = useStaking();

  const [tab, setTab] = useState<"stake" | "unstake">("stake");
  const [amount, setAmount] = useState("");

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

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-body">
      {/* Floating background glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-container opacity-[0.03] blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-[10%] right-[-5%] w-[35%] h-[35%] bg-secondary-container opacity-[0.05] blur-[100px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed top-[40%] right-[10%] w-[20%] h-[20%] bg-tertiary-container opacity-[0.02] blur-[80px] rounded-full -z-10 pointer-events-none" />

      <SubPageNav />

      <main className="pt-28 pb-32 px-4 max-w-2xl mx-auto space-y-10">
        <StakePageHeader />

        <StakeTransactionBanner
          step={staking.step}
          errorMsg={staking.errorMsg ?? undefined}
        />

        <StakePositionCard
          stakerPrincipalFormatted={staking.stakerPrincipalFormatted}
          pendingYieldFormatted={staking.pendingYieldFormatted}
          pendingCauseFormatted={staking.pendingCauseFormatted}
          pendingYield={staking.pendingYield}
          pendingCause={staking.pendingCause}
          isProcessing={staking.isProcessing}
          step={staking.step}
          onClaimYield={staking.claimYield}
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
