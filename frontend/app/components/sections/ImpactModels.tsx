"use client";

import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { animateSectionEntrance } from "../../lib/animations";

const MODELS = [
  {
    icon: "volunteer_activism",
    iconColor: "text-primary",
    title: "Direct Donate",
    description:
      "Send USDC, ETH, DAI, or USDT directly to the community vault. 100% of funds are deployed immediately to platform registrations.",
    features: ["Immediate capital injection", "Zero management fees"],
    checkColor: "text-primary",
    buttonClass: "bg-primary text-white shadow-lg shadow-primary/20",
    href: "/donate",
    cardClass: "card-radial-blue border-primary/20 hover:border-primary",
    buttonLabel: "Donate Assets",
  },
  {
    icon: "account_balance",
    iconColor: "text-secondary",
    title: "Stake & Earn",
    description:
      "Stake your ETH or USDC in the Ethereal Vault. Keep your principal, while the yield funds education for local entrepreneurs.",
    features: ["Keep your initial capital", "Passive impact generation"],
    checkColor: "text-secondary",
    buttonClass: "bg-secondary text-on-secondary shadow-lg shadow-secondary/20",
    href: "/stake",
    cardClass: "card-radial-purple border-secondary/20 hover:border-secondary",
    buttonLabel: "Start Staking",
  },
] as const;

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

      // Stagger inner elements of each impact card
      sectionRef.current.querySelectorAll(".impact-card").forEach((card) => {
        gsap.from(card.querySelectorAll(".card-anim"), {
          y: 25,
          opacity: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: "power2.out",
          scrollTrigger: {
            trigger: card,
            start: "top 85%",
            toggleActions: "play none none none",
          },
        });
      });
    },
    { dependencies: [] }
  );

  return (
    <section ref={sectionRef} className="py-32 px-6 lg:px-20 max-w-[1440px] mx-auto">
      <div className="impact-header mb-20 text-center lg:text-left">
        <h2 className="text-4xl md:text-5xl font-headline font-extrabold mb-6 tracking-tight">
          Select Your <span className="gradient-text">Impact Model</span>
        </h2>
        <p className="text-on-surface-variant text-lg max-w-2xl">
          Choose how you want to support Abeokuta&apos;s growth with these
          decentralized funding options.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {MODELS.map((model) => (
          <div
            key={model.title}
            className={`impact-card rounded-[2.5rem] p-10 md:p-14 border transition-colors duration-500 group ${model.cardClass}`}
          >
            <div className={`card-anim mb-10 text-6xl ${model.iconColor} group-hover:scale-110 transition-transform duration-500`}>
              <span
                className="material-symbols-outlined"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {model.icon}
              </span>
            </div>

            <h3 className="card-anim text-3xl font-headline font-bold mb-6">
              {model.title}
            </h3>

            <p className="card-anim text-on-surface-variant text-lg mb-12 leading-relaxed h-28">
              {model.description}
            </p>

            <ul className="card-anim space-y-6 mb-12">
              {model.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-4 text-on-surface-variant font-medium"
                >
                  <span className={`text-xl ${model.checkColor}`}>
                    <span className="material-symbols-outlined">
                      check_circle
                    </span>
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href={model.href}
              className={`card-anim block w-full py-5 rounded-2xl font-extrabold text-xl text-center active:scale-[0.98] transition-all ${model.buttonClass}`}
            >
              {model.buttonLabel}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
