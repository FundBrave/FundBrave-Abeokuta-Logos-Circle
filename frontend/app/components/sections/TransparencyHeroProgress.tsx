"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { animateCounter } from "../../lib/animations";
import { useCampaignStats } from "../../hooks/useCampaignStats";
import { CAMPAIGN_GOAL_MIN_USDC } from "../../lib/contracts";

export function TransparencyHeroProgress() {
  const stats = useCampaignStats();

  const deadlineDate = stats.deadline
    ? new Date(Number(stats.deadline) * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const daysRemaining = stats.deadline
    ? Math.max(
        0,
        Math.ceil((Number(stats.deadline) - Date.now() / 1000) / 86400)
      )
    : 0;

  const sectionRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const raisedRef = useRef<HTMLSpanElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const totalRaisedNum = Number(stats.totalRaised) / 1e6;
  const progressPercent = stats.progressPercent;

  useGSAP(
    () => {
      if (!sectionRef.current) return;

      // Progress bar fill
      if (progressBarRef.current && progressPercent > 0) {
        gsap.fromTo(
          progressBarRef.current,
          { width: "0%" },
          {
            width: `${Math.min(progressPercent, 100)}%`,
            duration: 1.5,
            ease: "power2.out",
            delay: 0.3,
          }
        );
      }

      // Counters — no guard, fires on every run where data > 0
      if (raisedRef.current && totalRaisedNum > 0) {
        animateCounter(raisedRef.current, totalRaisedNum, {
          prefix: "$",
          decimals: 2,
          duration: 1.5,
        });
      }
      if (percentRef.current && progressPercent > 0) {
        animateCounter(percentRef.current, Math.round(progressPercent), {
          suffix: "%",
          duration: 1.2,
        });
      }
    },
    {
      dependencies: [totalRaisedNum, progressPercent],
      scope: sectionRef,
    }
  );

  return (
    <section ref={sectionRef} className="relative">
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary-container/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="glass-card rounded-3xl p-8 md:p-12 border border-outline-variant/10 glow-accent overflow-hidden relative">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 mb-10">
          <div className="space-y-2">
            <span className="text-tertiary font-label text-sm font-bold tracking-[0.2em] uppercase">
              Current Campaign
            </span>
            <h2 className="font-headline text-4xl md:text-5xl font-extrabold tracking-tight">
              Support Women Entrepreneurs{" "}
              <br />
              <span className="text-primary-fixed-dim">
                in Abeokuta, Nigeria
              </span>
            </h2>
          </div>
          <div className="text-right">
            <div className="text-sm text-on-surface-variant font-medium mb-1">
              Target Range
            </div>
            <div className="text-2xl font-headline font-bold text-white">
              ${stats.goalMinFormatted} &ndash; ${stats.goalMaxFormatted} USDC
            </div>
          </div>
        </div>

        {/* Amount & Progress */}
        <div className="space-y-6">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
              <span ref={raisedRef} className="text-5xl font-headline font-black gradient-text">
                ${stats.totalRaisedFormatted}
              </span>
              <span className="text-on-surface-variant block font-medium">
                raised of ${stats.goalMaxFormatted} USDC
              </span>
            </div>
            <div className="text-right hidden sm:block">
              <span ref={percentRef} className="text-2xl font-headline font-bold text-secondary">
                {progressPercent.toFixed(0)}%
              </span>
              <span className="block text-xs text-on-surface-variant uppercase tracking-widest">
                Funded
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative h-4 w-full bg-surface-container-high rounded-full overflow-hidden">
            <div
              ref={progressBarRef}
              className="progress-gradient-bg h-full rounded-full"
              style={{ width: "0%" }}
            />
            <div
              className="absolute top-0 h-full w-0.5 bg-white/30"
              style={{
                left: `${(CAMPAIGN_GOAL_MIN_USDC / 2500) * 100}%`,
              }}
              title="Minimum Goal"
            />
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center">
                <span className="material-symbols-outlined text-tertiary text-xl">
                  event
                </span>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
                  Deadline
                </p>
                <p className="text-sm font-semibold">{deadlineDate}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-xl">
                  schedule
                </span>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
                  Time Remaining
                </p>
                <p className="text-sm font-semibold">
                  {stats.isActive
                    ? `${daysRemaining} days left`
                    : "Campaign ended"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary text-xl">
                  flag
                </span>
              </div>
              <div>
                <p className="text-xs text-on-surface-variant uppercase font-bold tracking-wider">
                  Min. Threshold
                </p>
                <p className="text-sm font-semibold">
                  ${CAMPAIGN_GOAL_MIN_USDC.toLocaleString()} USDC{" "}
                  {stats.minGoalReached && "(Met)"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
