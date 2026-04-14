"use client";

import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { animateSectionEntrance } from "../../lib/animations";
import { TokenIcon } from "../ui/TokenIcon";

const CHAINS = [
  { label: "Ethereum", icon: "ETH" },
  { label: "Polygon",  icon: "POLYGON" },
  { label: "Arbitrum", icon: "ARBITRUM" },
  { label: "Optimism", icon: "OPTIMISM" },
  { label: "Bitcoin",  icon: "BTC" },
  { label: "Solana",   icon: "SOL" },
];

export function ImpactModels() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;
      animateSectionEntrance(sectionRef.current, {
        header: ".impact-header",
        children: ".impact-card",
        stagger: 0.2,
      });
      sectionRef.current.querySelectorAll(".impact-card").forEach((card) => {
        gsap.fromTo(
          card.querySelectorAll(".card-anim"),
          { y: 20, opacity: 0 },
          {
            y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: "power2.out",
            scrollTrigger: { trigger: card, start: "top 85%", toggleActions: "play none none none" },
          }
        );
      });
    },
    { dependencies: [], scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="py-32 px-2 lg:px-20 max-w-[1440px] mx-auto">
      <div className="impact-header mb-16 text-center lg:text-left">
        <h2 className="text-4xl md:text-5xl font-headline font-extrabold mb-4 tracking-tight">
          Select Your <span className="gradient-text">Impact Model</span>
        </h2>
        <p className="text-on-surface-variant text-lg max-w-2xl">
          Two ways to fund women&apos;s education in Abeokuta — pick what works for you.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Card 1: Direct Donate */}
        <div className="impact-card group relative rounded-[2rem] p-[1px] bg-gradient-to-br from-primary/60 via-primary/20 to-transparent hover:from-primary hover:via-primary/40 transition-all duration-500 shadow-[0_0_60px_-20px_rgba(37,99,235,0.4)]">
          <div className="relative h-full rounded-[calc(2rem-1px)] bg-[#0c1220] p-8 md:p-10 flex flex-col overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-primary/20 transition-colors duration-700" />

            <div className="card-anim mb-8 w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.3)] group-hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] transition-shadow duration-500">
              <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                volunteer_activism
              </span>
            </div>

            <div className="card-anim flex items-center gap-3 mb-3">
              <h3 className="text-2xl font-headline font-extrabold text-on-surface">Direct Donate</h3>
              <span className="text-[10px] font-bold tracking-widest uppercase bg-primary/15 text-primary px-2 py-0.5 rounded-full border border-primary/25">
                Instant
              </span>
            </div>

            <p className="card-anim text-on-surface-variant text-sm leading-relaxed mb-6">
              Send USDC, ETH, DAI, or WETH directly to the campaign vault.
              100% of funds go immediately to platform registrations for women entrepreneurs.
            </p>

            <ul className="card-anim space-y-3 mb-8">
              {["Immediate capital injection", "Zero management fees", "On-chain donation receipt"].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-primary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  {f}
                </li>
              ))}
            </ul>

            <div className="card-anim mb-8">
              <p className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant/50 mb-3">Multichain Support</p>
              <div className="flex flex-wrap gap-2">
                {CHAINS.map((c) => (
                  <span key={c.label} title={c.label} className="flex items-center gap-1.5 text-xs bg-surface-container-high/60 border border-outline-variant/15 text-on-surface-variant px-2.5 py-1 rounded-full">
                    <TokenIcon symbol={c.icon} size={14} />
                    {c.label}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-on-surface-variant/40 mt-2">
                Cross-chain via Circle CCTP · BTC &amp; SOL monitored by watcher
              </p>
            </div>

            <Link href="/donate" className="card-anim mt-auto block w-full py-4 rounded-2xl font-extrabold text-base text-center text-white bg-gradient-to-r from-primary to-blue-500 hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_8px_30px_rgba(37,99,235,0.35)] group-hover:shadow-[0_12px_40px_rgba(37,99,235,0.5)]">
              Donate Assets →
            </Link>
          </div>
        </div>

        {/* Card 2: Stake & Earn */}
        <div className="impact-card group relative rounded-[2rem] p-[1px] bg-gradient-to-br from-secondary/60 via-secondary/20 to-transparent hover:from-secondary hover:via-secondary/40 transition-all duration-500 shadow-[0_0_60px_-20px_rgba(124,58,237,0.4)]">
          <div className="relative h-full rounded-[calc(2rem-1px)] bg-[#0e0c1a] p-8 md:p-10 flex flex-col overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-secondary/10 rounded-full blur-[80px] pointer-events-none group-hover:bg-secondary/20 transition-colors duration-700" />

            <div className="card-anim mb-8 w-16 h-16 rounded-2xl bg-secondary/15 border border-secondary/30 flex items-center justify-center shadow-[0_0_20px_rgba(124,58,237,0.3)] group-hover:shadow-[0_0_30px_rgba(124,58,237,0.5)] transition-shadow duration-500">
              <span className="material-symbols-outlined text-secondary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                account_balance
              </span>
            </div>

            <div className="card-anim flex items-center gap-3 mb-3">
              <h3 className="text-2xl font-headline font-extrabold text-on-surface">Stake &amp; Earn</h3>
              <span className="text-[10px] font-bold tracking-widest uppercase bg-secondary/15 text-secondary px-2 py-0.5 rounded-full border border-secondary/25">
                Variable APY
              </span>
            </div>

            <p className="card-anim text-on-surface-variant text-sm leading-relaxed mb-6">
              Stake USDC into Aave V3 and keep your principal. The yield you earn
              is automatically split between you and the campaign — your money works
              while you hold it.
            </p>

            <ul className="card-anim space-y-3 mb-8">
              {["Keep your initial capital", "Passive impact generation", "Adjustable yield split ratio"].map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-secondary text-base" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  {f}
                </li>
              ))}
            </ul>

            <div className="card-anim mb-8 flex items-center gap-3 bg-secondary/8 border border-secondary/20 rounded-xl px-4 py-3">
              <span className="material-symbols-outlined text-secondary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>shield</span>
              <div>
                <p className="text-xs font-bold text-secondary">Powered by Aave V3</p>
                <p className="text-[11px] text-on-surface-variant/60">Battle-tested DeFi yield on Base</p>
              </div>
            </div>

            <Link href="/stake" className="card-anim mt-auto block w-full py-4 rounded-2xl font-extrabold text-base text-center text-white bg-gradient-to-r from-secondary to-violet-500 hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_8px_30px_rgba(124,58,237,0.35)] group-hover:shadow-[0_12px_40px_rgba(124,58,237,0.5)]">
              Start Staking →
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
