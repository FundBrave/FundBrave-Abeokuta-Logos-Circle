"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { MobileDrawer } from "./MobileDrawer";

const NAV_LINKS = [
  { label: "Campaigns", href: "/" },
  { label: "Donate", href: "/donate" },
  { label: "Transparency", href: "/dashboard" },
  { label: "Impact", href: "/stake" },
] as const;

// Mobile drawer omits "Campaigns" — logo already links home
const MOBILE_LINKS = NAV_LINKS.filter((l) => l.href !== "/");

export function TopNavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // RainbowKit's ConnectButton renders differently server vs client.
  // Guard it with `mounted` to prevent hydration mismatch that hides the button.
  const [mounted, setMounted] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

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
    <>
      <nav
        ref={navRef}
        className="fixed top-0 w-full z-50 h-20"
        style={{
          backgroundColor:      scrolled || mobileOpen ? "rgba(10,14,26,0.85)" : "transparent",
          backdropFilter:        scrolled || mobileOpen ? "blur(20px)"          : "none",
          WebkitBackdropFilter:  scrolled || mobileOpen ? "blur(20px)"          : "none",
          borderBottom:          scrolled ? "1px solid rgba(67,70,85,0.15)" : "1px solid transparent",
          transition:            "background-color 300ms ease, backdrop-filter 300ms ease, border-color 300ms ease",
        }}
      >
        <div className="relative flex items-center px-4 md:px-6 lg:px-10 h-full max-w-[1440px] mx-auto">
          {/* Left: Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image
              src="/images/logo/Fundbrave_icon-gradient.png"
              alt="FundBrave"
              width={36}
              height={36}
              className="rounded-lg"
            />
            <span className="text-xl md:text-2xl font-bold tracking-tighter text-[#dfe2f3] font-headline">
              FundBrave
            </span>
          </Link>

          {/* Center: Desktop nav links */}
          <div className="hidden md:flex gap-6 font-medium tracking-tight absolute left-1/2 -translate-x-1/2">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative pb-1 transition-colors ${
                    isActive ? "text-[#dfe2f3]" : "text-[#dfe2f3]/60 hover:text-[#dfe2f3]"
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

          {/* Right: Wallet + Hamburger */}
          <div className="flex items-center gap-3 ml-auto">
            {mounted && (
              <ConnectButton.Custom>
                {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted: rbMounted }) => {
                  const connected = rbMounted && account && chain;
                  return (
                    <div aria-hidden={!rbMounted} style={!rbMounted ? { opacity: 0, pointerEvents: "none", userSelect: "none" } : undefined}>
                      {!connected ? (
                        <button
                          onClick={openConnectModal}
                          type="button"
                          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-on-primary transition-all hover:brightness-110 active:scale-95 md:px-4 md:text-sm"
                        >
                          <span className="material-symbols-outlined text-base leading-none">account_balance_wallet</span>
                          <span className="hidden sm:inline">Connect</span>
                          <span className="hidden md:inline"> Wallet</span>
                        </button>
                      ) : chain.unsupported ? (
                        <button
                          onClick={openChainModal}
                          type="button"
                          className="flex items-center gap-1.5 rounded-xl bg-red-500/20 px-3 py-2 text-xs font-bold text-red-400 hover:bg-red-500/30 md:px-4 md:text-sm"
                        >
                          <span className="material-symbols-outlined text-base leading-none">warning</span>
                          <span className="hidden sm:inline">Wrong Network</span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="hidden sm:flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1.5 text-xs font-medium hover:bg-surface-variant"
                          >
                            {chain.iconUrl && (
                              <img src={chain.iconUrl} alt={chain.name} className="h-4 w-4 rounded-full" />
                            )}
                            <span className="hidden md:inline">{chain.name}</span>
                          </button>
                          <button
                            onClick={openAccountModal}
                            type="button"
                            className="flex items-center gap-1.5 rounded-xl bg-surface-container px-3 py-2 text-xs font-bold hover:bg-surface-variant md:px-4 md:text-sm"
                          >
                            {account.ensAvatar ? (
                              <img src={account.ensAvatar} alt={account.displayName} className="h-5 w-5 rounded-full" />
                            ) : (
                              <span className="material-symbols-outlined text-base leading-none text-primary">account_circle</span>
                            )}
                            <span>{account.displayName}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            )}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Toggle menu"
            >
              <span className="material-symbols-outlined text-on-surface text-2xl">
                {mobileOpen ? "close" : "menu"}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <MobileDrawer
          links={MOBILE_LINKS}
          pathname={pathname}
          onClose={() => setMobileOpen(false)}
          topOffset="top-20"
        />
      )}
    </>
  );
}
