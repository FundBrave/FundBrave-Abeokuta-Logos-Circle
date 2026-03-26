"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "../lib/gsap-config";

interface ScrollRevealOptions {
  /** Vertical offset to animate from (default: 30) */
  y?: number;
  /** Delay before animation starts in seconds (default: 0) */
  delay?: number;
  /** Animation duration in seconds (default: 0.6) */
  duration?: number;
  /** ScrollTrigger start position (default: "top 85%") */
  start?: string;
}

/**
 * Lightweight scroll-reveal hook. Attach the returned ref to any element
 * and it will fade up into view when it enters the viewport.
 *
 * @example
 * const ref = useScrollReveal<HTMLDivElement>({ y: 40, duration: 0.8 });
 * return <div ref={ref}>Hello</div>;
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options?: ScrollRevealOptions
) {
  const ref = useRef<T>(null);
  const { y = 30, delay = 0, duration = 0.6, start = "top 85%" } = options ?? {};

  useGSAP(
    () => {
      if (!ref.current) return;

      gsap.fromTo(
        ref.current,
        { y, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration,
          delay,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ref.current,
            start,
            toggleActions: "play none none none",
          },
        }
      );
    },
    { dependencies: [] }
  );

  return ref;
}
