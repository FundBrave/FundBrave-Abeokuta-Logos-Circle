"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { animateSectionEntrance } from "../../lib/animations";

const ACCENT = {
  from: "#2563EB",
  to: "#06B6D4",
  glow: "rgba(37,99,235,0.25)",
  iconBg: "rgba(37,99,235,0.15)",
  iconColor: "#60A5FA",
  border: "linear-gradient(135deg,#2563EB,#06B6D4)",
};

const STATS = [
  {
    value: "20–30",
    label: "Women to Fund",
    sublabel: "entrepreneurs in Abeokuta",
    icon: "group",
    ...ACCENT,
  },
  {
    value: "3",
    label: "Education Platforms",
    sublabel: "Coursera · Udemy · AltSchool",
    icon: "school",
    ...ACCENT,
  },
  {
    value: "$2K",
    label: "Campaign Goal",
    sublabel: "100% USDC on-chain",
    icon: "target",
    ...ACCENT,
  },
  {
    value: "100%",
    label: "On-Chain Transparency",
    sublabel: "every tx publicly verifiable",
    icon: "verified_user",
    ...ACCENT,
  },
] as const;

export function StatsBar() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;
      animateSectionEntrance(sectionRef.current, {
        children: ".stat-item",
        stagger: 0.12,
      });
    },
    { dependencies: [] }
  );

  return (
    <section
      ref={sectionRef}
      className="relative py-24 overflow-hidden border-y border-outline-variant/10"
      style={{ background: "linear-gradient(180deg,#0c1120 0%,#090d18 100%)" }}
    >
      {/* Background ambient glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/4 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[120px] opacity-30"
          style={{ background: "radial-gradient(circle,#2563EB 0%,transparent 70%)" }}
        />
        <div
          className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{ background: "radial-gradient(circle,#7C3AED 0%,transparent 70%)" }}
        />
      </div>

      <div className="relative max-w-[1440px] mx-auto px-2 lg:px-20">
        {/* Section eyebrow */}
        <div className="flex items-center gap-4 mb-14 justify-center">
          <span className="h-px flex-1 max-w-[80px] bg-gradient-to-r from-transparent to-white/10" />
          <span className="text-[10px] font-bold tracking-[0.25em] uppercase text-on-surface-variant/50">
            Campaign at a Glance
          </span>
          <span className="h-px flex-1 max-w-[80px] bg-gradient-to-l from-transparent to-white/10" />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="stat-item rounded-2xl p-[1px]"
              style={{ background: stat.border }}
            >
              <div
                className="h-full rounded-2xl p-6 md:p-8 flex flex-col items-center text-center gap-4"
                style={{
                  background: `radial-gradient(ellipse at 50% 0%, ${stat.glow} 0%, transparent 65%), #0d1120`,
                }}
              >

                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                  style={{
                    background: stat.iconBg,
                    color: stat.iconColor,
                    boxShadow: `0 0 20px ${stat.glow}`,
                  }}
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {stat.icon}
                  </span>
                </div>

                {/* Value */}
                <p
                  className="text-3xl md:text-4xl font-headline font-black tracking-tighter leading-none"
                  style={{
                    background: `linear-gradient(135deg,${stat.from},${stat.to})`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {stat.value}
                </p>

                {/* Label */}
                <div>
                  <p className="text-on-surface text-sm font-bold leading-tight mb-1">
                    {stat.label}
                  </p>
                  <p className="text-on-surface-variant/50 text-[11px] leading-tight">
                    {stat.sublabel}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
