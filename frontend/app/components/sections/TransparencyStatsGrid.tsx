"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { animateSectionEntrance, animateCounter } from "../../lib/animations";
import { useCampaignStats } from "../../hooks/useCampaignStats";

const STAT_CARDS = [
  {
    icon: "group",
    label: "Unique Donors",
    colorBg: "bg-primary-container/20",
    iconColor: "text-primary-fixed",
    hoverBorder: "hover:border-primary/30",
    arrowHover: "group-hover:text-primary",
    key: "donors" as const,
  },
  {
    icon: "payments",
    label: "Total Raised",
    colorBg: "bg-secondary-container/20",
    iconColor: "text-secondary",
    hoverBorder: "hover:border-secondary/30",
    arrowHover: "group-hover:text-secondary",
    key: "raised" as const,
  },
  {
    icon: "account_balance",
    label: "Total Staked",
    colorBg: "bg-tertiary-container/20",
    iconColor: "text-tertiary",
    hoverBorder: "hover:border-tertiary/30",
    arrowHover: "group-hover:text-tertiary",
    key: "staked" as const,
  },
  {
    icon: "trending_up",
    label: "Yield Generated",
    colorBg: "bg-primary/20",
    iconColor: "text-primary-fixed-dim",
    hoverBorder: "hover:border-primary/30",
    arrowHover: "group-hover:text-primary",
    key: "yield" as const,
  },
];

export function TransparencyStatsGrid({ className = "" }: { className?: string }) {
  const stats = useCampaignStats();
  const gridRef = useRef<HTMLDivElement>(null);
  const valueRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const rawValues = {
    donors: Number(stats.donorCount),
    raised: Number(stats.totalRaised) / 1e6,
    staked: Number(stats.totalStaked) / 1e6,
    yield: Number(stats.totalYieldGenerated) / 1e6,
  };

  const formatted: Record<string, string> = {
    donors: stats.donorCount.toString(),
    raised: `$${stats.totalRaisedFormatted}`,
    staked: `$${stats.totalStakedFormatted}`,
    yield: `$${stats.totalYieldGeneratedFormatted}`,
  };

  useGSAP(
    () => {
      if (!gridRef.current) return;

      // Card stagger entrance
      animateSectionEntrance(gridRef.current, {
        children: ".stat-card",
        stagger: 0.12,
      });

      // Counter animations — no guard, fires on every run where data > 0
      const counterConfigs = [
        { idx: 0, val: rawValues.donors, opts: {} },
        { idx: 1, val: rawValues.raised, opts: { prefix: "$", decimals: 2 } },
        { idx: 2, val: rawValues.staked, opts: { prefix: "$", decimals: 2 } },
        { idx: 3, val: rawValues.yield, opts: { prefix: "$", decimals: 2 } },
      ];

      counterConfigs.forEach(({ idx, val, opts }) => {
        const el = valueRefs.current[idx];
        if (el && val > 0) {
          animateCounter(el, val, { duration: 1.2, ...opts });
        }
      });
    },
    {
      dependencies: [rawValues.donors, rawValues.raised, rawValues.staked, rawValues.yield],
      scope: gridRef,
    }
  );

  return (
    <div ref={gridRef} className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${className}`}>
      {STAT_CARDS.map((card, i) => (
        <div
          key={card.key}
          className={`stat-card glass-card p-6 rounded-2xl border border-outline-variant/10 group ${card.hoverBorder} transition-colors`}
        >
          <div className="flex justify-between items-start mb-4">
            <div
              className={`w-12 h-12 rounded-xl ${card.colorBg} flex items-center justify-center`}
            >
              <span className={`material-symbols-outlined ${card.iconColor} text-2xl`}>
                {card.icon}
              </span>
            </div>
            <span
              className={`material-symbols-outlined text-on-surface-variant/30 ${card.arrowHover} transition-colors text-xl`}
            >
              north_east
            </span>
          </div>
          <div className="space-y-1">
            <h3
              ref={(el) => { valueRefs.current[i] = el; }}
              className="text-3xl font-headline font-bold"
            >
              {formatted[card.key]}
            </h3>
            <p className="text-on-surface-variant text-sm font-medium">
              {card.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
