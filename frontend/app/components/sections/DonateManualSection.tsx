"use client";

import { ManualDonations } from "../ManualDonations";

export function DonateManualSection() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 px-2">
        <div className="h-px flex-1 bg-outline-variant/20" />
        <span className="text-xs font-bold tracking-[0.2em] text-on-surface-variant/40 uppercase">
          Manual Contributions
        </span>
        <div className="h-px flex-1 bg-outline-variant/20" />
      </div>
      <ManualDonations />
    </div>
  );
}
