"use client";

/**
 * CrossChainDonate — CCTP (Circle Cross-Chain Transfer Protocol)
 *
 * Shown when the user is on Ethereum, Optimism, or Arbitrum.
 *
 * Flow (USDC only — no pre-funded pool required):
 *   Phase 1 (source chain): Approve USDC → depositForBurn → get MessageSent bytes
 *   Phase 2 (Circle API):   Poll iris-api.circle.com for attestation (~2 min L2, ~13 min ETH)
 *   Phase 3 (Base):         Switch chain → completeTransfer → campaign.creditDonation
 */

import { useState, useEffect } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ArrowRight,
  Clock,
  Info,
} from "lucide-react";
import { parseUnits } from "viem";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { useCrossChainDonate } from "../hooks/useCrossChainDonate";
import { USDC_DECIMALS, ERC20_ABI, getSourceChain, getExplorerUrl } from "../lib/contracts";

// ─── Step row sub-component ───────────────────────────────────────────────────

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
  /** Called when the burn confirms — parent keeps this component mounted across the chain switch */
  onPendingTransfer?: () => void;
  /** Called when the user cancels or resets — parent can unmount safely */
  onReset?: () => void;
}

const PRESET_AMOUNTS_USDC = [10, 25, 50, 100, 250];

export function CrossChainDonate({ onSuccess, onPendingTransfer, onReset }: Props) {
  const xc = useCrossChainDonate();
  const { address, chain } = useAccount();
  const [amount, setAmount] = useState("");

  // Tell parent when a transfer is in-flight so it keeps this component mounted
  // across the mandatory Ethereum→Base chain switch in Phase 3.
  useEffect(() => {
    if (xc.step === "waiting_attestation" || xc.step === "switch_to_base") {
      onPendingTransfer?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xc.step]);

  // USDC balance on the current source chain
  const srcUsdcAddress = chain ? getSourceChain(chain.id)?.usdcAddress : undefined;
  const { data: usdcBalanceRaw } = useReadContract({
    address:      srcUsdcAddress,
    abi:          ERC20_ABI,
    functionName: "balanceOf",
    args:         address ? [address] : undefined,
    chainId:      chain?.id,
    query:        { enabled: !!address && !!srcUsdcAddress, refetchInterval: 10_000 },
  });
  const usdcFormatted = usdcBalanceRaw !== undefined
    ? (Number(usdcBalanceRaw as bigint) / 10 ** USDC_DECIMALS).toFixed(2)
    : null;

  const parsedAmount = (() => {
    if (!amount || parseFloat(amount) <= 0) return 0n;
    try { return parseUnits(amount, USDC_DECIMALS); } catch { return 0n; }
  })();

  // Notify parent on success
  useEffect(() => {
    if (xc.step === "success") onSuccess?.(xc.txHash);
  }, [xc.step]);

  // Attestation progress display (Ethereum can take up to ~13 min)
  const waitingForAttestation = xc.step === "waiting_attestation";
  const sourceIsEthereum = chain?.id === 1;

  // ─── Success state ──────────────────────────────────────────────────────────

  if (xc.step === "success") {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Cross-chain donation complete!</h3>
        <p className="text-white/50 text-sm mb-1">
          Your <strong className="text-white">{amount} USDC</strong> donation has been
          credited to the campaign on Base.
        </p>
        <p className="text-white/40 text-xs mb-6">
          Powered by Circle's CCTP — native USDC, no bridges or liquidity pools.
        </p>
        {xc.txHash && (
          <a
            href={`https://basescan.org/tx/${xc.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[#2563EB] text-sm hover:underline mb-6"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            View on Base
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

  // ─── Waiting-for-attestation / switch-to-base state ────────────────────────

  if (xc.step === "waiting_attestation" || xc.step === "switch_to_base") {
    const attestationReady = xc.step === "switch_to_base";
    return (
      <div className="glass rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-[#2563EB] flex-shrink-0" />
          <h3 className="text-white font-semibold">
            {attestationReady ? "Attestation ready — switch to Base" : "Waiting for Circle attestation"}
          </h3>
        </div>

        {!attestationReady ? (
          <>
            <p className="text-white/50 text-sm">
              Circle's attestation service is signing your cross-chain transfer.
              This takes <strong className="text-white">
                {sourceIsEthereum ? "~13 minutes" : "~2 minutes"}
              </strong> for {xc.sourceChainName}.
            </p>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-white/30 mb-1.5">
                <span>Waiting for attestation…</span>
                <span>{xc.attestationProgress}%</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2563EB] rounded-full transition-all duration-1000"
                  style={{ width: `${xc.attestationProgress}%` }}
                />
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-4 text-xs text-white/40 space-y-1">
              <div className="flex justify-between">
                <span>Amount burned</span>
                <span className="text-white">{amount} USDC on {xc.sourceChainName}</span>
              </div>
              <div className="flex justify-between">
                <span>Will be minted on</span>
                <span className="text-white">Base</span>
              </div>
            </div>

            {xc.txHash && (
              <a
                href={getExplorerUrl(xc.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                <ExternalLink className="w-3 h-3" /> View burn transaction
              </a>
            )}
          </>
        ) : (
          <>
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span className="text-green-400 text-sm font-medium">Attestation confirmed by Circle</span>
              </div>
              <p className="text-white/50 text-xs">
                Switch to Base in your wallet, then click below to complete your donation.
              </p>
            </div>

            <button
              onClick={xc.completeMint}
              disabled={xc.step !== "switch_to_base"}
              className="btn-primary w-full text-base flex items-center justify-center gap-2"
            >
              {chain?.id === base.id ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Complete donation on Base
                </>
              ) : (
                <>
                  <ArrowRight className="w-4 h-4" />
                  Switch to Base & Complete
                </>
              )}
            </button>

            <button
              onClick={() => { xc.reset(); onReset?.(); }}
              className="w-full text-xs text-white/30 hover:text-white/50 transition-colors"
            >
              Cancel and start over
            </button>
          </>
        )}
      </div>
    );
  }

  // ─── In-progress step indicators ────────────────────────────────────────────

  const isBurning = xc.step === "approving" || xc.step === "burning";

  // ─── Main form ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Chain banner */}
      <div className="bg-[#2563EB]/10 border border-[#2563EB]/30 rounded-xl p-4 flex items-start gap-3">
        <div className="w-5 h-5 text-[#2563EB] flex-shrink-0 mt-0.5 font-bold text-xs flex items-center justify-center">
          ⬡
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-white">
            Cross-chain via Circle CCTP
          </div>
          <div className="text-xs text-white/50 mt-0.5">
            Donating from{" "}
            <span className="text-white">
              {xc.sourceChainIcon} {xc.sourceChainName}
            </span>{" "}
            → Base
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-white/30 mt-0.5" />
        <span className="text-xs text-white/40 mt-0.5">🔵 Base</span>
      </div>

      {/* CCTP info note */}
      <div className="bg-white/5 rounded-xl p-3 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 text-white/30 flex-shrink-0 mt-0.5" />
        <p className="text-white/40 text-xs">
          USDC is burned on {xc.sourceChainName} and natively minted on Base by Circle.
          No bridge fee — just source-chain gas + Base gas to complete.
          Ethereum takes ~13 min; Optimism/Arbitrum ~2 min.
        </p>
      </div>

      {/* Bridge not configured warning */}
      {!xc.bridgeConfigured && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs">
            CCTP is not configured for <strong>{xc.sourceChainName}</strong>.
            Switch to Ethereum, Optimism, or Arbitrum, or donate directly on Base.
          </p>
        </div>
      )}

      {/* USDC balance */}
      {usdcFormatted !== null && (
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5">
          <span className="text-xs text-white/40">Your USDC balance</span>
          <span className="text-sm font-medium text-white">{usdcFormatted} USDC</span>
        </div>
      )}

      {/* Amount input */}
      <div>
        <label className="block text-sm text-white/60 mb-2">Amount (USDC)</label>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const s = e.target.value.replace(/[^0-9.]/g, "");
              const p = s.split(".");
              setAmount(p.length > 2 ? p[0] + "." + p.slice(1).join("") : s);
            }}
            placeholder="0.00"
            disabled={isBurning || xc.step === "minting"}
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
              disabled={isBurning}
              className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white/60 hover:text-white transition-all disabled:opacity-40"
            >
              ${p}
            </button>
          ))}
        </div>
      </div>

      {/* Cost breakdown */}
      {parsedAmount > 0n && (
        <div className="glass rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Donation amount</span>
            <span className="text-white font-medium">{amount} USDC</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Bridge fee</span>
            <span className="text-green-400 font-medium text-xs">None (CCTP is free)</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Gas (source chain)</span>
            <span className="text-white/40 text-xs">~$0.10–$2 in {xc.nativeCurrency}</span>
          </div>
          <div className="border-t border-white/10 pt-2 flex items-center justify-between text-sm">
            <span className="text-white/60 font-medium">Campaign receives</span>
            <span className="text-white font-bold">{amount} USDC</span>
          </div>
        </div>
      )}

      {/* Step indicators during burn */}
      {isBurning && (
        <div className="glass rounded-xl p-4 space-y-3">
          <StepRow
            done={xc.step === "burning"}
            active={xc.step === "approving"}
            label={xc.step === "approving" ? "Approving USDC spend…" : "USDC approved"}
          />
          <StepRow
            done={false}
            active={xc.step === "burning"}
            label={xc.step === "burning" ? "Burning USDC on source chain…" : "Burn pending"}
          />
          <StepRow
            done={false}
            active={false}
            label="Waiting for Circle attestation"
          />
          <StepRow
            done={false}
            active={false}
            label="Complete mint on Base"
          />
        </div>
      )}

      {/* Minting step (Phase 3) */}
      {xc.step === "minting" && (
        <div className="glass rounded-xl p-4 space-y-3">
          <StepRow done={true}  active={false} label="USDC burned on source chain" />
          <StepRow done={true}  active={false} label="Circle attestation received" />
          <StepRow done={false} active={true}  label="Minting USDC on Base…" />
        </div>
      )}

      {/* Error message */}
      {xc.errorMsg && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-400 text-sm">{xc.errorMsg}</p>
            <button
              onClick={() => { xc.reset(); onReset?.(); }}
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
          !xc.bridgeConfigured
        }
        className="btn-primary w-full text-base disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {xc.isProcessing ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {xc.step === "approving" ? "Approving USDC…" :
             xc.step === "burning"   ? "Burning USDC…"  :
             xc.step === "minting"   ? "Minting on Base…" : "Processing…"}
          </>
        ) : (
          <>
            Donate {amount ? `${amount} USDC` : ""} via CCTP
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Info footer */}
      <p className="text-center text-white/25 text-xs">
        Circle CCTP · USDC burned on {xc.sourceChainName || "source chain"}, minted on Base ·
        100% goes to the campaign
      </p>
    </div>
  );
}
