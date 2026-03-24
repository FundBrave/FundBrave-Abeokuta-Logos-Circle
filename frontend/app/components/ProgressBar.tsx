"use client";

import { useEffect, useRef } from "react";

interface ProgressBarProps {
  percent: number; // 0–100
  className?: string;
}

/**
 * Animated progress bar.
 * Uses a CSS custom property so the fill animation targets the correct width.
 */
export function ProgressBar({ percent, className = "" }: ProgressBarProps) {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fillRef.current) {
      fillRef.current.style.setProperty("--target-width", `${Math.min(percent, 100)}%`);
    }
  }, [percent]);

  return (
    <div
      className={`relative w-full h-3 rounded-full bg-white/10 overflow-hidden ${className}`}
    >
      {/* Track gradient glow */}
      <div
        ref={fillRef}
        className="h-full rounded-full progress-fill"
        style={{
          background: "linear-gradient(90deg, #2563EB, #7C3AED, #F97316)",
          width: `${Math.min(percent, 100)}%`,
          boxShadow: "0 0 12px rgba(37,99,235,0.5)",
        }}
      />
    </div>
  );
}
