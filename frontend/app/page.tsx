"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCampaignStats } from "./hooks/useCampaignStats";
import { RecentDonations } from "./components/RecentDonations";
import { FundBraveLogo } from "./components/FundBraveLogo";
import { LogosLogo } from "./components/LogosLogo";
import { ProgressBar } from "./components/ProgressBar";
import { StatCard } from "./components/StatCard";
import { Users, BookOpen, Globe, ShieldCheck } from "lucide-react";

export default function CampaignPage() {
  const stats = useCampaignStats();

  const deadlineDate = stats.deadline
    ? new Date(Number(stats.deadline) * 1000).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div className="min-h-screen bg-[#09011a]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <FundBraveLogo className="h-8" />
            <span className="text-white/40 text-sm hidden sm:block">×</span>
            <div className="flex items-center gap-2 hidden sm:flex">
              <LogosLogo className="h-6" />
              <span className="text-white/60 text-sm">Logos Network</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-white/60 hover:text-white text-sm transition-colors hidden sm:block">
              Dashboard
            </Link>
            <ConnectButton
              showBalance={false}
              chainStatus="icon"
              accountStatus="avatar"
            />
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: copy */}
          <div>
            {/* Partnership badge */}
            <div className="inline-flex items-center gap-2 bg-[#450cf0]/10 border border-[#450cf0]/30 rounded-full px-4 py-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#8762fa] animate-pulse" />
              <span className="text-sm text-[#8762fa] font-medium">
                In partnership with Logos Network
              </span>
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
              Empowering Women Entrepreneurs{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8762fa] to-[#cd82ff]">
                in Abeokuta
              </span>
            </h1>

            <p className="text-white/70 text-lg mb-8 leading-relaxed">
              We&apos;re raising{" "}
              <strong className="text-white">${stats.goalMinFormatted}–${stats.goalMaxFormatted}</strong>{" "}
              to give 20–30 women access to online courses in digital skills,
              business development, and tech fundamentals on{" "}
              <span className="text-[#8762fa]">Coursera</span>,{" "}
              <span className="text-[#8762fa]">Udemy</span>, and{" "}
              <span className="text-[#8762fa]">AltSchool Africa</span>.
            </p>

            {/* Impact bullets */}
            <ul className="space-y-3 mb-10">
              {[
                { icon: Users,     text: "20–30 women entrepreneurs directly funded" },
                { icon: BookOpen,  text: "Courses in digital skills, business dev & tech" },
                { icon: Globe,     text: "Platforms: Coursera, Udemy, AltSchool Africa" },
                { icon: ShieldCheck, text: "Funds held in transparent, on-chain multisig" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-white/70">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#450cf0]/20 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-[#8762fa]" />
                  </div>
                  <span>{text}</span>
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Link href="/donate" className="btn-primary flex items-center gap-2 text-base">
                Donate Now
              </Link>
              <Link href="/stake" className="btn-secondary flex items-center gap-2 text-base">
                Stake to Support
              </Link>
            </div>
          </div>

          {/* Right: fundraising card */}
          <div className="glass rounded-2xl p-6 shadow-2xl">
            {/* Progress */}
            <div className="mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <div>
                  <span className="text-3xl font-bold text-white">
                    ${stats.totalRaisedFormatted}
                  </span>
                  <span className="text-white/50 text-sm ml-2">USDC raised</span>
                </div>
                <span className="text-[#8762fa] font-semibold">
                  {stats.progressPercent.toFixed(1)}%
                </span>
              </div>
              <ProgressBar percent={stats.progressPercent} />
              <div className="flex justify-between mt-2 text-xs text-white/40">
                <span>Goal: ${stats.goalMinFormatted}</span>
                <span>Max: ${stats.goalMaxFormatted}</span>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-white">{stats.donorCount.toString()}</div>
                <div className="text-xs text-white/50 mt-1">Donors</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-white">${stats.totalStakedFormatted}</div>
                <div className="text-xs text-white/50 mt-1">Staked</div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-white">${stats.totalYieldGeneratedFormatted}</div>
                <div className="text-xs text-white/50 mt-1">Yield earned</div>
              </div>
            </div>

            {/* Deadline */}
            <div className="flex items-center justify-between text-sm mb-6 py-3 border-t border-white/10">
              <span className="text-white/50">Campaign ends</span>
              <span className="text-white font-medium">{deadlineDate}</span>
            </div>

            {/* CTA */}
            <Link href="/donate" className="btn-primary w-full text-center block text-base">
              Donate Now
            </Link>

            {/* Transparency note */}
            <p className="text-center text-white/40 text-xs mt-4">
              Funds secured by{" "}
              <a
                href="https://safe.global"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#8762fa] hover:underline"
              >
                Gnosis Safe multisig
              </a>
              {" · "}
              <Link href="/dashboard" className="text-[#8762fa] hover:underline">
                View transparency dashboard
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-16 border-t border-white/5">
        <h2 className="text-2xl font-bold text-white text-center mb-3">How Your Support Works</h2>
        <p className="text-white/50 text-center mb-10">
          Two ways to contribute — choose what works for you.
        </p>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Donation */}
          <div className="glass rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-[#450cf0]/20 flex items-center justify-center mb-4">
              <span className="text-2xl">💸</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Direct Donation</h3>
            <p className="text-white/60 text-sm mb-4 leading-relaxed">
              Donate USDC, ETH, DAI, or any major token. Your token is automatically
              swapped to USDC so the recipients always receive a stable currency.
              Donating from another chain? No problem — your funds are bridged
              via LayerZero V2 automatically.
            </p>
            <div className="flex flex-wrap gap-2">
              {["USDC", "ETH", "DAI", "WETH"].map((t) => (
                <span key={t} className="bg-white/10 rounded-full px-3 py-1 text-xs text-white/70">
                  {t}
                </span>
              ))}
              <span className="bg-white/10 rounded-full px-3 py-1 text-xs text-white/70">
                + more
              </span>
            </div>
          </div>

          {/* Staking */}
          <div className="glass rounded-2xl p-6">
            <div className="w-12 h-12 rounded-xl bg-[#8762fa]/20 flex items-center justify-center mb-4">
              <span className="text-2xl">📈</span>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">Stake to Generate Yield</h3>
            <p className="text-white/60 text-sm mb-4 leading-relaxed">
              Stake USDC into Aave V3. The yield generated goes 79% to the campaign,
              19% back to you, and 2% to FundBrave. Your principal is always
              safe — unstake any time. Keep earning while you contribute.
            </p>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#8762fa]" />
                <span className="text-white/60">79% → Campaign</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-400" />
                <span className="text-white/60">19% → You</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-white/30" />
                <span className="text-white/60">2% → Platform</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Recent Donations feed ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <h2 className="text-2xl font-bold text-white mb-6">Recent Supporters</h2>
        <RecentDonations />
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 py-10">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FundBraveLogo className="h-6 opacity-70" />
            <span className="text-white/30 text-xs">
              In partnership with{" "}
              <a href="https://logos.co" target="_blank" rel="noopener noreferrer" className="text-white/50 hover:text-white transition-colors">
                Logos Network
              </a>
            </span>
          </div>
          <div className="flex items-center gap-6 text-white/40 text-xs">
            <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
            <a
              href={`https://sepolia.basescan.org/address/${process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Contract
            </a>
            <a
              href={`https://sepolia.basescan.org/address/${process.env.NEXT_PUBLIC_TREASURY_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Treasury
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
