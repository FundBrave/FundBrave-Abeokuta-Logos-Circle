"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { label: "Campaigns", href: "/", active: true },
  { label: "Transparency", href: "/dashboard", active: false },
  { label: "Impact", href: "/stake", active: false },
] as const;

export function TopNavBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 w-full z-50 h-20"
      style={{
        backgroundColor:    scrolled ? "rgba(10,14,26,0.7)"               : "transparent",
        backdropFilter:     scrolled ? "blur(20px)"                        : "none",
        WebkitBackdropFilter: scrolled ? "blur(20px)"                     : "none",
        borderBottom:       scrolled ? "1px solid rgba(67,70,85,0.15)"    : "1px solid transparent",
        transition:         "background-color 300ms ease, backdrop-filter 300ms ease, border-color 300ms ease",
      }}
    >
      <div className="flex justify-between items-center px-2 h-full max-w-[1440px] mx-auto">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
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
          <div className="hidden md:flex gap-6 font-medium tracking-tight">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  link.active
                    ? "text-[#dfe2f3] border-b-2 border-[#2563EB] pb-1"
                    : "text-[#dfe2f3]/60 hover:text-[#dfe2f3] transition-all"
                }
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
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
