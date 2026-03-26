"use client";

import { useCampaignStats } from "../../hooks/useCampaignStats";

export function DonateCampaignBanner() {
  const stats = useCampaignStats();

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-3 shadow-sm border border-outline-variant/10">
      <div className="flex justify-between items-center text-sm font-medium">
        <span className="text-on-surface-variant">
          Campaign raised{" "}
          <span className="text-on-surface">${stats.totalRaisedFormatted}</span>{" "}
          of ${stats.goalMaxFormatted}
        </span>
        <span className="text-tertiary">
          {stats.progressPercent.toFixed(0)}% Funded
        </span>
      </div>
      <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-container via-secondary-container to-tertiary transition-all duration-1000"
          style={{ width: `${Math.min(stats.progressPercent, 100)}%` }}
        />
      </div>
    </div>
  );
}
