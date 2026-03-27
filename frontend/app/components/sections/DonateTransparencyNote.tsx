"use client";

export function DonateTransparencyNote() {
  return (
    <div className="p-6 rounded-xl bg-surface-container-high/30 border border-outline-variant/10 space-y-3">
      <div className="flex gap-3 text-tertiary">
        <span className="material-symbols-outlined">security</span>
        <h4 className="font-bold text-sm">Transparency Promise</h4>
      </div>
      <p className="text-xs text-on-surface-variant/80 leading-relaxed">
        This campaign is part of the{" "}
        <span className="text-on-surface">Logos</span> humanitarian
        initiative. 100% of the funds (less network fees) are distributed
        directly to the entrepreneurs. Each transaction is recorded on the
        public ledger for full accountability.
      </p>
    </div>
  );
}
