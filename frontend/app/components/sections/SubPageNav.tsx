"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { gsap } from "../../lib/gsap-config";
import { MobileDrawer } from "./MobileDrawer";

const DEFAULT_DRAWER_LINKS = [
  { label: "Donate", href: "/donate" },
  { label: "Stake", href: "/stake" },
  { label: "Transparency", href: "/dashboard" },
];

interface NavLink {
  label: string;
  href: string;
}

interface SubPageNavProps {
  backHref?: string;
  title?: string;
  navLinks?: NavLink[];
}

export function SubPageNav({ backHref = "/", title, navLinks }: SubPageNavProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  // Build drawer links: merge passed navLinks with defaults, deduplicate by href
  const drawerLinks = (() => {
    if (!navLinks) return [];
    const seen = new Set<string>();
    const merged: { label: string; href: string }[] = [];
    for (const link of [...navLinks, ...DEFAULT_DRAWER_LINKS]) {
      if (!seen.has(link.href)) {
        seen.add(link.href);
        merged.push({ label: link.label, href: link.href });
      }
    }
    return merged;
  })();

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
    <>
      <header className="fixed top-0 w-full z-50 bg-[#313442]/60 backdrop-blur-xl bg-gradient-to-b from-[#171b28] to-transparent shadow-[0_32px_32px_rgba(223,226,243,0.08)]">
        <div className="flex justify-between items-center px-4 md:px-6 lg:px-10 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3 md:gap-4">
            <Link
              href={backHref}
              className="hover:bg-[#313442]/80 transition-all duration-300 active:scale-95 p-2 rounded-full min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <span className="text-on-surface">
                <span className="material-symbols-outlined">arrow_back</span>
              </span>
            </Link>
            {title ? (
              <h1 className="font-headline font-extrabold tracking-tight text-primary text-base md:text-lg">
                {title}
              </h1>
            ) : (
              <div className="flex items-center gap-2">
                <Image
                  src="/images/logo/Fundbrave_icon-gradient.png"
                  alt="FundBrave"
                  width={30}
                  height={30}
                  className="rounded-lg"
                />
                <span className="text-on-surface-variant opacity-70 font-medium text-lg">&times;</span>
                <Image
                  src="/images/logo/logos-logo.png"
                  alt="Logos"
                  width={24}
                  height={24}
                  className="rounded-full opacity-80"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 md:gap-6">
            {navLinks && (
              <div className="hidden md:flex items-center gap-8">
                {navLinks.map((link) => {
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`relative font-headline text-sm font-semibold py-1 ${
                        isActive
                          ? "text-primary"
                          : "text-on-surface-variant hover:text-white transition-colors"
                      }`}
                      onMouseEnter={isActive ? undefined : handleMouseEnter}
                      onMouseLeave={isActive ? undefined : handleMouseLeave}
                    >
                      {link.label}
                      <span
                        className={`nav-underline absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary-container to-secondary-container origin-left ${
                          isActive ? "scale-x-100" : "scale-x-0"
                        }`}
                      />
                    </Link>
                  );
                })}
              </div>
            )}
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus="avatar"
            />
            {navLinks && (
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Toggle menu"
              >
                <span className="material-symbols-outlined text-on-surface text-2xl">
                  {mobileOpen ? "close" : "menu"}
                </span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {navLinks && mobileOpen && (
        <MobileDrawer
          links={drawerLinks}
          pathname={pathname}
          onClose={() => setMobileOpen(false)}
          topOffset="top-[72px]"
        />
      )}
    </>
  );
}
