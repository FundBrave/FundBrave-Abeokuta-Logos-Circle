"use client";

/**
 * useCrossChainDonate
 *
 * Handles the full LayerZero cross-chain donation flow:
 *  1. Quote LZ fee  →  quoteCrossChainAction
 *  2. Approve USDC  →  ERC20.approve(bridgeAddress, amount)
 *  3. Send           →  sendCrossChainAction(dstEid, 0, 0, usdcAddress, amount)
 *                       with msg.value = nativeFee
 *
 * The hook auto-skips the approve step if allowance is already sufficient.
 */

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import type { Address } from "viem";
import {
  BRIDGE_ABI,
  ERC20_ABI,
  DST_EID,
  getSourceChain,
} from "../lib/contracts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CrossChainStep =
  | "idle"
  | "quoting"
  | "approving"
  | "sending"
  | "confirming"
  | "success"
  | "error";

export interface CrossChainDonateState {
  step:        CrossChainStep;
  lzFee:       bigint;           // native token fee for LayerZero message
  lzFeeEth:    string;           // formatted for display (e.g. "0.001")
  txHash:      `0x${string}` | undefined;
  errorMsg:    string;
  isProcessing: boolean;

  // Actions
  quote:         (amountUsdc: bigint) => void;
  execute:       (amountUsdc: bigint) => void;
  executeNative: (amountWei: bigint)  => void;  // native ETH cross-chain donation
  reset:         () => void;

  // Derived info about current chain
  sourceChainName:   string;
  sourceChainIcon:   string;
  nativeCurrency:    string;
  bridgeConfigured:  boolean;  // false if bridge address is zero
}

// ─── Constants ────────────────────────────────────────────────────────────────

