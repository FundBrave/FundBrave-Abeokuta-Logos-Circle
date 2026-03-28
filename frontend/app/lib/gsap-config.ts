"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { TextPlugin } from "gsap/TextPlugin";

gsap.registerPlugin(ScrollTrigger, TextPlugin);

// Respect prefers-reduced-motion at the GSAP level
if (typeof window !== "undefined") {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");

  const applyMotionPreference = (reduced: boolean) => {
    // timeScale(0) freezes animations at their initial state (opacity:0, scale:0),
    // making content permanently invisible. Use a very high value instead so
    // all animations complete instantly — content is visible, motion is skipped.
    gsap.globalTimeline.timeScale(reduced ? 999 : 1);
  };

  applyMotionPreference(mql.matches);
  mql.addEventListener("change", (e) => applyMotionPreference(e.matches));
}

export { gsap, ScrollTrigger, TextPlugin };
