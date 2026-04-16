"use client";

/**
 * useCrossChainDonate — CCTP (Circle Cross-Chain Transfer Protocol)
 *
 * Full cross-chain donation flow:
 *   Phase 1 (source chain — Ethereum / Optimism / Arbitrum):
 *     1. Approve USDC to source TokenMessenger (if allowance < amount)
 *     2. Call TokenMessenger.depositForBurn(amount, BASE_DOMAIN, receiverAddress, usdc)
 *     3. Read the MessageSent event → extract raw `message` bytes
 *
 *   Phase 2 (off-chain — Circle's attestation API):
 *     4. Poll iris-api.circle.com/v1/attestations/{keccak256(message)} every 10s
 *     5. When status = "complete", store the attestation hex
 *
 *   Phase 3 (Base chain):
 *     6. Prompt user to switch to Base
 *     7. Call AbeokutaCCTPReceiver.completeTransfer(message, attestation, donor)
 *
 * Unlike LayerZero, CCTP requires no pre-funded pool and no LZ messaging fee.
 * The only costs are source-chain gas for the burn and Base gas for the mint.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  usePublicClient,
} from "wagmi";
import { keccak256 } from "viem";
import type { Address, Log } from "viem";
import { base } from "wagmi/chains";

// ─── localStorage persistence ─────────────────────────────────────────────────
// Saves pending transfer so a page refresh after the burn (but before the mint)
// doesn't strand the user's USDC.

interface PersistedTransfer {
  messageBytes: `0x${string}`;
  attestation:  `0x${string}` | null;   // null while still polling
  txHash:       `0x${string}`;
}

function storageKey(address: string) {
  return `cctp_pending_${address.toLowerCase()}`;
}
function saveTransfer(address: string, data: PersistedTransfer) {
  try { localStorage.setItem(storageKey(address), JSON.stringify(data)); } catch {}
}
function loadTransfer(address: string): PersistedTransfer | null {
  try {
    const raw = localStorage.getItem(storageKey(address));
    return raw ? (JSON.parse(raw) as PersistedTransfer) : null;
  } catch { return null; }
}
function clearTransfer(address: string) {
  try { localStorage.removeItem(storageKey(address)); } catch {}
}
import {
  ERC20_ABI,
  getSourceChain,
  CCTP_RECEIVER_ABI,
  TOKEN_MESSENGER_ABI,
  CCTP_BASE_RECEIVER_ADDRESS,
  CCTP_BASE_DOMAIN,
} from "../lib/contracts";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CrossChainStep =
  | "idle"
  | "approving"
  | "burning"
  | "waiting_attestation"
  | "switch_to_base"
  | "minting"
  | "success"
  | "error";

export interface CrossChainDonateState {
  step:         CrossChainStep;
  txHash:       `0x${string}` | undefined;
  errorMsg:     string;
  isProcessing: boolean;
  attestationProgress: number;   // 0–100 poll progress

  // Actions
  execute:  (amountUsdc: bigint) => void;
  completeMint: () => void;      // called by UI after user switches to Base
  reset:    () => void;

  // Derived info
  sourceChainName:  string;
  sourceChainIcon:  string;
  nativeCurrency:   string;
  bridgeConfigured: boolean;
}

// ─── CCTP constants ───────────────────────────────────────────────────────────

const ATTESTATION_POLL_INTERVAL_MS = 10_000;  // 10 s between polls
const ATTESTATION_MAX_POLLS = 90;             // 15 min max for Ethereum (~13 min avg)

// Circle's Iris attestation API (no API key required)
function attestationUrl(messageHash: string): string {
  return `https://iris-api.circle.com/v1/attestations/${messageHash}`;
}

// ─── MessageSent event ABI (emitted by Circle's MessageTransmitter on source chain) ──

const MESSAGE_TRANSMITTER_ABI = [
  {
    name:   "MessageSent",
    type:   "event",
    inputs: [{ name: "message", type: "bytes", indexed: false }],
  },
] as const;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCrossChainDonate(): CrossChainDonateState {
  const { address, chain } = useAccount();
  const { switchChain }    = useSwitchChain();
  const publicClient       = usePublicClient();

  const srcChain         = chain ? getSourceChain(chain.id) : undefined;
  const bridgeConfigured = !!srcChain?.tokenMessengerAddress &&
    srcChain.tokenMessengerAddress !== "0x0000000000000000000000000000000000000000";

  // ─── State ─────────────────────────────────────────────────────────────────

  const [step,         setStep]         = useState<CrossChainStep>("idle");
  const [txHash,       setTxHash]       = useState<`0x${string}` | undefined>(undefined);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [pendingAmount, setPendingAmount] = useState<bigint>(0n);
  const [phase,        setPhase]        = useState<"approve" | "burn" | "mint">("approve");

  // Attestation state — persisted to localStorage so page refresh can resume
  const [messageBytes,   setMessageBytes]   = useState<`0x${string}` | undefined>(undefined);
  const [attestation,    setAttestation]    = useState<`0x${string}` | undefined>(undefined);
  const [pollCount,      setPollCount]      = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ─── On mount: restore any pending transfer for this wallet ────────────────
  useEffect(() => {
    if (!address) return;
    const saved = loadTransfer(address);
    if (!saved) return;

    setTxHash(saved.txHash);
    setMessageBytes(saved.messageBytes);

    if (saved.attestation) {
      // Attestation already complete — jump straight to "switch to Base"
      setAttestation(saved.attestation);
      setStep("switch_to_base");
    } else {
      // Attestation still pending — resume polling
      setStep("waiting_attestation");
      setPollCount(0);
      _startAttestationPolling(saved.messageBytes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // ─── Reads ─────────────────────────────────────────────────────────────────

  const usdcAddress          = srcChain?.usdcAddress          ?? ("0x0000000000000000000000000000000000000000" as Address);
  const tokenMessengerAddress = srcChain?.tokenMessengerAddress ?? ("0x0000000000000000000000000000000000000000" as Address);

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address:      usdcAddress,
    abi:          ERC20_ABI,
    functionName: "allowance",
    args:         [address ?? "0x0000000000000000000000000000000000000000", tokenMessengerAddress],
    query:        { enabled: !!address && bridgeConfigured },
  });

  // ─── Writes ────────────────────────────────────────────────────────────────

  const {
    writeContract,
    data:     writeTxHash,
    isPending: isWritePending,
    error:    writeError,
    reset:    resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isTxSuccess, data: txReceipt } =
    useWaitForTransactionReceipt({ hash: writeTxHash });

  // ─── Effects: track write lifecycle ────────────────────────────────────────

  useEffect(() => {
    if (writeTxHash) setTxHash(writeTxHash);
  }, [writeTxHash]);

  useEffect(() => {
    if (!isTxSuccess || !txReceipt) return;

    if (phase === "approve") {
      // Approval confirmed → execute burn
      refetchAllowance().then(() => {
        _sendBurn(pendingAmount);
      });
    } else if (phase === "burn") {
      // Burn confirmed → extract message from logs and start polling
      _extractMessageAndPoll(txReceipt.logs, txReceipt.transactionHash);
    } else if (phase === "mint") {
      // Mint confirmed → clear persisted state and mark success
      if (address) clearTransfer(address);
      setStep("success");
    }
  }, [isTxSuccess, txReceipt]);

  useEffect(() => {
    if (writeError) {
      setErrorMsg(writeError.message?.split("\n")[0] ?? "Transaction failed");
      setStep("error");
    }
  }, [writeError]);

  // Cleanup poll interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ─── Internal: extract MessageSent bytes from burn tx logs ─────────────────

  const _extractMessageAndPoll = useCallback((logs: readonly Log[], burnTxHash?: `0x${string}`) => {
    // The MessageTransmitter on the source chain emits MessageSent(bytes message)
    // We find it by matching the event signature topic
    const MESSAGE_SENT_TOPIC = "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036" as `0x${string}`;

    let rawMessage: `0x${string}` | undefined;
    for (const log of logs) {
      if (log.topics[0] === MESSAGE_SENT_TOPIC && log.data) {
        // ABI-decode the bytes argument from the log data
        // The log data is: offset (32 bytes) + length (32 bytes) + message bytes
        const dataHex = log.data.slice(2); // strip 0x
        const lengthOffset = 64; // skip offset word (32 bytes = 64 hex chars)
        const length = parseInt(dataHex.slice(lengthOffset, lengthOffset + 64), 16);
        const msgHex = dataHex.slice(lengthOffset + 64, lengthOffset + 64 + length * 2);
        rawMessage = ("0x" + msgHex) as `0x${string}`;
        break;
      }
    }

    if (!rawMessage) {
      setErrorMsg("Could not find MessageSent event in burn transaction. Try again.");
      setStep("error");
      return;
    }

    setMessageBytes(rawMessage);
    setStep("waiting_attestation");
    setPollCount(0);
    // Persist immediately — if the page is closed now the burn is irrecoverable
    if (address) {
      saveTransfer(address, { messageBytes: rawMessage, attestation: null, txHash: burnTxHash ?? "0x" });
    }
    _startAttestationPolling(rawMessage);
  }, [address]);

  // ─── Internal: poll Circle attestation API ─────────────────────────────────

  const _startAttestationPolling = useCallback((rawMessage: `0x${string}`) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const messageHash = keccak256(rawMessage);

    const poll = async () => {
      setPollCount((c) => {
        if (c >= ATTESTATION_MAX_POLLS) {
          clearInterval(pollRef.current);
          setErrorMsg("Attestation timed out after 15 minutes. Please try completing the mint manually.");
          setStep("error");
          return c;
        }
        return c + 1;
      });

      try {
        const res = await fetch(attestationUrl(messageHash));
        if (!res.ok) return; // circle returns 404 while pending — just keep polling

        const json = await res.json();
        if (json?.status === "complete" && json?.attestation) {
          clearInterval(pollRef.current);
          const att = json.attestation as `0x${string}`;
          setAttestation(att);
          setStep("switch_to_base");
          // Update persisted record with the attestation so refresh can skip polling
          if (address) {
            const saved = loadTransfer(address);
            if (saved) saveTransfer(address, { ...saved, attestation: att });
          }
        }
      } catch {
        // Network error — continue polling
      }
    };

    pollRef.current = setInterval(poll, ATTESTATION_POLL_INTERVAL_MS);
    poll(); // immediate first attempt
  }, []);

  // ─── Internal: send burn tx ─────────────────────────────────────────────────

  const _sendBurn = useCallback((amount: bigint) => {
    if (!address || !bridgeConfigured) return;
    setPhase("burn");
    setStep("burning");
    resetWrite();

    writeContract({
      address:      tokenMessengerAddress,
      abi:          TOKEN_MESSENGER_ABI,
      functionName: "depositForBurn",
      args: [
        amount,
        CCTP_BASE_DOMAIN,                  // destinationDomain = Base
        // mintRecipient must be bytes32 (padded)
        ("0x000000000000000000000000" + CCTP_BASE_RECEIVER_ADDRESS.slice(2)) as `0x${string}`,
        usdcAddress,
      ],
    });
  }, [address, bridgeConfigured, tokenMessengerAddress, usdcAddress, writeContract, resetWrite]);

  // ─── Public API ────────────────────────────────────────────────────────────

  /** Phase 1: approve (if needed) then burn USDC on source chain */
  const execute = useCallback((amountUsdc: bigint) => {
    if (!address || amountUsdc === 0n || !bridgeConfigured) return;
    setPendingAmount(amountUsdc);
    setErrorMsg("");
    setAttestation(undefined);
    setMessageBytes(undefined);

    const currentAllowance = (allowance as bigint | undefined) ?? 0n;
    if (currentAllowance >= amountUsdc) {
      _sendBurn(amountUsdc);
    } else {
      setPhase("approve");
      setStep("approving");
      resetWrite();
      writeContract({
        address:      usdcAddress,
        abi:          ERC20_ABI,
        functionName: "approve",
        args:         [tokenMessengerAddress, amountUsdc],
      });
    }
  }, [address, allowance, bridgeConfigured, tokenMessengerAddress, usdcAddress, writeContract, resetWrite, _sendBurn]);

  /** Phase 3: after user switches to Base, complete the CCTP mint */
  const completeMint = useCallback(() => {
    if (!address || !messageBytes || !attestation) {
      setErrorMsg("Missing attestation data. Please wait for the attestation to complete.");
      return;
    }

    // Switch to Base if not already there
    if (chain?.id !== base.id) {
      switchChain({ chainId: base.id });
      return;
    }

    setPhase("mint");
    setStep("minting");
    resetWrite();

    writeContract({
      address:      CCTP_BASE_RECEIVER_ADDRESS,
      abi:          CCTP_RECEIVER_ABI,
      functionName: "completeTransfer",
      args:         [messageBytes, attestation, address],
    });
  }, [address, attestation, chain, messageBytes, switchChain, writeContract, resetWrite]);

  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (address) clearTransfer(address);
    setStep("idle");
    setTxHash(undefined);
    setErrorMsg("");
    setPendingAmount(0n);
    setPhase("approve");
    setMessageBytes(undefined);
    setAttestation(undefined);
    setPollCount(0);
    resetWrite();
  }, [address, resetWrite]);

  // ─── Derived values ────────────────────────────────────────────────────────

  const attestationProgress = Math.min(100, Math.round((pollCount / ATTESTATION_MAX_POLLS) * 100));

  return {
    step,
    txHash,
    errorMsg,
    isProcessing: ["approving", "burning", "minting"].includes(step),
    attestationProgress,
    execute,
    completeMint,
    reset,
    sourceChainName:  srcChain?.name ?? "Unknown",
    sourceChainIcon:  srcChain?.icon ?? "🔗",
    nativeCurrency:   srcChain?.nativeCurrency ?? "ETH",
    bridgeConfigured,
  };
}
