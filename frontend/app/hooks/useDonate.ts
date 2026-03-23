"use client";

import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
} from "wagmi";
import {
  CAMPAIGN_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
  TARGET_CHAIN_ID,
} from "../lib/contracts";
import type { Address } from "viem";

export type DonateStep =
  | "idle"
  | "approving"
  | "donating"
  | "confirming"
  | "success"
  | "error";

/**
 * useDonate — handles the full USDC/ERC20/ETH donation flow.
 *
 * Flow for ERC20 (non-USDC):
 *   1. approve(campaign, amount)
 *   2. donateERC20(tokenAddress, amount)
 *
 * Flow for USDC:
 *   1. approve(campaign, amount)
 *   2. donateUSDC(amount)
 *
 * Flow for ETH:
 *   1. donateETH() with msg.value
 */
export function useDonate() {
  const { address } = useAccount();
  const [step, setStep] = useState<DonateStep>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  // Check USDC allowance for the campaign contract
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address:      CONTRACT_ADDRESSES.usdc,
    abi:          ERC20_ABI,
    functionName: "allowance",
    args:         address ? [address, CONTRACT_ADDRESSES.campaign] : undefined,
    chainId:      TARGET_CHAIN_ID,
    query:        { enabled: !!address },
  });

  const reset = () => {
    setStep("idle");
    setErrorMsg(null);
    resetWrite();
  };

  /**
   * Donate USDC directly.
   */
  const donateUSDC = async (amount: bigint) => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);

    try {
      // Step 1: approve if needed
      if (!usdcAllowance || usdcAllowance < amount) {
        setStep("approving");
        writeContract({
          address:      CONTRACT_ADDRESSES.usdc,
          abi:          ERC20_ABI,
          functionName: "approve",
          args:         [CONTRACT_ADDRESSES.campaign, amount],
          chainId:      TARGET_CHAIN_ID,
        });
        return; // tx hash picked up by useWaitForTransactionReceipt
      }

      // Step 2: donate
      setStep("donating");
      writeContract({
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "donateUSDC",
        args:         [amount],
        chainId:      TARGET_CHAIN_ID,
      });
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  /**
   * Donate any ERC20 token (auto-swapped to USDC on-chain).
   */
  const donateERC20 = async (tokenAddress: Address, amount: bigint) => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);

    // Check allowance for the given token
    // (We use a separate read here; this is called before proceeding)
    try {
      setStep("approving");
      // Always re-approve to simplify UX
      writeContract({
        address:      tokenAddress,
        abi:          ERC20_ABI,
        functionName: "approve",
        args:         [CONTRACT_ADDRESSES.campaign, amount],
        chainId:      TARGET_CHAIN_ID,
      });
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Approval failed");
    }
  };

  /**
   * Continue to the donation step after approval completes.
   * Call this after isSuccess is true and step === "approving".
   */
  const proceedAfterApproval = (
    tokenAddress: Address,
    amount: bigint,
    isUSDC: boolean
  ) => {
    setStep("donating");
    resetWrite();

    if (isUSDC) {
      writeContract({
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "donateUSDC",
        args:         [amount],
        chainId:      TARGET_CHAIN_ID,
      });
    } else {
      writeContract({
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "donateERC20",
        args:         [tokenAddress, amount],
        chainId:      TARGET_CHAIN_ID,
      });
    }
  };

  /**
   * Donate native ETH.
   */
  const donateETH = async (value: bigint) => {
    if (!address) { setErrorMsg("Connect your wallet first"); return; }
    setErrorMsg(null);
    setStep("donating");

    try {
      writeContract({
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "donateETH",
        value,
        chainId:      TARGET_CHAIN_ID,
      });
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  // Update step when tx confirms
  if (isSuccess && (step === "donating" || step === "confirming")) {
    setStep("success");
  }
  if (isConfirming && step === "donating") {
    setStep("confirming");
  }
  if (writeError && step !== "error") {
    setStep("error");
    setErrorMsg(writeError.message);
  }

  return {
    donateUSDC,
    donateERC20,
    donateETH,
    proceedAfterApproval,
    reset,
    step,
    txHash,
    isConfirming,
    isSuccess,
    errorMsg,
    isProcessing: isWritePending || isConfirming,
    usdcAllowance,
    refetchAllowance,
  };
}
