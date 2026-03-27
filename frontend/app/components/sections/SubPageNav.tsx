"use client";

import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

interface NavLink {
  label: string;
  href: string;
  active?: boolean;
}

interface SubPageNavProps {
  backHref?: string;
  title?: string;
  navLinks?: NavLink[];
}

export function SubPageNav({ backHref = "/", title, navLinks }: SubPageNavProps) {
  return (
    <header className="fixed top-0 w-full z-50 bg-[#313442]/60 backdrop-blur-xl bg-gradient-to-b from-[#171b28] to-transparent shadow-[0_32px_32px_rgba(223,226,243,0.08)]">
      <div className="flex justify-between items-center px-2 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Link
            href={backHref}
            className="hover:bg-[#313442]/80 transition-all duration-300 active:scale-95 p-2 rounded-full"
          >
            <span className="text-on-surface">
              <span className="material-symbols-outlined">arrow_back</span>
            </span>
          </Link>
          {title ? (
            <h1 className="font-headline font-extrabold tracking-tight text-primary text-lg">
              {title}
            </h1>
          ) : (
            <div className="flex items-center gap-2.5">
              <Image
                src="/images/logo/Fundbrave_icon-gradient.png"
                alt="FundBrave"
                width={30}
                height={30}
                className="rounded-lg"
              />
              <span className="font-headline font-bold tracking-tight text-on-surface text-lg">
                FundBrave
              </span>
              <span className="text-outline-variant opacity-40 font-light">&times;</span>
              <Image
                src="/images/logo/logos-logo.png"
                alt="Logos"
                width={22}
                height={22}
                className="rounded-full opacity-80"
              />
              <span className="font-headline font-medium text-on-surface-variant text-lg">
                Logos
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-6">
          {navLinks && (
            <div className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    link.active
                      ? "text-primary border-b-2 border-primary-container font-headline text-sm font-semibold py-1"
                      : "text-on-surface-variant hover:bg-surface-container-high/40 hover:text-white transition-all px-3 py-1 rounded-lg"
                  }
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus="avatar"
          />
        </div>
      </div>
    </header>
  );
}
