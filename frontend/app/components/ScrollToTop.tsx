"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Scrolls the window to the top whenever the route changes. */
export function ScrollToTop() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
