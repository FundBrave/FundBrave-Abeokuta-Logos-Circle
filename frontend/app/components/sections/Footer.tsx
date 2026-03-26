"use client";

import Link from "next/link";
import { useScrollReveal } from "../../hooks/useScrollReveal";

const FOOTER_LINKS = [
  { label: "Whitepaper", href: "#" },
  { label: "Transparency", href: "/dashboard" },
  { label: "Vault Governance", href: "#" },
] as const;

export function Footer() {
  const ref = useScrollReveal<HTMLElement>({ y: 20, duration: 0.5 });

  return (
    <footer ref={ref} className="bg-[#050810] w-full py-20 border-t border-outline-variant/10 mt-20">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-12 mb-16">
          <div className="flex items-center gap-4">
            <span className="text-2xl font-black text-on-surface font-headline">
              FundBrave
            </span>
            <span className="h-6 w-px bg-outline-variant/30" />
            <span className="text-xl font-bold text-on-surface-variant/60 font-headline">
              Logos Network
            </span>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-on-surface-variant hover:text-primary transition-all font-bold uppercase tracking-widest"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-12 border-t border-outline-variant/5 gap-8">
          <div className="text-center md:text-left">
            <p className="text-on-surface-variant text-sm font-medium mb-1">
              Powered by FundBrave &times; Logos Network
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
