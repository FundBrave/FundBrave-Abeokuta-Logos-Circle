"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "fb-privacy-accepted";

export function PrivacyBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if not already accepted. Delay 800ms so page renders first.
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (!accepted) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "true");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Privacy notice"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 animate-slide-up"
    >
      <div className="max-w-4xl mx-auto glass rounded-2xl border border-white/10 px-5 py-4 md:px-7 md:py-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-2xl shadow-black/60">

        {/* Icon */}
        <div className="w-9 h-9 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[#2563EB] text-lg">shield</span>
        </div>

        {/* Text */}
        <p className="flex-1 text-sm text-white/60 leading-relaxed">
          By clicking{" "}
          <span className="text-white font-semibold">"Accept"</span>
          , you agree to our Privacy Notice and the responsible use of information
          related to your visit.
        </p>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto">
          <Link
            href="/privacy"
            className="text-sm text-[#2563EB] hover:text-blue-400 transition-colors font-medium whitespace-nowrap underline underline-offset-2"
          >
            Privacy Notice
          </Link>
          <button
            onClick={accept}
            className="px-5 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-95 transition-all text-white text-sm font-semibold whitespace-nowrap"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
