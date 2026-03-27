"use client";

import Link from "next/link";
import { useScrollReveal } from "../../hooks/useScrollReveal";

export function TransparencyCTA() {
  const ref = useScrollReveal<HTMLElement>({ y: 25, duration: 0.5 });

  return (
    <section ref={ref} className="py-12 flex flex-col items-center text-center space-y-8">
      <div className="space-y-2">
        <h3 className="font-headline text-3xl font-bold">
          Ready to contribute?
        </h3>
        <p className="text-on-surface-variant max-w-lg mx-auto">
          Your support directly empowers 15 women-led startups in Abeokuta with
          micro-grants and blockchain-verified business training.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-4 w-full justify-center max-w-md">
        <Link
          href="/donate"
          className="flex-1 bg-tertiary-container hover:bg-tertiary-container/80 text-on-tertiary-container py-4 rounded-xl font-black tracking-tight text-lg shadow-lg shadow-tertiary/10 transition-all active:scale-95 text-center"
        >
          Donate Now
        </Link>
        <Link
          href="/stake"
          className="flex-1 border-2 border-primary-container/40 hover:border-primary-container text-primary-fixed py-4 rounded-xl font-bold transition-all active:scale-95 text-center"
        >
          Stake to Support
        </Link>
      </div>
    </section>
  );
}
