"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { GradientButton } from "../ui/GradientButton";

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current || !bgRef.current) return;

      // Parallax — desktop only (disabled under 768px for performance)
      // gsap.matchMedia() replaces the removed ScrollTrigger.matchMedia() API (GSAP 3.12+)
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px)", () => {
        gsap.to(bgRef.current!, {
          yPercent: 20,
          ease: "none",
          scrollTrigger: {
            trigger: sectionRef.current!,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });
      });

      // Text cascade — plays on load
      // Using fromTo() so both start/end states are explicit (immune to React cleanup/revert)
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(".hero-badge",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5 },
        0.2
      );
      tl.fromTo(".hero-line",
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.15 },
        0.4
      );
      tl.fromTo(".hero-subtitle",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 },
        0.9
      );
      tl.fromTo(".hero-cta",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, stagger: 0.12 },
        1.1
      );
    },
    { dependencies: [], scope: sectionRef }
  );

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[85vh] flex items-center overflow-hidden pt-36 pb-40"
    >
      {/* Background image with gradient overlay */}
      <div ref={bgRef} className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0e1a]/40 via-[#0a0e1a]/70 to-[#0a0e1a] z-10" />
        <Image
          src="/images/women-entrepreneurs-1.jpg"
          alt="Female entrepreneurs in Abeokuta workshop"
          fill
          className="object-cover"
          priority
        />
      </div>

      <div className="relative z-20 w-full max-w-[1440px] mx-auto px-2 lg:px-20">
        <div className="max-w-4xl">
        {/* Campaign badge */}
        <div className="hero-badge flex items-center gap-3 mb-6">
          <span className="bg-surface-container-high text-on-surface-variant px-4 py-1 rounded-full text-[10px] font-bold tracking-[0.2em] uppercase">
            Ongoing Campaign
          </span>
          <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
        </div>

        {/* Headline */}
        <h1 className="text-5xl md:text-8xl font-headline font-extrabold tracking-tighter text-on-surface mb-8 leading-[0.95]">
          <span className="hero-line inline-block">Empowering</span>
          <br />
          <span className="hero-line inline-block gradient-text">
            Abeokuta
          </span>
          <br />
          <span className="hero-line inline-block">Entrepreneurs</span>
        </h1>

        {/* Subheading */}
        <p className="hero-subtitle text-lg md:text-xl text-on-surface-variant max-w-2xl mb-12 leading-relaxed font-medium">
          Fund online education for 20–30 women entrepreneurs in Abeokuta
          through Logos, powered by FundBrave.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-6">
          <Link href="/donate" className="w-full sm:w-auto">
            <GradientButton size="lg" className="hero-cta w-full sm:w-auto">
              Support the Mission
            </GradientButton>
          </Link>
          <Link href="/dashboard" className="w-full sm:w-auto">
            <GradientButton variant="outline" size="lg" className="hero-cta w-full sm:w-auto">
              View Transparency Report
            </GradientButton>
          </Link>
        </div>
        </div>
      </div>
    </section>
  );
}
