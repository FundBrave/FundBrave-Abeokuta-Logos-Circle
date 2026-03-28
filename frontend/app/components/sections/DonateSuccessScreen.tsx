"use client";

import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";
import { useCampaignStats } from "../../hooks/useCampaignStats";
import { getExplorerUrl } from "../../lib/contracts";
import { SubPageNav } from "./SubPageNav";
import { Footer } from "./Footer";

interface DonateSuccessScreenProps {
  txHash?: `0x${string}`;
  amount: string;
  token: string;
  onReset: () => void;
}

export function DonateSuccessScreen({
  txHash,
  amount,
  token,
  onReset,
}: DonateSuccessScreenProps) {
  const stats = useCampaignStats();
  const screenRef = useRef<HTMLDivElement>(null);
  const displayToken = token;
  const donorNumber = Number(stats.donorCount) || 0;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // Clipboard API may not be available
    }
  };

  const shareText = `I just donated $${amount} USDC to empower women entrepreneurs in Abeokuta through @FundBrave × Logos! 🧡`;
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  // GSAP entrance timeline
  useGSAP(
    () => {
      if (!screenRef.current) return;

      const tl = gsap.timeline({ defaults: { ease: "power2.out" } });

      // Checkmark elastic bounce
      tl.fromTo(
        ".success-check",
        { scale: 0 },
        { scale: 1, duration: 0.6, ease: "elastic.out(1, 0.5)" },
        0.2
      );

      // Title
      tl.fromTo(
        ".success-title",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5 },
        0.5
      );

      // Amount
      tl.fromTo(
        ".success-amount",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5 },
        0.7
      );

      // Subtitle
      tl.fromTo(
        ".success-subtitle",
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4 },
        0.9
      );

      // Impact flow nodes pop in
      tl.fromTo(
        ".success-flow-node",
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.4, stagger: 0.15, ease: "back.out(2)" },
        1.0
      );

      // Flow lines fade in
      tl.fromTo(
        ".success-flow-line",
        { scaleX: 0, opacity: 0 },
        { scaleX: 1, opacity: 1, duration: 0.3, stagger: 0.1 },
        1.1
      );

      // Social proof
      tl.fromTo(
        ".success-social",
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4 },
        1.3
      );

      // Actions
      tl.fromTo(
        ".success-actions",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5 },
        1.4
      );

      // Share section
      tl.fromTo(
        ".success-share",
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.4 },
        1.6
      );
    },
    { dependencies: [], scope: screenRef }
  );

  return (
    <div ref={screenRef} className="min-h-screen bg-surface-container-lowest text-on-surface font-body flex flex-col">
      <SubPageNav />

      <main className="flex-grow pt-24 pb-12 flex items-center justify-center relative overflow-hidden px-2">
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-tertiary-container/15 rounded-full blur-[60px]" />
          <div className="absolute top-20 left-20 w-3 h-3 rounded-full bg-tertiary opacity-40" />
          <div className="absolute bottom-40 right-10 w-4 h-4 rounded-full bg-secondary opacity-30" />
          <div className="absolute top-1/2 right-20 w-2 h-2 rounded-full bg-primary opacity-50" />
          <div className="absolute bottom-20 left-1/4 w-3 h-3 rounded-full bg-tertiary-container opacity-20" />
        </div>

        {/* Success Card */}
        <div className="relative w-full max-w-2xl">
          <div className="glass-card rounded-xl p-8 md:p-12 border border-outline-variant/15 shadow-2xl flex flex-col items-center text-center">
            {/* Animated Checkmark */}
            <div className="success-check mb-8 relative">
              <div className="w-24 h-24 rounded-full border-4 border-primary/20 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-blue-600 flex items-center justify-center shadow-[0_0_30px_rgba(34,197,94,0.4)]">
                  <span
                    className="material-symbols-outlined text-white text-5xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check
                  </span>
                </div>
              </div>
            </div>

            {/* Hero Text */}
            <h1 className="success-title font-headline text-3xl md:text-4xl font-extrabold tracking-tight mb-4">
              <span className="text-gradient-brand">
                You just made an impact
              </span>
            </h1>

            {/* Donation Amount */}
            <div className="success-amount mb-10">
              <p className="text-5xl md:text-7xl font-headline font-extrabold text-on-surface tracking-tighter">
                ${amount} {displayToken}
              </p>
              <p className="success-subtitle text-on-surface-variant text-sm mt-2 font-medium tracking-widest uppercase">
                Transaction Confirmed
              </p>
            </div>

            {/* Impact Flow Visualization */}
            <div className="w-full bg-surface-container-low rounded-xl p-6 mb-10 border border-outline-variant/10">
              <div className="flex items-center justify-between relative px-4">
                {/* Origin: Wallet */}
                <div className="success-flow-node flex flex-col items-center z-10">
                  <div className="w-12 h-12 bg-surface-container-high rounded-lg flex items-center justify-center border border-outline-variant/20 mb-2">
                    <span className="material-symbols-outlined text-primary">
                      account_balance_wallet
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-tighter">
                    You
                  </span>
                </div>

                {/* Pulse Line 1 */}
                <div className="success-flow-line flex-grow h-[2px] mx-2 relative overflow-hidden bg-outline-variant/20 origin-left">
                  <div className="absolute inset-0 bg-primary/40 animate-pulse" />
                </div>

                {/* Center: Campaign */}
                <div className="success-flow-node flex flex-col items-center z-10">
                  <div className="w-14 h-14 bg-primary-container rounded-full flex items-center justify-center shadow-lg mb-2">
                    <span
                      className="material-symbols-outlined text-on-primary-container text-2xl"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      favorite
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-primary uppercase tracking-tighter">
                    Campaign
                  </span>
                </div>

                {/* Pulse Line 2 */}
                <div className="success-flow-line flex-grow h-[2px] mx-2 relative overflow-hidden bg-outline-variant/20 origin-left">
                  <div className="absolute inset-0 bg-secondary/40 animate-pulse" />
                </div>

                {/* Destination: Women */}
                <div className="success-flow-node flex flex-col items-center z-10">
                  <div className="w-12 h-12 bg-surface-container-high rounded-lg flex items-center justify-center border border-outline-variant/20 mb-2">
                    <span className="material-symbols-outlined text-secondary">
                      groups
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-tighter">
                    20-30 Women
                  </span>
                </div>
              </div>
            </div>

            {/* Social Proof */}
            <p className="success-social text-on-surface/80 text-lg mb-8 max-w-md font-medium leading-relaxed">
              You&apos;re donor{" "}
              <span className="text-primary font-bold">
                #{donorNumber > 0 ? donorNumber : "—"}
              </span>
              .{" "}
              {donorNumber > 1
                ? `Join ${donorNumber - 1} others empowering women entrepreneurs through the Logos.`
                : "Be among the first to empower women entrepreneurs through the Logos."}
            </p>

            {/* Actions */}
            <div className="success-actions w-full space-y-4">
              <button
                onClick={onReset}
                className="w-full py-5 rounded-lg font-headline font-bold text-lg bg-tertiary-container text-on-tertiary-container hover:brightness-110 active:scale-[0.98] transition-all shadow-lg cursor-pointer"
              >
                Donate again
              </button>

              {txHash && (
                <a
                  href={getExplorerUrl(txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:text-primary-fixed-dim transition-colors text-sm font-medium"
                >
                  View on block explorer
                  <span className="material-symbols-outlined text-sm">
                    open_in_new
                  </span>
                </a>
              )}
            </div>

            <div className="h-12" />

            {/* Share Section */}
            <div className="success-share w-full">
              <p className="text-on-surface-variant text-xs font-semibold uppercase tracking-widest mb-4">
                Spread the word
              </p>
              <div className="flex justify-center gap-4">
                <a
                  href={twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-high hover:bg-surface-variant rounded-lg border border-outline-variant/10 transition-colors text-sm font-medium"
                >
                  <span className="material-symbols-outlined text-lg">
                    share
                  </span>
                  Twitter/X
                </a>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-high hover:bg-surface-variant rounded-lg border border-outline-variant/10 transition-colors text-sm font-medium cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">
                    link
                  </span>
                  Copy Link
                </button>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-surface-container-high hover:bg-surface-variant rounded-lg border border-outline-variant/10 transition-colors text-sm font-medium"
                >
                  <span className="material-symbols-outlined text-lg">
                    chat
                  </span>
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
