"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink,
  RefreshCw,
  Landmark,
  Zap,
  Users,
  Clock,
  TrendingUp,
  Lock,
} from "lucide-react";
import { useAdmin } from "../hooks/useAdmin";
import { FundBraveLogo } from "../components/FundBraveLogo";
import {
  formatUSDC,
  shortenAddress,
  getExplorerUrl,
  CONTRACT_ADDRESSES,
  TARGET_CHAIN_ID,
  CAMPAIGN_GOAL_MAX_USDC,
} from "../lib/contracts";

// ─── Multisig signers from env (optional, informational only) ────────────────

const MULTISIG_SIGNERS = [
  process.env.NEXT_PUBLIC_SIGNER_1,
  process.env.NEXT_PUBLIC_SIGNER_2,
  process.env.NEXT_PUBLIC_SIGNER_3,
].filter(Boolean) as string[];

const REQUIRED_SIGS = process.env.NEXT_PUBLIC_REQUIRED_SIGS
  ? parseInt(process.env.NEXT_PUBLIC_REQUIRED_SIGS)
  : MULTISIG_SIGNERS.length;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deadlineLabel(deadline: bigint): string {
  if (!deadline) return "—";
  const d = new Date(Number(deadline) * 1000);
  return d.toLocaleDateString("en-US", { dateStyle: "medium" }) +
    " " + d.toLocaleTimeString("en-US", { timeStyle: "short" });
}

function timeSince(ts: bigint): string {
  if (!ts) return "never";
  const secs = Math.floor(Date.now() / 1000) - Number(ts);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
      <p className="text-xs text-white/50 mb-1">{label}</p>
      <p className="text-xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-white/40 mt-0.5">{sub}</p>}
    </div>
  );
}

