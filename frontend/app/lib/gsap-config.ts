"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TextPlugin } from "gsap/TextPlugin";

gsap.registerPlugin(ScrollTrigger, TextPlugin);

// Respect prefers-reduced-motion at the GSAP level
if (typeof window !== "undefined") {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

  const applyMotionPreference = (reduced: boolean) => {
    gsap.globalTimeline.timeScale(reduced ? 0 : 1);
  };

  applyMotionPreference(mql.matches);
  mql.addEventListener("change", (e) => applyMotionPreference(e.matches));
}

export { gsap, ScrollTrigger, TextPlugin };
