"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { animateSectionEntrance } from "../../lib/animations";

const FLOWS = [
  {
    icon: "volunteer_activism",
    iconBg: "bg-primary-container/20",
    iconColor: "text-primary",
    dotColor: "bg-primary",
    title: "Direct Donations",
    steps: ["Donor Wallet", "Campaign Contract", "Multisig Treasury"],
    description: "100% of donations flow directly to the community treasury, secured by 2-of-3 multisig.",
  },
  {
    icon: "account_balance",
    iconBg: "bg-secondary-container/20",
    iconColor: "text-secondary",
    dotColor: "bg-secondary",
    title: "Yield Staking",
    steps: ["Staker", "Aave V3 Vault", "79% Campaign / 19% You / 2% Platform"],
    description: "Staked USDC earns yield in Aave. Yield splits automatically based on your chosen ratio.",
  },
  {
    icon: "public",
    iconBg: "bg-tertiary-container/20",
    iconColor: "text-tertiary",
    dotColor: "bg-tertiary",
    title: "Cross-Chain",
    steps: ["Any Chain", "LayerZero Bridge", "Campaign Contract"],
    description: "Donate from Ethereum, Polygon, Arbitrum, or Optimism — bridged seamlessly via LayerZero.",
  },
] as const;

export function TransparencyFundFlow() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;
      animateSectionEntrance(sectionRef.current, {
        header: ".flow-header",
        children: ".flow-card",
        stagger: 0.15,
      });
    },
    { dependencies: [], scope: sectionRef }
  );

  return (
    <section ref={sectionRef} className="space-y-6">
      <div className="flow-header flex items-center gap-3 px-1">
        <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center border border-outline-variant/10">
          <span className="material-symbols-outlined text-on-surface-variant">
            account_tree
          </span>
        </div>
        <div>
          <h2 className="font-headline text-xl font-bold">Fund Flow</h2>
          <p className="text-on-surface-variant text-xs">
            Where your money goes — fully on-chain
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {FLOWS.map((flow) => (
          <div
            key={flow.title}
            className="flow-card glass-card rounded-2xl p-6 space-y-4"
          >
            {/* Header */}
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl ${flow.iconBg} flex items-center justify-center`}
              >
                <span
                  className={`material-symbols-outlined ${flow.iconColor} text-xl`}
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {flow.icon}
                </span>
              </div>
              <h3 className="font-headline font-bold text-on-surface">
                {flow.title}
              </h3>
            </div>

            {/* Flow steps with dotted line + pulse dot */}
            <div className="space-y-0">
              {flow.steps.map((step, i) => (
                <div key={step} className="flex items-stretch gap-3">
                  {/* Vertical connector */}
                  <div className="flex flex-col items-center w-5 shrink-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${flow.dotColor} shrink-0 mt-1.5`}
                    />
                    {i < flow.steps.length - 1 && (
                      <div className="relative flex-1 w-px min-h-[24px]">
                        <div className="absolute inset-0 border-l-2 border-dotted border-outline-variant/30" />
                        {/* Animated pulse dot */}
                        <div
                          className={`absolute w-1.5 h-1.5 rounded-full ${flow.dotColor} flow-dot`}
                          style={{
                            left: "50%",
                            transform: "translateX(-50%)",
                            animationDelay: `${i * 0.8}s`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  {/* Step label */}
                  <div className="py-1">
                    <span
                      className={`text-sm font-medium ${
                        i === 0
                          ? "text-on-surface"
                          : i === flow.steps.length - 1
                          ? flow.iconColor
                          : "text-on-surface-variant"
                      }`}
                    >
                      {step}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Description */}
            <p className="text-on-surface-variant text-xs leading-relaxed pt-2 border-t border-outline-variant/10">
              {flow.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
