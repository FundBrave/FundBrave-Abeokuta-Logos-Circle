"use client";

import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "../../lib/gsap-config";

interface MobileDrawerProps {
  links: readonly { label: string; href: string }[];
  pathname: string;
  onClose: () => void;
  topOffset?: string;
}

export function MobileDrawer({ links, pathname, onClose, topOffset = "top-20" }: MobileDrawerProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (!backdropRef.current || !panelRef.current) return;

      // Backdrop fade in
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: "power2.out" }
      );

      // Panel slide in from right
      gsap.fromTo(
        panelRef.current,
        { x: "100%" },
        { x: "0%", duration: 0.25, ease: "power2.out" }
      );

      // Stagger links
      gsap.fromTo(
        panelRef.current.querySelectorAll(".drawer-link"),
        { x: 20, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.2, stagger: 0.05, ease: "power2.out", delay: 0.1 }
      );
    },
    { dependencies: [] }
  );

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <nav
        ref={panelRef}
        className={`absolute ${topOffset} right-0 w-64 glass-card border-l border-b border-outline-variant/15 rounded-bl-2xl shadow-2xl p-6 space-y-2`}
      >
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={`drawer-link block px-4 py-3 rounded-xl font-headline text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-primary-container/20 text-primary"
                  : "text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
