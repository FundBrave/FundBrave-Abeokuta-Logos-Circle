"use client";

import { useScrollReveal } from "../../hooks/useScrollReveal";

export function StakePageHeader() {
  const ref = useScrollReveal<HTMLElement>({ y: 20, duration: 0.5 });

  return (
    <section ref={ref} className="text-center space-y-4">
      <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary-container to-secondary-container rounded-2xl flex items-center justify-center shadow-xl shadow-primary-container/10">
        <span className="text-3xl text-white">
          <span className="material-symbols-outlined">shield</span>
        </span>
      </div>
      <div className="space-y-2">
        <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">
          Stake to Support
        </h1>
        <p className="text-on-surface-variant text-lg max-w-md mx-auto leading-relaxed">
          Earn Aave yield while funding women&apos;s education.{" "}
          <span className="text-primary">You choose the split.</span>
        </p>
      </div>
    </section>
  );
}
