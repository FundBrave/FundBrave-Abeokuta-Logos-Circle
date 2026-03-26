"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { animateSectionEntrance } from "../../lib/animations";
import { RecentDonations } from "../RecentDonations";

export function TransparencyActivityFeed() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;
      animateSectionEntrance(sectionRef.current, {
        header: ".feed-header",
        children: ".feed-content",
      });
    },
    { dependencies: [], scope: sectionRef }
  );

  return (
    <div ref={sectionRef} className="glass-card rounded-2xl border border-outline-variant/10 overflow-hidden">
      <div className="feed-header p-6 border-b border-outline-variant/5 bg-white/5 flex justify-between items-center">
        <h3 className="font-headline text-xl font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary text-2xl">
            history
          </span>
          Recent Activity
        </h3>
        <span className="text-xs font-bold text-primary tracking-widest uppercase">
          Live Feed
        </span>
      </div>
      <div className="feed-content p-6">
        <RecentDonations />
      </div>
    </div>
  );
}
