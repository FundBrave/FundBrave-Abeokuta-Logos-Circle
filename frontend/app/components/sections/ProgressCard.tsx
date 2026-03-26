"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { animateCounter, animateSectionEntrance } from "../../lib/animations";
import { GlassCard } from "../ui/GlassCard";
import { useCampaignStats } from "../../hooks/useCampaignStats";

export function ProgressCard() {
  const stats = useCampaignStats();

  const raised = stats.totalRaisedFormatted;
  const goalMin = stats.goalMinFormatted;
  const goalMax = stats.goalMaxFormatted;
  const progressPercent = Math.round(stats.progressPercent);
  const donorCount = Number(stats.donorCount);
  const totalStaked = stats.totalStakedFormatted;
  const yieldGenerated = stats.totalYieldGeneratedFormatted;

  // Calculate days left from deadline
  const deadlineTs = Number(stats.deadline);
  const now = Math.floor(Date.now() / 1000);
  const daysLeft = deadlineTs > now ? Math.ceil((deadlineTs - now) / 86400) : 0;
  const deadlineDate = deadlineTs
    ? new Date(deadlineTs * 1000).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

  // Refs for animations
  const sectionRef = useRef<HTMLElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const totalRaisedRef = useRef<HTMLSpanElement>(null);
  const donorCountRef = useRef<HTMLParagraphElement>(null);
  const stakedTVLRef = useRef<HTMLParagraphElement>(null);
  const yieldRef = useRef<HTMLParagraphElement>(null);
  const goalProgressRef = useRef<HTMLParagraphElement>(null);
  // Raw numeric values for counters
  const totalRaisedNum = Number(stats.totalRaised) / 1e6;
  const totalStakedNum = Number(stats.totalStaked) / 1e6;
  const yieldNum = Number(stats.totalYieldGenerated) / 1e6;
  useGSAP(
    () => {
      if (!sectionRef.current) return;

      // Section entrance + right-side card stagger
      const tl = animateSectionEntrance(sectionRef.current, {
        header: ".progress-label",
      });

      // Right-side cards stagger
      tl.fromTo(
        sectionRef.current.querySelectorAll(".progress-right-card"),
        { x: 30, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.6, stagger: 0.15, ease: "power2.out" },
        0.5
      );

      // Progress bar fill
      if (progressBarRef.current && progressPercent > 0) {
        tl.fromTo(
          progressBarRef.current,
          { width: "0%" },
          {
            width: `${Math.min(progressPercent, 100)}%`,
            duration: 1.5,
            ease: "power2.out",
          },
          0.3
        );
      }

      // Counter animations — no guard, fires on every run where data > 0
      const counters = [
        { ref: totalRaisedRef, val: totalRaisedNum, opts: { prefix: "$", decimals: 2, duration: 1.5 } },
        { ref: donorCountRef, val: donorCount, opts: { duration: 1.0 } },
        { ref: stakedTVLRef, val: totalStakedNum, opts: { prefix: "$", decimals: 2 } },
        { ref: yieldRef, val: yieldNum, opts: { prefix: "$", decimals: 2 } },
        { ref: goalProgressRef, val: progressPercent, opts: { suffix: "%" } },
      ];

      counters.forEach(({ ref, val, opts }) => {
        if (ref.current && val > 0) {
          tl.add(animateCounter(ref.current, val, opts), 0.4);
        }
      });
    },
    {
      dependencies: [
        totalRaisedNum,
        donorCount,
        totalStakedNum,
        yieldNum,
        progressPercent,
      ],
      scope: sectionRef,
    }
  );

  return (
    <section ref={sectionRef} className="px-6 lg:px-20 -mt-24 relative z-30">
      <GlassCard className="p-8 md:p-12 max-w-[1440px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left: Financials & Progress */}
          <div className="lg:col-span-7">
            <div className="flex justify-between items-end mb-6">
              <div>
                <p className="progress-label text-on-surface-variant text-sm font-bold uppercase tracking-widest mb-2">
                  Total Raised
                </p>
                <h2 className="text-6xl md:text-7xl font-headline font-extrabold text-on-surface">
                  <span ref={totalRaisedRef}>{raised}</span>{" "}
                  <span className="text-2xl text-on-surface-variant/40 font-bold">
                    / {goalMin}–{goalMax}
                  </span>
                </h2>
                <p className="text-on-surface-variant text-xs mt-1 font-bold">
                  Target Currency: USDC
                </p>
              </div>
              <div className="hidden md:flex flex-col items-end">
                <div className="flex items-center gap-2 text-tertiary mb-1">
                  <span className="text-sm"><span className="material-symbols-outlined">schedule</span></span>
                  <span className="text-sm font-bold">
                    {daysLeft} Days Left
                  </span>
                </div>
                <p className="text-on-surface-variant text-xs">
                  Campaign ends {deadlineDate}
                </p>
              </div>
            </div>

            {/* Gradient Progress Bar */}
            <div className="relative w-full h-6 bg-surface-variant/30 rounded-full mb-10 overflow-hidden">
              <div
                ref={progressBarRef}
                className="absolute top-0 left-0 h-full progress-gradient-bg rounded-full shadow-[0_0_20px_rgba(124,58,237,0.3)]"
                style={{ width: "0%" }}
              />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div>
                <p className="text-on-surface-variant text-[10px] uppercase tracking-[0.15em] mb-2 font-bold">
                  Donors
                </p>
                <p ref={donorCountRef} className="text-3xl font-headline font-bold">
                  {donorCount}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant text-[10px] uppercase tracking-[0.15em] mb-2 font-bold">
                  Staked TVL
                </p>
                <p ref={stakedTVLRef} className="text-3xl font-headline font-bold">
                  {totalStaked}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant text-[10px] uppercase tracking-[0.15em] mb-2 font-bold">
                  Yield Generated
                </p>
                <p ref={yieldRef} className="text-3xl font-headline font-bold text-tertiary">
                  {yieldGenerated}
                </p>
              </div>
              <div>
                <p className="text-on-surface-variant text-[10px] uppercase tracking-[0.15em] mb-2 font-bold">
                  Goal Progress
                </p>
                <p ref={goalProgressRef} className="text-3xl font-headline font-bold">
                  {progressPercent}%
                </p>
              </div>
            </div>
          </div>

          {/* Right: Verification & Multiplier */}
          <div className="lg:col-span-5 flex flex-col gap-4 border-t lg:border-t-0 lg:border-l border-outline-variant/10 pt-12 lg:pt-0 lg:pl-12">
            {/* Impact Multiplier */}
            <div className="progress-right-card flex items-center justify-between p-6 bg-surface-container-low/40 rounded-2xl">
              <div>
                <h3 className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-1">
                  Impact Multiplier
                </h3>
                <p className="text-4xl font-headline font-extrabold">1.85x</p>
              </div>
              <div className="w-14 h-14 rounded-full bg-secondary-container/20 flex items-center justify-center">
                <span className="text-3xl text-secondary"><span className="material-symbols-outlined">trending_up</span></span>
              </div>
            </div>

            {/* Verification */}
            <div className="progress-right-card flex items-center justify-between p-6 bg-surface-container-low/40 rounded-2xl">
              <div>
                <h3 className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-1">
                  Verification
                </h3>
                <p className="text-2xl font-headline font-bold text-primary">
                  On-Chain Verified
                </p>
              </div>
              <div className="w-14 h-14 rounded-full bg-primary-container/20 flex items-center justify-center">
                <span className="text-3xl text-primary"><span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span></span>
              </div>
            </div>

            {/* Donor avatars */}
            <div className="progress-right-card p-6 bg-surface-container-low/20 rounded-2xl border border-outline-variant/10">
              <div className="flex -space-x-3 mb-4">
                {[2, 3, 4].map((i) => (
                  <img
                    key={i}
                    className="w-10 h-10 rounded-full border-2 border-[#111827] object-cover"
                    src={`/images/women-entrepreneurs-${i}.jpg`}
                    alt={`Donor ${i}`}
                  />
                ))}
                <div className="w-10 h-10 rounded-full border-2 border-[#111827] bg-surface-variant flex items-center justify-center text-[10px] font-bold">
                  +{Math.max(donorCount - 3, 0)}
                </div>
              </div>
              <p className="text-sm text-on-surface-variant font-medium leading-relaxed">
                Donors gain exclusive voting power for the next funding cycle.
              </p>
            </div>
          </div>
        </div>
      </GlassCard>
    </section>
  );
}
