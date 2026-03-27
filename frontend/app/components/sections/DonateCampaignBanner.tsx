"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import { useCampaignStats } from "../../hooks/useCampaignStats";

export function DonateCampaignBanner() {
  const stats = useCampaignStats();
  const bannerRef = useScrollReveal<HTMLDivElement>({ y: 20, duration: 0.5 });
  const barRef = useRef<HTMLDivElement>(null);

  const progressPercent = stats.progressPercent;

  useGSAP(
    () => {
      if (!barRef.current || progressPercent <= 0) return;
      gsap.fromTo(
        barRef.current,
        { width: "0%" },
        { width: `${Math.min(progressPercent, 100)}%`, duration: 1.2, ease: "power2.out", delay: 0.3 }
      );
    },
    { dependencies: [progressPercent] }
  );

  return (
    <div ref={bannerRef} className="glass-card rounded-xl p-4 flex flex-col gap-3 shadow-sm border border-outline-variant/10">
      <div className="flex justify-between items-center text-sm font-medium">
        <span className="text-on-surface-variant">
          Campaign raised{" "}
          <span className="text-on-surface">${stats.totalRaisedFormatted}</span>{" "}
          of ${stats.goalMaxFormatted}
        </span>
        <span className="text-tertiary">
          {progressPercent.toFixed(0)}% Funded
        </span>
      </div>
      <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
        <div
          ref={barRef}
          className="h-full bg-gradient-to-r from-primary-container via-secondary-container to-tertiary"
          style={{ width: "0%" }}
        />
      </div>
    </div>
  );
}
