"use client";

import { useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { gsap } from "../../lib/gsap-config";
import { useScrollReveal } from "../../hooks/useScrollReveal";

const FOOTER_LINKS = [
  { label: "Donate", href: "/donate" },
  { label: "Transparency", href: "/dashboard" },
  { label: "Stake", href: "/stake" },
] as const;

export function Footer() {
  const ref = useScrollReveal<HTMLElement>({ y: 20, duration: 0.5 });

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    const underline = e.currentTarget.querySelector(".nav-underline");
    if (underline) {
      gsap.to(underline, { scaleX: 1, duration: 0.3, ease: "power2.out", overwrite: true });
    }
  }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    const underline = e.currentTarget.querySelector(".nav-underline");
    if (underline) {
      gsap.to(underline, { scaleX: 0, duration: 0.3, ease: "power2.in", overwrite: true });
    }
  }, []);

  return (
    <footer ref={ref} className="bg-[#050810] w-full py-20 border-t border-outline-variant/10 mt-20">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-12 mb-16">
          <div className="flex items-center gap-4">
            <a
              href="https://www.fundbrave.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Image
                src="/images/logo/Fundbrave_icon-gradient.png"
                alt="FundBrave"
                width={40}
                height={40}
                className="rounded-lg"
              />
              <span className="text-2xl font-black text-on-surface font-headline">
                FundBrave
              </span>
            </a>
            <span className="h-6 w-px bg-outline-variant/30" />
            <a
              href="https://logos.co/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <Image
                src="/images/logo/logos-logo.png"
                alt="Logos"
                width={32}
                height={32}
                className="rounded-full opacity-80"
              />
              <span className="text-xl font-bold text-on-surface-variant/60 font-headline">
                Logos
              </span>
            </a>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="relative text-sm text-on-surface-variant hover:text-primary transition-colors font-bold uppercase tracking-widest pb-1"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                {link.label}
                <span className="nav-underline absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary-container to-secondary-container origin-left scale-x-0" />
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-12 border-t border-outline-variant/5 gap-8">
          <div className="text-center md:text-left">
            <p className="text-on-surface-variant text-sm font-medium mb-1">
              Powered by FundBrave &times; Logos
            </p>
            <p className="text-on-surface-variant/40 text-xs uppercase tracking-widest">
              &copy; {new Date().getFullYear()} Built for the Ethereal Vault
              Ecosystem
            </p>
          </div>
          <div className="flex gap-6">
            <span className="text-2xl text-on-surface-variant/40 hover:text-primary cursor-pointer transition-colors">
              <span className="material-symbols-outlined">language</span>
            </span>
            <span className="text-2xl text-on-surface-variant/40 hover:text-primary cursor-pointer transition-colors">
              <span className="material-symbols-outlined">hub</span>
            </span>
            <span className="text-2xl text-on-surface-variant/40 hover:text-primary cursor-pointer transition-colors">
              <span className="material-symbols-outlined">public</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