// action enum value for DONATE in FundBraveBridge
const ACTION_DONATE = 0;
// fundraiser ID — ignored by AbeokutaBridgeReceiver but required by ABI
const FUNDRAISER_ID = 0n;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCrossChainDonate(): CrossChainDonateState {
  const { address, chain } = useAccount();

  const srcChain = chain ? getSourceChain(chain.id) : undefined;
  const bridgeAddress   = srcChain?.bridgeAddress   ?? ("0x0000000000000000000000000000000000000000" as Address);
  const usdcAddress     = srcChain?.usdcAddress     ?? ("0x0000000000000000000000000000000000000000" as Address);
  const bridgeConfigured = bridgeAddress !== "0x0000000000000000000000000000000000000000";

  // ─── State ──────────────────────────────────────────────────────────────────

  const [step,      setStep]      = useState<CrossChainStep>("idle");
  const [lzFee,     setLzFee]     = useState<bigint>(0n);
  const [errorMsg,  setErrorMsg]  = useState("");
  const [txHash,    setTxHash]    = useState<`0x${string}` | undefined>(undefined);
  const [pendingAmount, setPendingAmount] = useState<bigint>(0n);
  const [phase, setPhase] = useState<"approve" | "send">("approve");

  // ─── Reads ──────────────────────────────────────────────────────────────────

  // Check current USDC allowance for the bridge on this source chain
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address:      usdcAddress,
    abi:          ERC20_ABI,
    functionName: "allowance",
    args:         [address ?? "0x0000000000000000000000000000000000000000", bridgeAddress],
    query:        { enabled: !!address && bridgeConfigured },
  });

  // Quote LZ fee — called on demand via `quote()`
  const [quoteAmount, setQuoteAmount] = useState<bigint>(0n);
  const { data: quoteData, isLoading: isQuoting, refetch: refetchQuote } = useReadContract({
    address:      bridgeAddress,
    abi:          BRIDGE_ABI,
    functionName: "quoteCrossChainAction",
    args:         [DST_EID, FUNDRAISER_ID, ACTION_DONATE, quoteAmount],
    query:        { enabled: bridgeConfigured && quoteAmount > 0n },
  });

  // ─── Writes ─────────────────────────────────────────────────────────────────

  const { writeContract, data: writeTxHash, isPending: isWritePending, error: writeError, reset: resetWrite } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: writeTxHash,
  });

  // ─── Effects ────────────────────────────────────────────────────────────────

  // Update LZ fee when quote returns
  useEffect(() => {
    if (quoteData && quoteAmount > 0n) {
      const fee = (quoteData as [bigint, bigint])[0];
      setLzFee(fee);
      if (step === "quoting") setStep("idle");
    }
  }, [quoteData, quoteAmount, step]);

  // Handle tx confirmation
  useEffect(() => {
    if (writeTxHash) {
      setTxHash(writeTxHash);
      if (phase === "approve") {
        setStep("confirming");
      } else {
        setStep("confirming");
      }
    }
  }, [writeTxHash, phase]);

  useEffect(() => {
    if (isTxSuccess && writeTxHash) {
      if (phase === "approve") {
        // Approval done — now send the actual bridge tx
        refetchAllowance().then(() => {
          _sendBridge(pendingAmount);
        });
      } else {
        // Bridge tx done
        setStep("success");
      }
    }
  }, [isTxSuccess, writeTxHash]);

  useEffect(() => {
    if (writeError) {
      const msg = writeError.message?.split("\n")[0] ?? "Transaction failed";
      setErrorMsg(msg);
      setStep("error");
    }
  }, [writeError]);

  // ─── Internal helpers ───────────────────────────────────────────────────────

  const _sendBridge = useCallback((amount: bigint) => {
    if (!bridgeConfigured || lzFee === 0n) return;
    setPhase("send");
    setStep("sending");
    resetWrite();

    writeContract({
      address:      bridgeAddress,
      abi:          BRIDGE_ABI,
      functionName: "sendCrossChainAction",
      args:         [DST_EID, FUNDRAISER_ID, ACTION_DONATE, usdcAddress, amount],
      value:        lzFee,
    });
  }, [bridgeAddress, bridgeConfigured, lzFee, usdcAddress, writeContract, resetWrite]);

  const _sendBridgeNative = useCallback((amount: bigint) => {
    if (!bridgeConfigured || lzFee === 0n) return;
    setPhase("send");
    setStep("sending");
    resetWrite();

    writeContract({
      address:      bridgeAddress,
      abi:          BRIDGE_ABI,
      functionName: "sendCrossChainActionNative",
      args:         [DST_EID, FUNDRAISER_ID, ACTION_DONATE, amount],
      value:        amount + lzFee,  // donation ETH + LZ fee in one msg.value
    });
  }, [bridgeAddress, bridgeConfigured, lzFee, writeContract, resetWrite]);

  // ─── Public API ─────────────────────────────────────────────────────────────

  const quote = useCallback((amountUsdc: bigint) => {
    if (amountUsdc === 0n || !bridgeConfigured) return;
    setQuoteAmount(amountUsdc);
    setStep("quoting");
    refetchQuote();
  }, [bridgeConfigured, refetchQuote]);

  const executeNative = useCallback((amountWei: bigint) => {
    if (!address || amountWei === 0n || !bridgeConfigured) return;
    if (lzFee === 0n) { setErrorMsg("Please wait for fee quote to load."); return; }
    setPendingAmount(amountWei);
    setErrorMsg("");
    _sendBridgeNative(amountWei);
  }, [address, bridgeConfigured, lzFee, _sendBridgeNative]);

  const execute = useCallback((amountUsdc: bigint) => {
    if (!address || amountUsdc === 0n || !bridgeConfigured) return;
    if (lzFee === 0n) {
      setErrorMsg("Please wait for fee quote to load.");
      return;
    }

    setPendingAmount(amountUsdc);
    setErrorMsg("");

    const currentAllowance = (allowance as bigint | undefined) ?? 0n;
    if (currentAllowance >= amountUsdc) {
      // Allowance sufficient — go straight to bridge
      _sendBridge(amountUsdc);
    } else {
      // Need to approve first
      setPhase("approve");
      setStep("approving");
      resetWrite();
      writeContract({
        address:      usdcAddress,
        abi:          ERC20_ABI,
        functionName: "approve",
        args:         [bridgeAddress, amountUsdc],
      });
    }
  }, [address, allowance, bridgeAddress, bridgeConfigured, lzFee, usdcAddress, writeContract, resetWrite, _sendBridge]);

  const reset = useCallback(() => {
    setStep("idle");
    setLzFee(0n);
    setTxHash(undefined);
    setErrorMsg("");
    setPendingAmount(0n);
    setQuoteAmount(0n);
    setPhase("approve");
    resetWrite();
  }, [resetWrite]);

  // ─── Derived display values ──────────────────────────────────────────────────

  const lzFeeEth = lzFee > 0n ? formatUnits(lzFee, 18) : "—";
  const nativeCurrency = srcChain?.nativeCurrency ?? "ETH";

  return {
    step,
    lzFee,
    lzFeeEth,
    txHash,
    errorMsg,
    isProcessing: step === "approving" || step === "sending" || step === "confirming",
    quote,
    execute,
    executeNative,
    reset,
    sourceChainName:   srcChain?.name  ?? "Unknown",
    sourceChainIcon:   srcChain?.icon  ?? "🔗",
    nativeCurrency,
    bridgeConfigured,
  };
}
