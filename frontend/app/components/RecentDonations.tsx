"use client";

import { useState, useEffect } from "react";
import { useReadContract, usePublicClient } from "wagmi";
import { CAMPAIGN_ABI, CONTRACT_ADDRESSES, TARGET_CHAIN_ID, shortenAddress, formatUSDC } from "../lib/contracts";
import { ExternalLink } from "lucide-react";

const ALLOWED_CHAINS = new Set([
  "base", "ethereum", "polygon", "arbitrum", "optimism",
  "base-sepolia", "ethereum-sepolia", "polygon-amoy",
  "rootstock", "staking-yield", "unknown",
]);

function sanitizeChainName(chain: string): string {
  const cleaned = chain.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase();
  return ALLOWED_CHAINS.has(cleaned) ? cleaned : "unknown";
}

interface DonationRecord {
  donor:       string;
  amount:      bigint;
  timestamp:   bigint;
  tokenIn:     string;
  sourceChain: string;
}

/**
 * Cross-chain donations are not stored in the on-chain `_allDonations` array
 * (gas optimisation for the LayerZero path), but they DO emit the `Donated` event.
 * This hook fetches recent `Donated` logs, filters for non-base sourceChains,
 * fetches the block timestamps in a single batch, and returns synthesised records.
 */
function useCrossChainDonations(): DonationRecord[] {
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID });
  const [records, setRecords] = useState<DonationRecord[]>([]);

  useEffect(() => {
    if (!publicClient) return;
    const client = publicClient;
    let cancelled = false;

    async function fetch() {
      try {
        // Look back ~3 days on Base (~2s/block → 129,600 blocks).
        // Smaller range avoids RPC timeouts; cross-chain donations within
        // the display window will still appear.
        const latestBlock = await client.getBlockNumber();
        const fromBlock   = latestBlock > 129_600n ? latestBlock - 129_600n : 0n;

        const donatedEvent = CAMPAIGN_ABI.find(
          (x): x is typeof x & { type: "event" } => x.type === "event" && x.name === "Donated"
        )!;

        const logs = await client.getLogs({
          address:   CONTRACT_ADDRESSES.campaign,
          event:     donatedEvent as any,
          fromBlock,
          toBlock:   "latest",
        });

        // Only care about cross-chain donations — direct ones are in _allDonations already.
        const xchain = logs.filter((l: any) => {
          const src = sanitizeChainName(l.args?.sourceChain ?? "");
          return src !== "base" && src !== "base-sepolia" && src !== "staking-yield";
        });

        if (xchain.length === 0 || cancelled) return;

        // Batch-fetch block timestamps in chunks of 10 to avoid overwhelming the RPC.
        const uniqueBlocks = [...new Set(xchain.map((l: any) => l.blockNumber as bigint))];
        const CHUNK = 10;
        const blockData: Awaited<ReturnType<typeof client.getBlock>>[] = [];
        for (let i = 0; i < uniqueBlocks.length; i += CHUNK) {
          const batch = await Promise.all(
            uniqueBlocks.slice(i, i + CHUNK).map((n) => client.getBlock({ blockNumber: n }))
          );
          blockData.push(...batch);
        }
        const tsMap = new Map(blockData.map((b) => [b.number?.toString() ?? "", b.timestamp]));

        const synthesised: DonationRecord[] = xchain.map((l: any) => ({
          donor:       l.args.donor       as string,
          amount:      l.args.usdcAmount  as bigint,
          timestamp:   tsMap.get(l.blockNumber.toString()) ?? BigInt(Math.floor(Date.now() / 1000)),
          tokenIn:     l.args.tokenIn     as string,
          sourceChain: sanitizeChainName(l.args.sourceChain ?? "unknown"),
        }));

        if (!cancelled) setRecords(synthesised);
      } catch {
        // Non-fatal — direct donations still show via getRecentDonations
      }
    }

    fetch();
    const timer = setInterval(fetch, 60_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [publicClient]);

  return records;
}

export function RecentDonations() {
  const { data, isLoading, error } = useReadContract({
    address:      CONTRACT_ADDRESSES.campaign,
    abi:          CAMPAIGN_ABI,
    functionName: "getRecentDonations",
    args:         [0n, 10n],
    chainId:      TARGET_CHAIN_ID,
    // Poll every 60 s — matches the cross-chain log interval to avoid RPC pressure.
    query: { refetchInterval: 60_000 },
  });

  const directDonations  = (data as DonationRecord[] | undefined) ?? [];
  const xchainDonations  = useCrossChainDonations();

  // Merge and keep newest-first, capped at 10.
  const donations = [...directDonations, ...xchainDonations]
    .sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
    .slice(0, 10);

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
  const chain   = sanitizeChainName(donation.sourceChain || "base");
  const isXChain = chain !== "base" && chain !== "staking-yield";

  return (
    <div className="glass rounded-xl px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#7C3AED] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
          {donation.donor.slice(2, 4).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-white text-sm font-medium">
              {shortenAddress(donation.donor)}
            </span>
            {isXChain && (
              <span className="bg-[#2563EB]/20 text-[#2563EB] text-xs px-2 py-0.5 rounded-full">
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
