"use client";

import { gsap, ScrollTrigger } from "./gsap-config";

/** Shared ScrollTrigger defaults — play once, never reverse */
export const SCROLL_DEFAULTS: ScrollTrigger.StaticVars = {
  start: "top 80%",
  end: "top 20%",
  toggleActions: "play none none none",
};

/**
 * Scroll-triggered section entrance with optional header and staggered children.
 *
 * @example
 * animateSectionEntrance(sectionRef.current!, {
 *   header: ".section-header",
 *   children: ".card",
 *   stagger: 0.15,
 * });
 */
export function animateSectionEntrance(
  container: HTMLElement,
  elements: {
    header?: string;
    children?: string;
    stagger?: number;
  }
) {
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: container,
      ...SCROLL_DEFAULTS,
    },
  });

  if (elements.header) {
    tl.fromTo(
      container.querySelectorAll(elements.header),
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: "power2.out" }
    );
  }

  if (elements.children) {
    tl.fromTo(
      container.querySelectorAll(elements.children),
      { y: 40, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.6,
        stagger: elements.stagger ?? 0.15,
        ease: "power2.out",
      },
      elements.header ? "-=0.2" : undefined
    );
  }

  return tl;
}

/**
 * Animate a number counting up from 0 to endValue.
 *
 * @example
 * animateCounter(amountEl, 12500, { prefix: "$", suffix: " USDC", decimals: 2 });
 */
export function animateCounter(
  element: HTMLElement,
  endValue: number,
  options?: {
    duration?: number;
    prefix?: string;
    suffix?: string;
    decimals?: number;
  }
) {
  const {
    duration = 1.2,
    prefix = "",
    suffix = "",
    decimals = 0,
  } = options ?? {};

  const obj = { val: 0 };

  return gsap.to(obj, {
    val: endValue,
    duration,
    ease: "power1.out",
    onUpdate() {
      element.textContent = `${prefix}${obj.val.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;
    },
  });
}
