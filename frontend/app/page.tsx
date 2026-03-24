"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useCampaignStats } from "./hooks/useCampaignStats";
import { RecentDonations } from "./components/RecentDonations";
import { FundBraveLogo } from "./components/FundBraveLogo";
import { LogosLogo } from "./components/LogosLogo";
import { ProgressBar } from "./components/ProgressBar";
import { StatCard } from "./components/StatCard";
import {
  Heart,
  ArrowUpRight,
  TrendingUp,
  Wallet,
  Shield,
  Users,
  BookOpen,
  Globe,
  ShieldCheck,
  Clock,
  ExternalLink,
  ChevronRight,
  DollarSign,
  Sparkles,
} from "lucide-react";

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
    <div className="min-h-screen bg-[#0A0E1A]">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <FundBraveLogo className="h-8" />
            <span className="text-white/20 hidden sm:block">·</span>
            <div className="flex items-center gap-2 hidden sm:flex">
              <LogosLogo className="h-5" />
              <span className="text-white/60 text-sm font-medium">Logos Network</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-white/60 hover:text-white text-sm transition-colors hidden sm:inline-flex items-center gap-1.5"
            >
              Dashboard
              <ChevronRight className="w-4 h-4" />
            </Link>
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pt-16 pb-12">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: copy */}
          <div>
            {/* Partnership badge */}
            <div className="inline-flex items-center gap-2.5 bg-gradient-to-r from-[#2563EB]/10 to-[#7C3AED]/10 border border-[#2563EB]/30 rounded-full px-4 py-2 mb-6 hover:border-[#2563EB]/50 transition-colors">
              <span className="flex h-2 w-2 rounded-full bg-[#F97316] animate-subtle-pulse" />
              <span className="text-sm text-[#F1F5F9] font-medium">
                Empowering women in Abeokuta, Nigeria
              </span>
            </div>

            <h1 className="text-5xl lg:text-6xl font-bold text-[#F1F5F9] leading-tight mb-5">
              Online Education{" "}
              <span className="gradient-text">for Women Entrepreneurs</span>
            </h1>

            <p className="text-[#94A3B8] text-lg mb-8 leading-relaxed max-w-lg">
              We&apos;re raising{" "}
              <span className="text-[#F1F5F9] font-semibold">
                ${stats.goalMinFormatted}–${stats.goalMaxFormatted} USDC
              </span>{" "}
              to fund digital skills courses for 20–30 women entrepreneurs through Coursera,
              Udemy, and AltSchool Africa. Your donation creates direct, measurable impact.
            </p>

            {/* Impact bullets */}
            <ul className="space-y-3 mb-10">
              {[
                { icon: Users, text: "20–30 women entrepreneurs funded" },
                { icon: BookOpen, text: "Digital skills, business dev & tech courses" },
                { icon: Globe, text: "Access to world-class education platforms" },
                { icon: ShieldCheck, text: "Transparent, on-chain multisig governance" },
              ].map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-[#94A3B8]">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-[#2563EB]/20 to-[#7C3AED]/20 flex items-center justify-center border border-[#2563EB]/20">
                    <Icon className="w-5 h-5 text-[#F97316]" />
                  </div>
                  <span className="text-[0.95rem]">{text}</span>
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4">
              <Link
                href="/donate"
                className="btn-primary flex items-center gap-2"
              >
                <Heart className="w-5 h-5" />
                Donate Now
              </Link>
              <Link
                href="/stake"
                className="btn-secondary flex items-center gap-2"
              >
                <TrendingUp className="w-5 h-5" />
                Stake to Earn
              </Link>
            </div>
          </div>

          {/* Right: fundraising card */}
          <div className="card shadow-2xl border-[#7C3AED]/20 hover:border-[#7C3AED]/40 transition-colors">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#F97316]" />
                <h3 className="text-sm font-semibold text-[#F1F5F9]">Campaign Progress</h3>
              </div>
              <span className="text-2xl font-bold text-[#F97316]">
                {stats.progressPercent.toFixed(1)}%
              </span>
            </div>

            {/* Progress */}
            <div className="mb-7">
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <div className="text-4xl font-bold text-[#F1F5F9] tracking-tight">
                    ${stats.totalRaisedFormatted}
                  </div>
                  <div className="text-sm text-[#94A3B8] mt-1">raised of goal</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-[#94A3B8] mb-1">Goal range</div>
                  <div className="text-[#F1F5F9] font-semibold">
                    ${stats.goalMinFormatted}–${stats.goalMaxFormatted}
                  </div>
                </div>
              </div>
              <ProgressBar percent={stats.progressPercent} />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-gradient-to-br from-[#2563EB]/10 to-[#2563EB]/5 rounded-lg p-3.5 border border-[#2563EB]/20">
                <div className="text-2xl font-bold text-[#F1F5F9]">
                  {stats.donorCount.toString()}
                </div>
                <div className="text-xs text-[#94A3B8] mt-1">Donors</div>
              </div>
              <div className="bg-gradient-to-br from-[#7C3AED]/10 to-[#7C3AED]/5 rounded-lg p-3.5 border border-[#7C3AED]/20">
                <div className="text-2xl font-bold text-[#F1F5F9]">
                  ${stats.totalStakedFormatted}
                </div>
                <div className="text-xs text-[#94A3B8] mt-1">Staked</div>
              </div>
              <div className="bg-gradient-to-br from-[#F97316]/10 to-[#F97316]/5 rounded-lg p-3.5 border border-[#F97316]/20">
                <div className="text-2xl font-bold text-[#F1F5F9]">
                  ${stats.totalYieldGeneratedFormatted}
                </div>
                <div className="text-xs text-[#94A3B8] mt-1">Yield earned</div>
              </div>
            </div>

            {/* Deadline */}
            <div className="flex items-center justify-between text-sm mb-6 py-3.5 border-t border-white/10">
              <div className="flex items-center gap-2 text-[#94A3B8]">
                <Clock className="w-4 h-4" />
                Campaign ends
              </div>
              <span className="text-[#F1F5F9] font-semibold">{deadlineDate}</span>
            </div>

            {/* CTA */}
            <Link
              href="/donate"
              className="btn-primary w-full text-center flex items-center justify-center gap-2"
            >
              <Heart className="w-5 h-5" />
              Donate Now
            </Link>

            {/* Transparency note */}
            <div className="mt-5 pt-5 border-t border-white/10">
              <p className="text-center text-[#94A3B8] text-xs leading-relaxed">
                Secured by{" "}
                <a
                  href="https://safe.global"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2563EB] hover:text-[#F97316] font-semibold transition-colors inline-flex items-center gap-0.5"
                >
                  Gnosis Safe
                  <ExternalLink className="w-3 h-3" />
                </a>{" "}
                · View{" "}
                <Link href="/dashboard" className="text-[#2563EB] hover:text-[#F97316] font-semibold transition-colors">
                  transparency details
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-20 border-t border-white/5">
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-[#F1F5F9] mb-3">Two Ways to Support</h2>
          <p className="text-[#94A3B8] text-lg max-w-2xl">
            Choose the contribution method that works best for you. Both directly fund
            women&apos;s education.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Direct Donation */}
          <div className="card group hover:border-[#2563EB]/50 hover:shadow-lg transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#2563EB]/20 to-[#2563EB]/5 flex items-center justify-center border border-[#2563EB]/30 group-hover:border-[#2563EB]/60 transition-colors">
                <DollarSign className="w-6 h-6 text-[#2563EB]" />
              </div>
              <ArrowUpRight className="w-5 h-5 text-[#F97316] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <h3 className="text-xl font-bold text-[#F1F5F9] mb-2">Direct Donation</h3>
            <p className="text-[#94A3B8] text-sm mb-5 leading-relaxed">
              Donate USDC, ETH, or any major ERC20 token. Your assets are automatically
              swapped to USDC. Donating from another blockchain? LayerZero V2 bridges
              your funds seamlessly.
            </p>

            <div className="space-y-3">
              <div className="text-xs text-[#94A3B8] font-medium">Supported tokens:</div>
              <div className="flex flex-wrap gap-2">
                {["USDC", "ETH", "DAI", "USDT"].map((t) => (
                  <span
                    key={t}
                    className="bg-[#111827] border border-[#2563EB]/20 rounded-lg px-3 py-1.5 text-xs font-medium text-[#F1F5F9]"
                  >
                    {t}
                  </span>
                ))}
                <span className="bg-[#111827] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#94A3B8]">
                  + more
                </span>
              </div>
            </div>

            <Link
              href="/donate"
              className="mt-5 inline-flex items-center gap-2 text-[#2563EB] hover:text-[#F97316] font-medium text-sm transition-colors"
            >
              Donate now
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Staking */}
          <div className="card group hover:border-[#7C3AED]/50 hover:shadow-lg transition-all duration-300">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#7C3AED]/5 flex items-center justify-center border border-[#7C3AED]/30 group-hover:border-[#7C3AED]/60 transition-colors">
                <TrendingUp className="w-6 h-6 text-[#7C3AED]" />
              </div>
              <Sparkles className="w-5 h-5 text-[#F97316] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <h3 className="text-xl font-bold text-[#F1F5F9] mb-2">Stake & Earn</h3>
            <p className="text-[#94A3B8] text-sm mb-5 leading-relaxed">
              Stake USDC into Aave V3. Yield is split: 79% funds the campaign, 19%
              returns to you, 2% to FundBrave. Your principal stays safe — unstake anytime.
            </p>

            <div className="space-y-2.5">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#7C3AED]" />
                  <span className="text-[#F1F5F9] font-medium">79%</span>
                  <span className="text-[#94A3B8]">→ Campaign</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#10B981]" />
                  <span className="text-[#F1F5F9] font-medium">19%</span>
                  <span className="text-[#94A3B8]">→ You</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-white/30" />
                  <span className="text-[#F1F5F9] font-medium">2%</span>
                  <span className="text-[#94A3B8]">→ Platform</span>
                </div>
              </div>
            </div>

            <Link
              href="/stake"
              className="mt-5 inline-flex items-center gap-2 text-[#7C3AED] hover:text-[#F97316] font-medium text-sm transition-colors"
            >
              Start staking
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Community Photos Gallery ──────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-20 border-t border-white/5">
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-[#F1F5F9] mb-3">Our Community</h2>
          <p className="text-[#94A3B8] text-lg max-w-2xl">
            Meet the women entrepreneurs building skills and dreams in Abeokuta.
          </p>
        </div>

        {/* Photo gallery placeholder */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Large featured image */}
          <div className="md:row-span-2">
            <div className="card h-full bg-gradient-to-br from-[#F97316]/20 via-[#7C3AED]/20 to-[#2563EB]/20 border-[#7C3AED]/30 flex items-center justify-center rounded-2xl overflow-hidden group hover:border-[#7C3AED]/60 transition-all">
              <div className="text-center">
                <Users className="w-12 h-12 text-[#F97316]/60 mx-auto mb-3" />
                <p className="text-[#94A3B8] text-sm">Community photos coming soon</p>
              </div>
            </div>
          </div>

          {/* Two smaller images */}
          <div>
            <div className="card bg-gradient-to-br from-[#2563EB]/20 to-[#7C3AED]/20 border-[#2563EB]/30 flex items-center justify-center h-48 rounded-2xl group hover:border-[#2563EB]/60 transition-all">
              <div className="text-center">
                <BookOpen className="w-10 h-10 text-[#F97316]/60 mx-auto mb-2" />
                <p className="text-[#94A3B8] text-xs">Training & Learning</p>
              </div>
            </div>
          </div>

          <div>
            <div className="card bg-gradient-to-br from-[#7C3AED]/20 to-[#F97316]/20 border-[#F97316]/30 flex items-center justify-center h-48 rounded-2xl group hover:border-[#F97316]/60 transition-all">
              <div className="text-center">
                <Sparkles className="w-10 h-10 text-[#F97316]/60 mx-auto mb-2" />
                <p className="text-[#94A3B8] text-xs">Empowerment in Action</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[#94A3B8] text-sm italic">
          Photos from the Abeokuta Logos Circle showcase the vibrant community of women
          entrepreneurs who are transforming their futures through education.
        </p>
      </section>

      {/* ── Impact Metrics ────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-20 border-t border-white/5">
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-[#F1F5F9] mb-3">Real Impact, On-Chain</h2>
          <p className="text-[#94A3B8] text-lg max-w-2xl">
            Every dollar is tracked on the blockchain. Transparent. Verifiable. Direct.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="card text-center group hover:border-[#2563EB]/50 transition-colors">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#2563EB]/20 to-[#2563EB]/5 flex items-center justify-center mx-auto mb-4 border border-[#2563EB]/20 group-hover:border-[#2563EB]/60 transition-colors">
              <Shield className="w-7 h-7 text-[#2563EB]" />
            </div>
            <h3 className="text-lg font-bold text-[#F1F5F9] mb-2">Secure & Transparent</h3>
            <p className="text-[#94A3B8] text-sm">
              All funds held in a transparent multisig wallet. Every transaction is auditable.
            </p>
          </div>

          <div className="card text-center group hover:border-[#7C3AED]/50 transition-colors">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#7C3AED]/20 to-[#7C3AED]/5 flex items-center justify-center mx-auto mb-4 border border-[#7C3AED]/20 group-hover:border-[#7C3AED]/60 transition-colors">
              <Users className="w-7 h-7 text-[#7C3AED]" />
            </div>
            <h3 className="text-lg font-bold text-[#F1F5F9] mb-2">Direct Benefit</h3>
            <p className="text-[#94A3B8] text-sm">
              20–30 women get direct access to world-class education platforms immediately.
            </p>
          </div>

          <div className="card text-center group hover:border-[#F97316]/50 transition-colors">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#F97316]/20 to-[#F97316]/5 flex items-center justify-center mx-auto mb-4 border border-[#F97316]/20 group-hover:border-[#F97316]/60 transition-colors">
              <Globe className="w-7 h-7 text-[#F97316]" />
            </div>
            <h3 className="text-lg font-bold text-[#F1F5F9] mb-2">Global Reach</h3>
            <p className="text-[#94A3B8] text-sm">
              Powered by crypto infrastructure. Donate from anywhere. Impact stays local.
            </p>
          </div>
        </div>
      </section>

      {/* ── Recent Donations feed ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-20 border-t border-white/5">
        <div className="mb-12">
          <h2 className="text-4xl font-bold text-[#F1F5F9] mb-2">Recent Supporters</h2>
          <p className="text-[#94A3B8]">
            Join these amazing people making a difference.
          </p>
        </div>
        <RecentDonations />
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 mt-20 py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-10 mb-10">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FundBraveLogo className="h-6 opacity-80" />
                <LogosLogo className="h-5 opacity-80" />
              </div>
              <p className="text-[#94A3B8] text-sm leading-relaxed">
                Abeokuta Mini is built on FundBrave infrastructure, in partnership with
                Logos Network. Funding education, empowering entrepreneurs.
              </p>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-[#F1F5F9] font-semibold mb-4 text-sm">Navigation</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/dashboard" className="text-[#94A3B8] hover:text-[#F97316] text-sm transition-colors">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/donate" className="text-[#94A3B8] hover:text-[#F97316] text-sm transition-colors">
                    Donate
                  </Link>
                </li>
                <li>
                  <Link href="/stake" className="text-[#94A3B8] hover:text-[#F97316] text-sm transition-colors">
                    Stake
                  </Link>
                </li>
              </ul>
            </div>

            {/* Contracts */}
            <div>
              <h4 className="text-[#F1F5F9] font-semibold mb-4 text-sm">On-Chain</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href={`https://basescan.org/address/${process.env.NEXT_PUBLIC_CAMPAIGN_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#94A3B8] hover:text-[#2563EB] text-sm transition-colors inline-flex items-center gap-1"
                  >
                    Campaign Contract
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <a
                    href={`https://basescan.org/address/${process.env.NEXT_PUBLIC_TREASURY_ADDRESS}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#94A3B8] hover:text-[#2563EB] text-sm transition-colors inline-flex items-center gap-1"
                  >
                    Treasury Safe
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom */}
          <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-[#94A3B8] text-xs text-center sm:text-left">
              © 2026 Abeokuta Mini · Empowering women entrepreneurs in Nigeria
            </p>
            <p className="text-[#94A3B8] text-xs">
              Built with{" "}
              <span className="text-[#F97316]">❤</span> on{" "}
              <a href="https://base.org" target="_blank" rel="noopener noreferrer" className="text-[#2563EB] hover:underline">
                Base
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
