"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
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
  formatUSDCSmart,
  friendlyError,
} from "../lib/contracts";

export type StakingStep =
  | "idle"
  | "approving"
  | "staking"
  | "unstaking"
  | "claiming"
  | "compounding"
  | "retrying"
  | "rescuing"
  | "settingsplit"
  | "confirming"
  | "success"
  | "error";

/** Format basis points as a human % string: 7900 → "79%" */
function bpsToPercent(bps: bigint | number): string {
  return `${Number(bps) / 100}%`;
}

/** Maps a completed action key → human-readable success label for the UI. */
const ACTION_LABELS: Record<string, string> = {
  stake:       "Staked successfully!",
  unstake:     "Unstaked successfully!",
  claim:       "Yield claimed!",
  compound:    "Yield compounded!",
  settingsplit: "Yield split saved!",
  retry:       "Cause yield sent to campaign!",
  rescue:      "Yield rescued to your wallet!",
};

export function useStaking() {
  const { address } = useAccount();
  const [step, setStep] = useState<StakingStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    type: "stake" | "unstake" | "claim";
    amount?: bigint;
  } | null>(null);
  /** Which action was last dispatched ("stake" | "unstake" | "claim" | etc.) */
  const [lastAction, setLastAction] = useState<string | null>(null);
  // Tracks whether we've already auto-proceeded after an approval so we don't double-fire
  const approvalProcessed = useRef(false);
  // Single toast ID — loading toast is updated in-place through the flow
  const toastId    = useRef<string | number | undefined>(undefined);
  // Label shown in toast on success (set when each action starts)
  const successMsg = useRef<string>("Done!");

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
      // [5] SC-C1: escrowed cause yield (pendingCauseYield)
      {
        address:      CONTRACT_ADDRESSES.staking,
        abi:          STAKING_ABI,
        functionName: "pendingCauseYield",
        args:         address ? [address] : undefined,
        chainId:      TARGET_CHAIN_ID,
      },
      // [6] SC-C1: timestamp when cause yield was first escrowed
      {
        address:      CONTRACT_ADDRESSES.staking,
        abi:          STAKING_ABI,
        functionName: "pendingCauseTimestamp",
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

  // SC-C1: Escrowed cause yield — cause portion that failed to credit to campaign
  const escapedCauseYield    = (data?.[5]?.result as bigint | undefined) ?? 0n;
  const escapedCauseTimestamp = (data?.[6]?.result as bigint | undefined) ?? 0n;
  // Rescue window = 30 days (2592000 seconds); show button once window has opened
  const RESCUE_WINDOW_SEC = 30n * 24n * 3600n;
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  const canRescue = escapedCauseYield > 0n &&
    escapedCauseTimestamp > 0n &&
    nowSec >= escapedCauseTimestamp + RESCUE_WINDOW_SEC;

  // ─── Actions ─────────────────────────────────────────────────────────────

  const reset = () => {
    setStep("idle");
    setErrorMsg(null);
    setPendingAction(null);
    setLastAction(null);
    resetWrite();
  };

  const stakeUSDC = async (amount: bigint) => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);
    approvalProcessed.current = false;
    setLastAction("stake");
    setPendingAction({ type: "stake", amount });

    if (!usdcAllowance || usdcAllowance < amount) {
      setStep("approving");
      // Approve MaxUint256 so future stakes skip approval entirely
      writeContract({
        address:      CONTRACT_ADDRESSES.usdc,
        abi:          ERC20_ABI,
        functionName: "approve",
        args:         [CONTRACT_ADDRESSES.staking, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
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
    setLastAction("unstake");
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
    setLastAction("claim");
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

  /** Gap #8: Re-stake staker's yield portion instead of withdrawing it */
  const compoundYield = () => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);
    setLastAction("compound");
    setStep("compounding");
    writeContract({
      address:      CONTRACT_ADDRESSES.staking,
      abi:          STAKING_ABI,
      functionName: "compound",
      chainId:      TARGET_CHAIN_ID,
    });
  };

  /** SC-C1: Retry sending escrowed cause yield to the campaign contract */
  const retryCauseCredit = () => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);
    setLastAction("retry");
    setStep("retrying");
    writeContract({
      address:      CONTRACT_ADDRESSES.staking,
      abi:          STAKING_ABI,
      functionName: "retryCauseCredit",
      args:         [address],
      chainId:      TARGET_CHAIN_ID,
    });
  };

  /** SC-C1: Rescue escrowed cause yield to self after 30-day window */
  const rescueEscrowedCause = () => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);
    setLastAction("rescue");
    setStep("rescuing");
    writeContract({
      address:      CONTRACT_ADDRESSES.staking,
      abi:          STAKING_ABI,
      functionName: "rescueEscrowedCause",
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
    setLastAction("settingsplit");
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

  // ─── State machine (effects) ──────────────────────────────────────────────

  const _progressSteps: StakingStep[] = ["staking", "unstaking", "claiming", "compounding", "retrying", "rescuing", "settingsplit", "confirming"];

  // Handle tx confirmation and error — only for non-approval steps
  useEffect(() => {
    if (isSuccess && _progressSteps.includes(step)) {
      setStep("success");
      // Delay refetch: Base Sepolia's RPC lags ~1-2s behind confirmed blocks
      setTimeout(() => refetchPosition(), 2000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, step]);

  useEffect(() => {
    if (isConfirming && _progressSteps.includes(step)) {
      setStep("confirming");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirming, step]);

  useEffect(() => {
    if (writeError && step !== "error") {
      if (process.env.NODE_ENV === "development") console.error("[useStaking] writeError:", writeError);
      setStep("error");
      setErrorMsg(friendlyError(writeError));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError]);

  // ─── Toast notifications ──────────────────────────────────────────────────
  useEffect(() => {
    switch (step) {
      case "approving":
        toastId.current = toast.loading("Step 1/2: Approving USDC spend…");
        break;
      case "staking":
        if (toastId.current !== undefined)
          toast.loading("Step 2/2: Confirm stake in wallet…", { id: toastId.current });
        else
          toastId.current = toast.loading("Confirm stake in wallet…");
        successMsg.current = "Staked successfully!";
        break;
      case "unstaking":
        toastId.current = toast.loading("Confirm unstake in wallet…");
        successMsg.current = "Unstaked successfully!";
        break;
      case "claiming":
        toastId.current = toast.loading("Claiming yield…");
        successMsg.current = "Yield claimed!";
        break;
      case "compounding":
        toastId.current = toast.loading("Compounding yield…");
        successMsg.current = "Yield compounded!";
        break;
      case "settingsplit":
        toastId.current = toast.loading("Saving yield split…");
        successMsg.current = "Yield split saved!";
        break;
      case "retrying":
        toastId.current = toast.loading("Retrying cause credit…");
        successMsg.current = "Cause yield sent to campaign!";
        break;
      case "rescuing":
        toastId.current = toast.loading("Rescuing escrowed yield…");
        successMsg.current = "Yield rescued to your wallet!";
        break;
      case "confirming":
        if (toastId.current !== undefined)
          toast.loading("Transaction submitted — confirming…", { id: toastId.current });
        break;
      case "success":
        toast.success(successMsg.current, { id: toastId.current, duration: 6000 });
        toastId.current = undefined;
        break;
      case "error":
        toast.error(errorMsg ?? "Transaction failed", { id: toastId.current, duration: 8000 });
        toastId.current = undefined;
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // After approval confirms, wait briefly for the RPC node to process the new
  // allowance, then proceed to stake. The delay prevents a simulation race
  // condition where estimateGas runs against pre-approval state.
  useEffect(() => {
    if (
      isSuccess &&
      step === "approving" &&
      pendingAction?.type === "stake" &&
      !approvalProcessed.current
    ) {
      approvalProcessed.current = true;
      setStep("staking");
      const amount = pendingAction.amount!;
      // Small delay: gives Base Sepolia's RPC time to reflect the confirmed approval
      const timer = setTimeout(() => {
        resetWrite();
        _doStake(amount);
      }, 1500);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, step, pendingAction]);

  /** Human-readable label for the last completed action (for UI success banners). */
  const successLabel = lastAction ? (ACTION_LABELS[lastAction] ?? "Done!") : "Done!";

  return {
    stakeUSDC,
    unstakeUSDC,
    claimYield,
    compoundYield,
    harvestYield,
    retryCauseCredit,
    rescueEscrowedCause,
    saveSplit,
    proceedAfterApproval,
    reset,
    step,
    txHash,
    isConfirming,
    isSuccess,
    errorMsg,
    isProcessing: isWritePending || isConfirming,
    successLabel,
    lastAction,

    // Position
    stakerPrincipal,
    pendingYield,
    pendingCause,
    usdcAllowance,
    usdcBalance,

    // SC-C1: Escrowed cause yield
    escapedCauseYield,
    escapedCauseTimestamp,
    canRescue,
    // Use smart formatter: shows 6 decimal places for sub-cent amounts
    escapedCauseFormatted: formatUSDCSmart(escapedCauseYield),

    // Formatted — use smart formatter for yield so tiny amounts show as
    // "0.000250" instead of "0.00" (prevents "you earned nothing" confusion)
    stakerPrincipalFormatted: formatUSDC(stakerPrincipal),
    pendingYieldFormatted:    formatUSDCSmart(pendingYield),
    pendingCauseFormatted:    formatUSDCSmart(pendingCause),
    usdcBalanceFormatted:     formatUSDC(usdcBalance),

    // Per-staker split
    causeShareBps,
    stakerShareBps,
    causeSharePct:  bpsToPercent(causeShareBps),
    stakerSharePct: bpsToPercent(stakerShareBps),

    refetchPosition,
  };
}
