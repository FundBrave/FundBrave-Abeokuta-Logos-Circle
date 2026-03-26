"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { animateSectionEntrance } from "../../lib/animations";

const STEPS = [
  {
    step: 1,
    title: "Deposit USDC",
    desc: "Your funds are securely deposited into Aave V3 liquidity pools.",
  },
  {
    step: 2,
    title: "Earn Yield",
    desc: "Smart contracts generate passive yield while you maintain full custody.",
  },
  {
    step: 3,
    title: "Split & Impact",
    desc: "Yield is automatically split between you and the fundraising goal.",
  },
];

export function StakeImpactLoop() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;
      animateSectionEntrance(sectionRef.current, {
        header: ".loop-title",
        children: ".step-item",
        stagger: 0.2,
      });
    },
    { dependencies: [] }
  );

  return (
    <section ref={sectionRef} className="space-y-8 pt-12">
      <h3 className="loop-title text-center font-headline text-lg font-bold opacity-60">
        The Impact Loop
      </h3>
      <div className="relative space-y-12">
        <div className="absolute left-[23px] top-6 bottom-6 w-px border-l-2 border-dotted border-outline-variant/30 hidden md:block" />
        {STEPS.map(({ step, title, desc }) => (
          <div
            key={step}
            className="step-item flex flex-col md:flex-row items-center gap-6 relative z-10"
          >
            <div className="w-12 h-12 rounded-full bg-surface-container border border-outline-variant/30 flex items-center justify-center text-primary font-bold shadow-lg shrink-0">
              {step}
            </div>
            <div className="flex-1 glass-card p-6 rounded-2xl border border-outline-variant/10 text-center md:text-left">
              <h4 className="font-bold mb-1">{title}</h4>
              <p className="text-sm text-on-surface-variant">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
