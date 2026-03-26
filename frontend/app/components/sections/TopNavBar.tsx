"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { label: "Campaigns", href: "/", active: true },
  { label: "Transparency", href: "/dashboard", active: false },
  { label: "Impact", href: "/stake", active: false },
] as const;

export function TopNavBar() {
  return (
    <nav className="fixed top-0 w-full z-50 bg-surface/60 backdrop-blur-xl border-b border-outline-variant/10 h-20">
      <div className="flex justify-between items-center px-6 h-full max-w-[1440px] mx-auto">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tighter text-[#dfe2f3] font-headline"
          >
            FundBrave
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
