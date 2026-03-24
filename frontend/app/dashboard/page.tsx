"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, Shield, Users, TrendingUp, DollarSign } from "lucide-react";
import { FundBraveLogo } from "../components/FundBraveLogo";
import { ProgressBar } from "../components/ProgressBar";
import { RecentDonations } from "../components/RecentDonations";
import { useCampaignStats } from "../hooks/useCampaignStats";
import {
  CONTRACT_ADDRESSES,
  CAMPAIGN_GOAL_MIN_USDC,
  CAMPAIGN_GOAL_MAX_USDC,
  getAddressExplorerUrl,
} from "../lib/contracts";
import { ConnectButton } from "@rainbow-me/rainbowkit";

// Gnosis Safe signers (configured manually after deployment)
const MULTISIG_SIGNERS = [
  { name: "Abeokuta Circle Lead 1", address: process.env.NEXT_PUBLIC_SIGNER_1 || "0x0000…" },
  { name: "Abeokuta Circle Lead 2", address: process.env.NEXT_PUBLIC_SIGNER_2 || "0x0000…" },
  { name: "Logos Network",          address: process.env.NEXT_PUBLIC_SIGNER_3 || "0x0000…" },
];

const REQUIRED_SIGS = parseInt(process.env.NEXT_PUBLIC_REQUIRED_SIGS || "2");
const TOTAL_SIGS    = MULTISIG_SIGNERS.length;

export default function DashboardPage() {
  const stats = useCampaignStats();

  const deadlineDate = stats.deadline
    ? new Date(Number(stats.deadline) * 1000).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const daysRemaining = stats.deadline
    ? Math.max(0, Math.ceil((Number(stats.deadline) - Date.now() / 1000) / 86400))
    : 0;

  return (
    <div className="min-h-screen bg-[#0A0E1A]">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors duration-200">
            <ArrowLeft className="w-4 h-4" />
            <FundBraveLogo className="h-7" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-white/40 text-sm">Transparency Dashboard</span>
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-bold text-white mb-2">Campaign Dashboard</h1>
        <p className="text-white/50 mb-8">
          All data is read directly from the blockchain in real time.
        </p>

        {/* Progress */}
        <div className="glass rounded-2xl p-6 mb-6 border border-white/8 transition-all duration-300 hover:border-white/12">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <span className="text-4xl font-bold text-white">
                ${stats.totalRaisedFormatted}
              </span>
              <span className="text-white/50 text-lg ml-2">
                of ${stats.goalMaxFormatted} USDC
              </span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-[#2563EB]">
                {stats.progressPercent.toFixed(1)}%
              </div>
              <div className="text-white/40 text-sm">funded</div>
            </div>
          </div>
          <ProgressBar percent={stats.progressPercent} className="mb-3" />
          <div className="flex justify-between text-sm text-white/40">
            <span>Min goal: ${CAMPAIGN_GOAL_MIN_USDC.toLocaleString()}</span>
            <span>
              {stats.isActive
                ? `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} left`
                : "Campaign ended"}
            </span>
            <span>Deadline: {deadlineDate}</span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            {
              icon: Users,
              label: "Unique Donors",
              value: stats.donorCount.toString(),
              color: "#2563EB",
            },
            {
              icon: DollarSign,
              label: "Total Raised",
              value: `$${stats.totalRaisedFormatted}`,
              color: "#F97316",
            },
            {
              icon: TrendingUp,
              label: "Total Staked",
              value: `$${stats.totalStakedFormatted}`,
              color: "#10B981",
            },
            {
              icon: TrendingUp,
              label: "Yield Generated",
              value: `$${stats.totalYieldGeneratedFormatted}`,
              color: "#7C3AED",
            },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="glass rounded-xl p-4 border border-white/8 transition-all duration-300 hover:border-white/12 hover-lift">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                style={{ background: `${color}15` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div className="text-2xl font-bold text-white">{value}</div>
              <div className="text-xs text-white/50 mt-1">{label}</div>
            </div>
          ))}
        </div>

        {/* Multisig transparency */}
        <div className="glass rounded-2xl p-6 mb-6 border border-white/8 transition-all duration-300 hover:border-white/12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#10B981]/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-[#10B981]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Multisig Treasury</h2>
              <p className="text-white/50 text-xs">
                Requires {REQUIRED_SIGS}-of-{TOTAL_SIGS} signatures to withdraw
              </p>
            </div>
          </div>

          {/* Safe address */}
          <div className="bg-white/5 rounded-xl p-3 mb-4 flex items-center justify-between border border-white/8 transition-colors duration-200">
            <div>
              <div className="text-xs text-white/40 mb-1">Safe Address (Gnosis Safe)</div>
              <div className="text-white font-mono text-sm">
                {CONTRACT_ADDRESSES.treasury !== "0x0000000000000000000000000000000000000000"
                  ? CONTRACT_ADDRESSES.treasury
                  : "Not yet deployed"}
              </div>
            </div>
            {CONTRACT_ADDRESSES.treasury !== "0x0000000000000000000000000000000000000000" && (
              <a
                href={getAddressExplorerUrl(CONTRACT_ADDRESSES.treasury)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#2563EB] hover:text-[#1D4ED8] transition-colors duration-200"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>

          {/* Signers */}
          <h3 className="text-sm font-medium text-white/60 mb-3">Authorised Signers</h3>
          <div className="space-y-2">
            {MULTISIG_SIGNERS.map((signer) => (
              <div
                key={signer.name}
                className="bg-white/5 rounded-xl p-3 flex items-center justify-between border border-white/8 transition-all duration-200 hover:border-white/12"
              >
                <div>
                  <div className="text-sm text-white">{signer.name}</div>
                  <div className="text-xs text-white/40 font-mono mt-0.5">{signer.address}</div>
                </div>
                {signer.address !== "0x0000…" && (
                  <a
                    href={getAddressExplorerUrl(signer.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/30 hover:text-[#2563EB] transition-colors duration-200"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contract addresses */}
        <div className="glass rounded-2xl p-6 mb-6 border border-white/8 transition-all duration-300 hover:border-white/12">
          <h2 className="text-lg font-semibold text-white mb-4">Smart Contracts</h2>
          <div className="space-y-3">
            {[
              { label: "Campaign Contract",  address: CONTRACT_ADDRESSES.campaign  },
              { label: "Staking Pool",       address: CONTRACT_ADDRESSES.staking   },
              { label: "FundBrave Bridge",   address: CONTRACT_ADDRESSES.fundBraveBridge },
              { label: "USDC Token",         address: CONTRACT_ADDRESSES.usdc      },
            ].map(({ label, address }) => (
              <div
                key={label}
                className="flex items-center justify-between py-2 border-b border-white/8 last:border-0 transition-colors duration-200"
              >
                <div>
                  <div className="text-sm text-white/60">{label}</div>
                  <div className="text-xs text-white font-mono mt-0.5">
                    {address}
                  </div>
                </div>
                <a
                  href={getAddressExplorerUrl(address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-[#2563EB] transition-colors duration-200 flex-shrink-0 ml-3"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Recent donations */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Recent Donations</h2>
          <RecentDonations />
        </div>

        {/* CTA */}
        <div className="glass rounded-2xl p-6 text-center border border-white/8 transition-all duration-300 hover:border-white/12">
          <h3 className="text-lg font-semibold text-white mb-2">Ready to contribute?</h3>
          <p className="text-white/50 text-sm mb-4">
            Every donation, no matter how small, directly funds women entrepreneurs in Abeokuta.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/donate" className="btn-primary">Donate Now</Link>
            <Link href="/stake"  className="btn-secondary">Stake to Support</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
