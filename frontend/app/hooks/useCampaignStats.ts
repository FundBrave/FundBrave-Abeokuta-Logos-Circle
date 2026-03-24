"use client";

import { useReadContract, useReadContracts } from "wagmi";
import {
  CAMPAIGN_ABI,
  STAKING_ABI,
  CONTRACT_ADDRESSES,
  TARGET_CHAIN_ID,
  formatUSDC,
} from "../lib/contracts";

/**
 * useCampaignStats — reads live on-chain campaign and staking data.
 *
 * This is the single source of truth for the dashboard and progress bar.
 * Both reads happen in one multicall round-trip via useReadContracts.
 */
export function useCampaignStats() {
  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      {
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "getCampaignStats",
        chainId:      TARGET_CHAIN_ID,
      },
      {
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "progressBps",
        chainId:      TARGET_CHAIN_ID,
      },
      {
        address:      CONTRACT_ADDRESSES.staking,
        abi:          STAKING_ABI,
        functionName: "getStakingStats",
        chainId:      TARGET_CHAIN_ID,
      },
    ],
    // FE-M4: Refetch every 30 s to show live progress; staleTime prevents
    // redundant re-fetches when multiple components use this hook simultaneously.
    query: {
      refetchInterval: 30_000,
      staleTime:       15_000,
    },
  });

  const campaignStats = data?.[0]?.result as
    | [bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean]
    | undefined;

  const progressBps   = data?.[1]?.result as bigint | undefined;
  const stakingStats  = data?.[2]?.result as
    | [bigint, bigint, bigint, bigint, bigint]
    | undefined;

  return {
    isLoading,
    error,
    refetch,

    // Campaign fields
    totalRaised:      campaignStats?.[0] ?? 0n,
    goalMin:          campaignStats?.[1] ?? 0n,
    goalMax:          campaignStats?.[2] ?? 0n,
    deadline:         campaignStats?.[3] ?? 0n,
    donorCount:       campaignStats?.[4] ?? 0n,
    donationsCount:   campaignStats?.[5] ?? 0n,
    isActive:         campaignStats?.[6] ?? false,
    minGoalReached:   campaignStats?.[7] ?? false,

    progressPercent:  progressBps ? Number(progressBps) / 100 : 0,

    // Staking fields
    totalStaked:          stakingStats?.[0] ?? 0n,
    totalYieldGenerated:  stakingStats?.[1] ?? 0n,
    lastHarvest:          stakingStats?.[2] ?? 0n,
    unrealizedYield:      stakingStats?.[4] ?? 0n,

    // Formatted helpers
    totalRaisedFormatted:       formatUSDC(campaignStats?.[0] ?? 0n),
    goalMinFormatted:           formatUSDC(campaignStats?.[1] ?? 0n),
    goalMaxFormatted:           formatUSDC(campaignStats?.[2] ?? 0n),
    totalStakedFormatted:       formatUSDC(stakingStats?.[0] ?? 0n),
    totalYieldGeneratedFormatted: formatUSDC(stakingStats?.[1] ?? 0n),
  };
}
