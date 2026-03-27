"use client";

import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { animateSectionEntrance } from "../../lib/animations";
import { RecentDonations } from "../RecentDonations";

export function ActivityFeed() {
  const sectionRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!sectionRef.current) return;
      animateSectionEntrance(sectionRef.current, {
        header: ".activity-header",
        children: ".activity-feed-wrapper",
      });
    },
    { dependencies: [] }
  );

  return (
    <section ref={sectionRef} className="py-32 bg-surface-container-low/30 border-t border-outline-variant/10">
      <div className="max-w-[1440px] mx-auto px-2 lg:px-20">
        <div className="activity-header flex flex-col md:flex-row justify-between items-center mb-16 gap-4">
          <h3 className="text-3xl font-headline font-extrabold flex items-center gap-4">
            <span className="text-4xl text-tertiary">
              <span className="material-symbols-outlined">pulse_alert</span>
            </span>
            Recent Activity
          </h3>
          <Link
            href="/dashboard"
            className="text-on-surface-variant hover:text-primary font-bold transition-all text-lg flex items-center gap-2"
          >
            View all on-chain transactions{" "}
            <span className="text-xl"><span className="material-symbols-outlined">arrow_right_alt</span></span>
          </Link>
        </div>

        <div className="activity-feed-wrapper">
          <RecentDonations />
        </div>
      </div>
    </section>
  );
}
