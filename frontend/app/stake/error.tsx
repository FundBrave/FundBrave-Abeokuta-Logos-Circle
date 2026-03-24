"use client";

/**
 * FE-M6: Route-level error boundary for the /stake page.
 * Next.js App Router automatically renders this when an error is thrown
 * inside the stake route segment, isolating it from the rest of the app.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function StakeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[StakeError]", error);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center px-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Unable to load staking page</h2>
        <p className="text-white/60 text-sm mb-6">
          Something went wrong while loading this page. Please try again.
        </p>
        <div className="flex gap-3">
          <Link href="/" className="btn-secondary flex-1 text-sm text-center">
            Back to campaign
          </Link>
          <button onClick={reset} className="btn-primary flex-1 text-sm">
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
