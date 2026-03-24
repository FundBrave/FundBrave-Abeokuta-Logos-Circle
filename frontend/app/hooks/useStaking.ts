"use client";

import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContracts,
} from "wagmi";
import {
  STAKING_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
  TARGET_CHAIN_ID,
  formatUSDC,
  friendlyError,
} from "../lib/contracts";

export type StakingStep =
  | "idle"
  | "approving"
  | "staking"
  | "unstaking"
  | "claiming"
  | "settingsplit"
  | "confirming"
  | "success"
  | "error";

/** Format basis points as a human % string: 7900 → "79%" */
function bpsToPercent(bps: bigint | number): string {
  return `${Number(bps) / 100}%`;
}

export function useStaking() {
  const { address } = useAccount();
  const [step, setStep] = useState<StakingStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    type: "stake" | "unstake" | "claim";
    amount?: bigint;
  } | null>(null);

  const {
    writeContract,
    data: txHash,
    error: writeError,
    isPending: isWritePending,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const { data, refetch: refetchPosition } = useReadContracts({
    contracts: [
      // [0] staker principal
      {
        address:      CONTRACT_ADDRESSES.staking,
        abi:          STAKING_ABI,
        functionName: "stakerPrincipal",
        args:         address ? [address] : undefined,
        chainId:      TARGET_CHAIN_ID,
      },
      // [1] pending yield — tuple (stakerPortion, causePortion)
      {
        address:      CONTRACT_ADDRESSES.staking,
        abi:          STAKING_ABI,
        functionName: "pendingYield",
        args:         address ? [address] : undefined,
        chainId:      TARGET_CHAIN_ID,
      },
      // [2] USDC allowance for staking contract
      {
        address:      CONTRACT_ADDRESSES.usdc,
        abi:          ERC20_ABI,
        functionName: "allowance",
        args:         address ? [address, CONTRACT_ADDRESSES.staking] : undefined,
        chainId:      TARGET_CHAIN_ID,
      },
      // [3] USDC balance
      {
        address:      CONTRACT_ADDRESSES.usdc,
        abi:          ERC20_ABI,
        functionName: "balanceOf",
        args:         address ? [address] : undefined,
        chainId:      TARGET_CHAIN_ID,
      },
      // [4] per-staker split (causeShare, stakerShare)
      {
        address:      CONTRACT_ADDRESSES.staking,
        abi:          STAKING_ABI,
        functionName: "getStakerSplit",
        args:         address ? [address] : undefined,
        chainId:      TARGET_CHAIN_ID,
      },
    ],
    query: { enabled: !!address },
  });

  // ─── Derived values ──────────────────────────────────────────────────────

  const stakerPrincipal = (data?.[0]?.result as bigint | undefined) ?? 0n;

  // pendingYield is now a tuple [stakerPortion, causePortion]
  const yieldTuple      = data?.[1]?.result as readonly [bigint, bigint] | undefined;
  const pendingYield    = yieldTuple?.[0] ?? 0n;   // what the staker will receive
  const pendingCause    = yieldTuple?.[1] ?? 0n;   // what the campaign will receive

  const usdcAllowance   = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const usdcBalance     = (data?.[3]?.result as bigint | undefined) ?? 0n;

  // Per-staker split — tuple [causeShare, stakerShare] as uint16
  const splitTuple      = data?.[4]?.result as readonly [number, number] | undefined;
  const causeShareBps   = splitTuple ? BigInt(splitTuple[0]) : 7900n;
  const stakerShareBps  = splitTuple ? BigInt(splitTuple[1]) : 1900n;

  // ─── Actions ─────────────────────────────────────────────────────────────

  const reset = () => {
    setStep("idle");
    setErrorMsg(null);
    setPendingAction(null);
    resetWrite();
  };

  const stakeUSDC = async (amount: bigint) => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);
    setPendingAction({ type: "stake", amount });

    if (!usdcAllowance || usdcAllowance < amount) {
      setStep("approving");
      writeContract({
        address:      CONTRACT_ADDRESSES.usdc,
        abi:          ERC20_ABI,
        functionName: "approve",
        args:         [CONTRACT_ADDRESSES.staking, amount],
        chainId:      TARGET_CHAIN_ID,
      });
      return;
    }
    _doStake(amount);
  };

  const _doStake = (amount: bigint) => {
    setStep("staking");
    writeContract({
      address:      CONTRACT_ADDRESSES.staking,
      abi:          STAKING_ABI,
      functionName: "stake",
      args:         [amount],
      chainId:      TARGET_CHAIN_ID,
    });
  };

  const unstakeUSDC = (amount: bigint) => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);
    setStep("unstaking");
    writeContract({
      address:      CONTRACT_ADDRESSES.staking,
      abi:          STAKING_ABI,
      functionName: "unstake",
      args:         [amount],
      chainId:      TARGET_CHAIN_ID,
    });
  };

  const claimYield = () => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);
    setStep("claiming");
    writeContract({
      address:      CONTRACT_ADDRESSES.staking,
      abi:          STAKING_ABI,
      functionName: "claimYield",
      chainId:      TARGET_CHAIN_ID,
    });
  };

  const harvestYield = () => {
    setErrorMsg(null);
    writeContract({
      address:      CONTRACT_ADDRESSES.staking,
      abi:          STAKING_ABI,
      functionName: "harvestAndDistribute",
      chainId:      TARGET_CHAIN_ID,
    });
  };

  /**
   * Save the staker's personal yield split on-chain.
   * causeShareBpsNew + stakerShareBpsNew must equal 9800.
   */
  const saveSplit = (causeShareNew: number, stakerShareNew: number) => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    if (causeShareNew + stakerShareNew !== 9800) {
      setErrorMsg("Shares must sum to 9800 basis points");
      return;
    }
    setErrorMsg(null);
    setStep("settingsplit");
    writeContract({
      address:      CONTRACT_ADDRESSES.staking,
      abi:          STAKING_ABI,
      functionName: "setYieldSplit",
      args:         [causeShareNew, stakerShareNew],
      chainId:      TARGET_CHAIN_ID,
    });
  };

  const proceedAfterApproval = () => {
    if (pendingAction?.type === "stake" && pendingAction.amount) {
      resetWrite();
      _doStake(pendingAction.amount);
    }
  };

  // ─── State machine (declarative) ─────────────────────────────────────────

  if (isSuccess && (step === "staking" || step === "unstaking" || step === "claiming" || step === "settingsplit")) {
    setStep("success");
    refetchPosition();
  }
  if (isConfirming && (step === "staking" || step === "unstaking" || step === "claiming" || step === "settingsplit")) {
    setStep("confirming");
  }
  if (writeError && step !== "error") {
    setStep("error");
    setErrorMsg(friendlyError(writeError));
  }
  if (isSuccess && step === "approving" && pendingAction?.type === "stake") {
    setStep("staking");
    proceedAfterApproval();
  }

  return {
    stakeUSDC,
    unstakeUSDC,
    claimYield,
    harvestYield,
    saveSplit,
    proceedAfterApproval,
    reset,
    step,
    txHash,
    isConfirming,
    isSuccess,
    errorMsg,
    isProcessing: isWritePending || isConfirming,

    // Position
    stakerPrincipal,
    pendingYield,
    pendingCause,
    usdcAllowance,
    usdcBalance,

    // Formatted
    stakerPrincipalFormatted: formatUSDC(stakerPrincipal),
    pendingYieldFormatted:    formatUSDC(pendingYield),
    pendingCauseFormatted:    formatUSDC(pendingCause),
    usdcBalanceFormatted:     formatUSDC(usdcBalance),

    // Per-staker split
    causeShareBps,
    stakerShareBps,
    causeSharePct:  bpsToPercent(causeShareBps),
    stakerSharePct: bpsToPercent(stakerShareBps),

    refetchPosition,
  };
}