function TxResult({
  hash,
  success,
  label,
  onReset,
}: {
  hash?: `0x${string}`;
  success: boolean;
  label: string;
  onReset: () => void;
}) {
  if (!hash) return null;
  return (
    <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 text-sm ${
      success ? "bg-green-500/10 border border-green-500/20 text-green-400"
               : "bg-blue-500/10 border border-blue-500/20 text-blue-400"
    }`}>
      {success ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />}
      <div className="flex-1">
        <span>{success ? `${label} confirmed` : "Confirming…"}</span>
        {hash && (
          <a
            href={getExplorerUrl(hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 underline text-xs opacity-70 hover:opacity-100"
          >
            View tx <ExternalLink className="inline w-3 h-3" />
          </a>
        )}
      </div>
      {success && (
        <button onClick={onReset} className="text-xs opacity-60 hover:opacity-100">
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const admin = useAdmin();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  // Access check: connected wallet must be treasury or owner
  const isTreasury = isConnected && admin.treasuryAddress &&
    address?.toLowerCase() === admin.treasuryAddress.toLowerCase();
  const isOwner = isConnected && admin.ownerAddress &&
    address?.toLowerCase() === admin.ownerAddress.toLowerCase();
  const isAdmin = isTreasury || isOwner;

  // Staking stats
  const totalStaked      = admin.stakingStats?.[0] ?? 0n;
  const totalYield       = admin.stakingStats?.[1] ?? 0n;
  const lastHarvestTs    = admin.stakingStats?.[2] ?? 0n;
  const unrealizedYield  = admin.stakingStats?.[4] ?? 0n;

  const progressPct = admin.goalMin > 0n
    ? Math.min(100, Number((admin.totalRaised * 10000n) / admin.goalMin) / 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#0A0E1A] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0A0E1A]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-white/60 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <FundBraveLogo />
            <div className="flex items-center gap-1.5 bg-[#111827] border border-white/10 rounded-full px-3 py-1">
              <Shield className="w-3.5 h-3.5 text-[#F97316]" />
              <span className="text-xs font-medium text-white/70">Admin</span>
            </div>
          </div>
          <ConnectButton showBalance={false} />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Access gate */}
        {!isConnected ? (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-8 text-center">
            <Lock className="w-10 h-10 text-white/30 mx-auto mb-3" />
            <p className="text-white/70 text-sm mb-4">
              Connect the treasury or owner wallet to access admin controls.
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        ) : !isAdmin ? (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-300 font-medium text-sm">Not authorized</p>
              <p className="text-amber-400/70 text-xs mt-1">
                Connected as <span className="font-mono">{shortenAddress(address!)}</span>.
                Switch to the treasury ({admin.treasuryAddress ? shortenAddress(admin.treasuryAddress) : "…"})
                or owner wallet to proceed.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-green-300">
              Authenticated as {isTreasury ? "treasury" : "owner"} — {shortenAddress(address!)}
            </span>
          </div>
        )}

        {/* Campaign overview */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">Campaign</h2>
            <button
              onClick={admin.refetchAll}
              className="text-white/40 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <StatCard
              label="Total Raised"
              value={`$${formatUSDC(admin.totalRaised)}`}
              sub={`${progressPct.toFixed(0)}% of $${CAMPAIGN_GOAL_MAX_USDC.toLocaleString()}`}
            />
            <StatCard
              label="USDC in Contract"
              value={`$${formatUSDC(admin.campaignUsdcBalance)}`}
              sub="available to withdraw"
            />
            <StatCard
              label="Donors"
              value={admin.donorCount.toString()}
            />
            <StatCard
              label="Status"
              value={admin.isActive ? "Active" : "Ended"}
              sub={`Deadline: ${deadlineLabel(admin.deadline)}`}
            />
          </div>

          {/* Progress bar */}
          <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
            <div className="flex justify-between text-xs text-white/50 mb-2">
              <span>Progress to minimum goal</span>
              <span className={admin.minGoalReached ? "text-green-400" : "text-amber-400"}>
                {admin.minGoalReached ? "✓ Goal reached" : "Goal not yet reached"}
              </span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${admin.minGoalReached ? "bg-green-500" : "bg-[#F97316]"}`}
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Treasury withdrawal */}
        <section className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <Landmark className="w-5 h-5 text-[#F97316] mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-white">Withdraw to Treasury</h2>
              <p className="text-xs text-white/50 mt-0.5">
                Transfers all campaign USDC to the treasury multisig.
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-4 text-sm">
            <div className="flex justify-between text-white/60">
              <span>Treasury address</span>
              <span className="font-mono text-white/80">
                {admin.treasuryAddress ? shortenAddress(admin.treasuryAddress) : "…"}
              </span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Available USDC</span>
              <span className="font-semibold text-white">${formatUSDC(admin.campaignUsdcBalance)}</span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Min goal reached</span>
              <span className={admin.minGoalReached ? "text-green-400" : "text-amber-400"}>
                {admin.minGoalReached ? "Yes ✓" : "No — withdrawal blocked"}
              </span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Campaign ended</span>
              <span className={!admin.isActive ? "text-green-400" : "text-amber-400"}>
                {!admin.isActive ? "Yes ✓" : "Still active — withdrawal available when ended"}
              </span>
            </div>
          </div>

          {/* Withdrawal requires: campaign ended + min goal reached */}
          {!admin.canWithdraw && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400 mb-4">
              Withdrawal is only possible after the campaign deadline passes AND the minimum goal
              ($2,000) is reached.
            </div>
          )}

          {admin.canWithdraw && !confirmWithdraw && !admin.withdrawSuccess && (
            <button
              onClick={() => setConfirmWithdraw(true)}
              disabled={!isAdmin || admin.campaignUsdcBalance === 0n}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[#F97316] hover:bg-[#EA6C0A] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Withdraw ${formatUSDC(admin.campaignUsdcBalance)} to Treasury
            </button>
          )}

          {confirmWithdraw && !admin.withdrawSubmitting && !admin.withdrawConfirming && !admin.withdrawSuccess && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-sm text-red-300 font-medium mb-3">
                Confirm withdrawal of ${formatUSDC(admin.campaignUsdcBalance)} USDC to treasury?
              </p>
              <p className="text-xs text-red-400/70 mb-4">
                This action is irreversible. Funds will be sent to {admin.treasuryAddress ? shortenAddress(admin.treasuryAddress) : "treasury"}.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    admin.withdrawToTreasury();
                    setConfirmWithdraw(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-red-500 hover:bg-red-600 transition-colors"
                >
                  Confirm Withdraw
                </button>
                <button
                  onClick={() => setConfirmWithdraw(false)}
                  className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-white/10 hover:bg-white/20 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {(admin.withdrawSubmitting || admin.withdrawConfirming) && (
            <div className="flex items-center gap-2 text-sm text-white/60 py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {admin.withdrawSubmitting ? "Waiting for signature…" : "Confirming transaction…"}
            </div>
          )}

          <TxResult
            hash={admin.withdrawHash}
            success={admin.withdrawSuccess}
            label="Withdrawal"
            onReset={admin.resetWithdraw}
          />

          {admin.withdrawError && (
            <p className="text-xs text-red-400 mt-2">
              {(admin.withdrawError as Error).message?.slice(0, 120)}
            </p>
          )}
        </section>

        {/* Staking harvest */}
        <section className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <Zap className="w-5 h-5 text-[#2563EB] mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-white">Harvest Staking Yield</h2>
              <p className="text-xs text-white/50 mt-0.5">
                Pulls Aave yield and distributes staker / campaign shares.
                Anyone can call this — no admin role required.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatCard
              label="Total Staked"
              value={`$${formatUSDC(totalStaked)}`}
            />
            <StatCard
              label="Unrealized Yield"
              value={`$${formatUSDC(unrealizedYield)}`}
              sub="pending harvest"
            />
            <StatCard
              label="Last Harvest"
              value={lastHarvestTs > 0n ? timeSince(lastHarvestTs) : "Never"}
            />
          </div>

          {!admin.harvestSuccess && (
            <button
              onClick={admin.harvestAndDistribute}
              disabled={admin.harvestSubmitting || admin.harvestConfirming || totalStaked === 0n}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {(admin.harvestSubmitting || admin.harvestConfirming) ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {admin.harvestSubmitting ? "Signing…" : "Confirming…"}</>
              ) : (
                <><TrendingUp className="w-4 h-4" /> Harvest &amp; Distribute Yield</>
              )}
            </button>
          )}

          <TxResult
            hash={admin.harvestHash}
            success={admin.harvestSuccess}
            label="Harvest"
            onReset={admin.resetHarvest}
          />

          {admin.harvestError && (
            <p className="text-xs text-red-400 mt-2">
              {(admin.harvestError as Error).message?.slice(0, 120)}
            </p>
          )}
        </section>

        {/* Multisig info */}
        <section className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-4">
            <Users className="w-5 h-5 text-white/50 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-white">Treasury Multisig</h2>
              <p className="text-xs text-white/50 mt-0.5">
                Gnosis Safe — {REQUIRED_SIGS}-of-{MULTISIG_SIGNERS.length || "?"} required signatures
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between text-white/60">
              <span>Safe address</span>
              <span className="font-mono text-white/80">
                {admin.treasuryAddress ? shortenAddress(admin.treasuryAddress) : "…"}
              </span>
            </div>
            <div className="flex justify-between text-white/60">
              <span>Required signatures</span>
              <span className="text-white/80">{REQUIRED_SIGS} of {MULTISIG_SIGNERS.length || "?"}</span>
            </div>
          </div>

          {MULTISIG_SIGNERS.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-white/40 mb-2 uppercase tracking-wider">Signers</p>
              <div className="space-y-1.5">
                {MULTISIG_SIGNERS.map((signer, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-white/30">#{i + 1}</span>
                    <span className="font-mono text-xs text-white/70 flex-1">{signer}</span>
                    {address?.toLowerCase() === signer.toLowerCase() && (
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                        you
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {admin.treasuryAddress && (TARGET_CHAIN_ID as number) === 8453 && (
            <a
              href={`https://app.safe.global/home?safe=base:${admin.treasuryAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              Open in Gnosis Safe <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {(TARGET_CHAIN_ID as number) !== 8453 && (
            <p className="text-xs text-white/30 text-center">
              Gnosis Safe link available on mainnet only. On testnet, the treasury is a plain wallet — withdrawal works directly from this page.
            </p>
          )}
        </section>

        {/* Contract addresses */}
        <section className="bg-[#111827] border border-white/10 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Contracts</h2>
          <div className="space-y-2 text-sm">
            {[
              ["Campaign",  CONTRACT_ADDRESSES.campaign],
              ["Staking",   CONTRACT_ADDRESSES.staking],
              ["USDC",      CONTRACT_ADDRESSES.usdc],
              ["Treasury",  CONTRACT_ADDRESSES.treasury],
            ].map(([label, addr]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-white/50">{label}</span>
                <a
                  href={getExplorerUrl(addr)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-white/70 hover:text-white flex items-center gap-1 transition-colors"
                >
                  {shortenAddress(addr)} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
