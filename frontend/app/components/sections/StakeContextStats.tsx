"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { animateSectionEntrance, animateCounter } from "../../lib/animations";

interface StakeContextStatsProps {
  totalStaked: string;
  totalStakedRaw: bigint;
  yieldGenerated: string;
  yieldGeneratedRaw: bigint;
  supporters: number;
}

export function StakeContextStats({
  totalStaked,
  totalStakedRaw,
  yieldGenerated,
  yieldGeneratedRaw,
  supporters,
}: StakeContextStatsProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const tvlRef = useRef<HTMLHeadingElement>(null);
  const impactRef = useRef<HTMLHeadingElement>(null);
  const supportersRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;

      const tl = animateSectionEntrance(sectionRef.current, {
        children: ".stat-card",
      });

      if (tvlRef.current) {
        tl.add(
          animateCounter(tvlRef.current, Number(totalStakedRaw) / 1e6, {
            prefix: "$",
            decimals: 2,
          }),
          0.3
        );
      }
      if (impactRef.current) {
        tl.add(
          animateCounter(impactRef.current, Number(yieldGeneratedRaw) / 1e6, {
            prefix: "$",
            decimals: 2,
          }),
          0.3
        );
      }
      if (supportersRef.current) {
        tl.add(
          animateCounter(supportersRef.current, supporters),
          0.5
        );
      }
    },
    { dependencies: [] }
  );

  return (
    <div ref={sectionRef} className="grid grid-cols-2 gap-4">
      <div className="stat-card bg-surface-container-low rounded-3xl p-6 border border-outline-variant/5">
        <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-2">
          Total Value Locked
        </p>
        <h3
          ref={tvlRef}
          className="text-2xl font-headline font-bold text-on-surface"
        >
          {totalStaked}
        </h3>
      </div>
      <div className="stat-card bg-surface-container-low rounded-3xl p-6 border border-outline-variant/5">
        <p className="text-on-surface-variant text-xs font-bold uppercase tracking-widest mb-2">
          Impact Generated
        </p>
        <h3
          ref={impactRef}
          className="text-2xl font-headline font-bold text-tertiary-fixed-dim"
        >
          {yieldGenerated}
        </h3>
        <div className="mt-2 flex items-center text-on-surface-variant text-xs">
          <span className="text-sm">
            <span className="material-symbols-outlined">groups</span>
          </span>
          <span ref={supportersRef} className="ml-1">
            {supporters}
          </span>
          <span className="ml-1">supporters</span>
        </div>
      </div>
    </div>
  );
}
