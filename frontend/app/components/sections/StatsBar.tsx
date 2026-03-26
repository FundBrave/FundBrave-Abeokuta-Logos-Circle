"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { animateSectionEntrance } from "../../lib/animations";
import { StatItem } from "../ui/StatItem";

const STATS = [
  { value: "20–30", label: "Women to Fund" },
  { value: "3", label: "Education Platforms", sublabel: "(Coursera, Udemy, AltSchool)" },
  { value: "$1K–$2.5K", label: "Campaign Goal" },
  { value: "100%", label: "On-Chain Transparency" },
] as const;

export function StatsBar() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;
      animateSectionEntrance(sectionRef.current, {
        children: ".stat-item",
        stagger: 0.1,
      });
    },
    { dependencies: [] }
  );

  return (
    <section ref={sectionRef} className="bg-surface-container-low py-24 border-y border-outline-variant/10">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12 text-center">
          {STATS.map((stat) => (
            <StatItem
              key={stat.label}
              value={stat.value}
              label={stat.label}
              sublabel={"sublabel" in stat ? stat.sublabel : undefined}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
