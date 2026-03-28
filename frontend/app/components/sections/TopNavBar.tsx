"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";

const NAV_LINKS = [
  { label: "Campaigns", href: "/" },
  { label: "Donate", href: "/donate" },
  { label: "Transparency", href: "/dashboard" },
  { label: "Impact", href: "/stake" },
] as const;

export function TopNavBar() {
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Entrance animation
  useGSAP(
    () => {
      if (!navRef.current) return;
      gsap.fromTo(
        navRef.current,
        { y: -20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: "power2.out", delay: 0.1 }
      );
    },
    { dependencies: [], scope: navRef }
  );

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const underline = e.currentTarget.querySelector(".nav-underline");
    if (underline) {
      gsap.to(underline, { scaleX: 1, duration: 0.3, ease: "power2.out", overwrite: true });
    }
  }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    const underline = e.currentTarget.querySelector(".nav-underline");
    if (underline) {
      gsap.to(underline, { scaleX: 0, duration: 0.3, ease: "power2.in", overwrite: true });
    }
  }, []);

  return (
    <nav
      ref={navRef}
      className="fixed top-0 w-full z-50 h-20"
      style={{
        backgroundColor:      scrolled ? "rgba(10,14,26,0.7)"            : "transparent",
        backdropFilter:        scrolled ? "blur(20px)"                    : "none",
        WebkitBackdropFilter:  scrolled ? "blur(20px)"                    : "none",
        borderBottom:          scrolled ? "1px solid rgba(67,70,85,0.15)" : "1px solid transparent",
        transition:            "background-color 300ms ease, backdrop-filter 300ms ease, border-color 300ms ease",
      }}
    >
      <div className="relative flex items-center px-6 lg:px-10 h-full max-w-[1440px] mx-auto">
        {/* Left: Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <Image
            src="/images/logo/Fundbrave_icon-gradient.png"
            alt="FundBrave"
            width={36}
            height={36}
            className="rounded-lg"
          />
          <span className="text-2xl font-bold tracking-tighter text-[#dfe2f3] font-headline">
            FundBrave
          </span>
        </Link>

        {/* Center: Nav links */}
        <div className="hidden md:flex gap-6 font-medium tracking-tight absolute left-1/2 -translate-x-1/2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="relative pb-1 text-[#dfe2f3]/60 hover:text-[#dfe2f3] transition-colors"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {link.label}
              <span className="nav-underline absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary-container to-secondary-container origin-left scale-x-0" />
            </Link>
          ))}
        </div>

        {/* Right: Wallet */}
        <div className="flex items-center gap-4 ml-auto">
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus="avatar"
          />
        </div>
      </div>
    </nav>
  );
}
