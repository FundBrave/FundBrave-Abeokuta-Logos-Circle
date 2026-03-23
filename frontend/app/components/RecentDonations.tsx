"use client";

import { useReadContract } from "wagmi";
import { CAMPAIGN_ABI, CONTRACT_ADDRESSES, TARGET_CHAIN_ID, shortenAddress, formatUSDC } from "../lib/contracts";
import { ExternalLink } from "lucide-react";

interface DonationRecord {
  donor:       string;
  amount:      bigint;
  timestamp:   bigint;
  tokenIn:     string;
  sourceChain: string;
}

export function RecentDonations() {
  const { data, isLoading, error } = useReadContract({
    address:      CONTRACT_ADDRESSES.campaign,
    abi:          CAMPAIGN_ABI,
    functionName: "getRecentDonations",
    args:         [0n, 10n],
    chainId:      TARGET_CHAIN_ID,
  });

  const donations = (data as DonationRecord[] | undefined) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 animate-pulse">
            <div className="h-4 bg-white/10 rounded w-48 mb-2" />
            <div className="h-3 bg-white/5 rounded w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (error || donations.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-white/40 text-sm">
          {error ? "Could not load donations." : "No donations yet — be the first!"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {donations.map((d, i) => (
        <DonationRow key={i} donation={d} />
      ))}
    </div>
  );
}

function DonationRow({ donation }: { donation: DonationRecord }) {
  const timeAgo = formatTimeAgo(Number(donation.timestamp));
  const chain   = donation.sourceChain || "base";
  const isXChain = chain !== "base" && chain !== "staking-yield";

  return (
    <div className="glass rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#450cf0] to-[#8762fa] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {donation.donor.slice(2, 4).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-white text-sm font-medium">
              {shortenAddress(donation.donor)}
            </span>
            {isXChain && (
              <span className="bg-[#450cf0]/20 text-[#8762fa] text-xs px-2 py-0.5 rounded-full">
                {chain}
              </span>
            )}
            {chain === "staking-yield" && (
              <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full">
                yield
              </span>
            )}
          </div>
          <span className="text-white/40 text-xs">{timeAgo}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-white font-semibold text-sm">
          ${formatUSDC(donation.amount)}
        </div>
        <div className="text-white/40 text-xs">USDC</div>
      </div>
    </div>
  );
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000) - timestamp;
  if (seconds < 60)   return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
