"use client";

/**
 * CrossChainDonate
 *
 * Full UI for cross-chain donations via FundBraveBridge + LayerZero V2.
 * Shown automatically when the user is connected to a non-Base chain.
 *
 * Flow:
 *   1. User enters USDC amount
 *   2. Fee is quoted from FundBraveBridge.quoteCrossChainAction
 *   3. User clicks "Donate" → hook handles approve (if needed) → sendCrossChainAction
 *   4. LayerZero V2 relays message to Base
 *   5. AbeokutaBridgeReceiver.handleCrossChainDonation → AbeokutaCampaign.creditDonation
 */

import { useState, useEffect } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Zap,
  Info,
} from "lucide-react";
import { useCrossChainDonate } from "../hooks/useCrossChainDonate";
import { USDC_DECIMALS, getExplorerUrl } from "../lib/contracts";

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepRow({ done, active, label }: { done: boolean; active: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${active ? "text-white" : done ? "text-green-400" : "text-white/30"}`}>
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
      ) : active ? (
        <Loader2 className="w-4 h-4 animate-spin text-[#7C3AED] flex-shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0" />
      )}
      {label}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  onSuccess?: (txHash: `0x${string}` | undefined) => void;
}

const PRESET_AMOUNTS_USDC = [10, 25, 50, 100, 250];

export function CrossChainDonate({ onSuccess }: Props) {
  const xc = useCrossChainDonate();

  const [amount, setAmount] = useState("");
  // FE-H3: Track whether a fresh quote is still pending (amount changed but debounce hasn't fired
  // yet, or quote is in flight). Keeps the button disabled during the 600ms debounce window so the
  // user cannot submit with a stale fee from a previous amount.
  const [isQuotePending, setIsQuotePending] = useState(false);

  const parsedAmount =
    amount && parseFloat(amount) > 0
      ? BigInt(Math.floor(parseFloat(amount) * 10 ** USDC_DECIMALS))
      : 0n;

  // Auto-quote when amount changes; mark pending immediately on amount change
  useEffect(() => {
    if (parsedAmount > 0n && xc.bridgeConfigured) {
      setIsQuotePending(true);
    }
    const t = setTimeout(() => {
      if (parsedAmount > 0n && xc.bridgeConfigured) {
        xc.quote(parsedAmount);
      } else {
        setIsQuotePending(false);
      }
    }, 600); // debounce
    return () => clearTimeout(t);
  }, [parsedAmount, xc.bridgeConfigured]);

  // Clear isQuotePending once the quote step finishes (step leaves "quoting")
  useEffect(() => {
    if (xc.step !== "quoting") {
      setIsQuotePending(false);
    }
  }, [xc.step]);

  // Notify parent on success
  useEffect(() => {
    if (xc.step === "success") {
      onSuccess?.(xc.txHash);
    }
  }, [xc.step]);

  // ─── Success state ──────────────────────────────────────────────────────────

  if (xc.step === "success") {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Cross-chain donation sent!</h3>
        <p className="text-white/50 text-sm mb-1">
          Your <strong className="text-white">{amount} USDC</strong> donation has been submitted.
        </p>
        <p className="text-white/40 text-xs mb-6">
          LayerZero will deliver it to Base in ~2 minutes.
          It will appear in the campaign feed once confirmed on-chain.
        </p>

        {xc.txHash && (
          <a
            href={getExplorerUrl(xc.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[#2563EB] text-sm hover:underline mb-6"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View source transaction
          </a>
        )}

        <button
          onClick={() => { xc.reset(); setAmount(""); }}
          className="btn-secondary w-full text-sm"
        >
          Donate again
        </button>
      </div>
    );
  }

  // ─── Main form ──────────────────────────────────────────────────────────────

  const showSteps = xc.step === "approving" || xc.step === "sending" || xc.step === "confirming";
  // "success" causes an early return above, so TypeScript narrows it out here.
  // approvalDone is true once we've moved past "approving" to any later step.
  const approvalDone = xc.step === "sending" || xc.step === "confirming";

  return (
    <div className="space-y-5">
      {/* Chain banner */}
      <div className="bg-[#2563EB]/10 border border-[#2563EB]/30 rounded-xl p-4 flex items-start gap-3">
        <Zap className="w-5 h-5 text-[#2563EB] flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-sm font-medium text-white">
            Cross-chain via LayerZero V2
          </div>
          <div className="text-xs text-white/50 mt-0.5">
            Donating from{" "}
            <span className="text-white">
              {xc.sourceChainIcon} {xc.sourceChainName}
            </span>{" "}
            → Base Sepolia
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-white/30 mt-0.5" />
        <span className="text-xs text-white/40 mt-0.5">🔵 Base</span>
      </div>

      {/* Bridge not configured warning */}
      {!xc.bridgeConfigured && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs">
            The bridge contract for <strong>{xc.sourceChainName}</strong> has not been deployed yet.
            Switch to Base Sepolia for direct donations, or check back later.
          </p>
        </div>
      )}

      {/* Amount input */}
      <div>
        <label className="block text-sm text-white/60 mb-2">Amount (USDC)</label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="1"
            step="any"
            disabled={showSteps}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-medium focus:outline-none focus:border-[#2563EB] transition-colors pr-20 disabled:opacity-50"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">
            USDC
          </span>
        </div>

        {/* Preset amounts */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {PRESET_AMOUNTS_USDC.map((p) => (
            <button
              key={p}
              onClick={() => setAmount(p.toString())}
              disabled={showSteps}
              className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white/60 hover:text-white transition-all disabled:opacity-40"
            >
              ${p}
            </button>
          ))}
        </div>
      </div>

      {/* Fee display */}
      {parsedAmount > 0n && (
        <div className="glass rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Donation amount</span>
            <span className="text-white font-medium">{amount} USDC</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-white/50">
              LayerZero fee
              <Info className="w-3 h-3 text-white/30" />
            </span>
            {xc.step === "quoting" ? (
              <span className="flex items-center gap-1 text-white/40 text-xs">
                <Loader2 className="w-3 h-3 animate-spin" /> Estimating…
              </span>
            ) : xc.lzFee > 0n ? (
              <span className="text-white font-medium">
                ~{parseFloat(xc.lzFeeEth).toFixed(6)} {xc.nativeCurrency}
              </span>
            ) : (
              <span className="text-white/30 text-xs">Enter amount above</span>
            )}
          </div>
          <div className="border-t border-white/10 pt-2 flex items-center justify-between text-sm">
            <span className="text-white/60 font-medium">You pay</span>
            <span className="text-white font-bold">
              {amount} USDC{" "}
              {xc.lzFee > 0n && (
                <span className="text-white/50 font-normal text-xs">
                  + ~{parseFloat(xc.lzFeeEth).toFixed(6)} {xc.nativeCurrency}
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Step indicators */}
      {showSteps && (
        <div className="glass rounded-xl p-4 space-y-3">
          <StepRow
            done={approvalDone}
            active={xc.step === "approving"}
            label={xc.step === "approving" ? "Approving USDC spend…" : "USDC approved"}
          />
          {/* done=false: "success" step triggers the early return above, so this row is never in "done" state */}
          <StepRow
            done={false}
            active={xc.step === "sending" || xc.step === "confirming"}
            label={
              xc.step === "sending"    ? "Submitting bridge transaction…" :
              xc.step === "confirming" ? "Waiting for confirmation…" :
              "Donation sent via bridge"
            }
          />
          <StepRow
            done={false}
            active={false}
            label="LayerZero relays to Base (~2 min)"
          />
        </div>
      )}

      {/* Error message */}
      {xc.errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 text-sm">{xc.errorMsg}</p>
            <button
              onClick={() => xc.reset()}
              className="text-red-400/60 text-xs mt-1 hover:text-red-400 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* CTA button */}
      <button
        onClick={() => xc.execute(parsedAmount)}
        disabled={
          !amount ||
          parsedAmount === 0n ||
          xc.isProcessing ||
          isQuotePending ||          // FE-H3: block during 600ms debounce gap
          xc.step === "quoting" ||   // also block while quote is in flight
          !xc.bridgeConfigured ||
          xc.lzFee === 0n
        }
        className="btn-primary w-full text-base disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {xc.isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {xc.step === "approving"  ? "Approving USDC…"   :
             xc.step === "sending"    ? "Sending via bridge…" :
             xc.step === "confirming" ? "Confirming…"        : "Processing…"}
          </>
        ) : (
          <>
            Donate {amount ? `${amount} USDC` : ""} via Bridge
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Info footer */}
      <p className="text-center text-white/25 text-xs">
        LayerZero V2 cross-chain message · Arrives on Base in ~2 minutes ·
        All USDC goes to the campaign multisig
      </p>
    </div>
  );
}
