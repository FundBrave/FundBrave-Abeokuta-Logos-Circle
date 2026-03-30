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
import { useAccount, useBalance, useReadContract } from "wagmi";
import { useCrossChainDonate } from "../hooks/useCrossChainDonate";
import { USDC_DECIMALS, ERC20_ABI, getSourceChain, getExplorerUrl } from "../lib/contracts";

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
const PRESET_AMOUNTS_ETH  = [0.005, 0.01, 0.025, 0.05, 0.1];

export function CrossChainDonate({ onSuccess }: Props) {
  const xc = useCrossChainDonate();
  const { address, chain } = useAccount();

  const [mode, setMode]   = useState<"usdc" | "eth">("usdc");
  const [amount, setAmount] = useState("");
  const [isQuotePending, setIsQuotePending] = useState(false);
  const [ethPriceUSD, setEthPriceUSD] = useState<number | null>(null);

  // Native balance on the current source chain
  const { data: nativeBalance } = useBalance({
    address,
    chainId: chain?.id,
    query:   { enabled: !!address, refetchInterval: 10_000 },
  });

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

  // ETH price for USD equivalent display
  useEffect(() => {
    if (mode !== "eth") return;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
      .then(r => r.json())
      .then(d => setEthPriceUSD(d?.ethereum?.usd ?? null))
      .catch(() => {});
  }, [mode]);

  const decimals    = mode === "usdc" ? USDC_DECIMALS : 18;
  const parsedAmount =
    amount && parseFloat(amount) > 0
      ? BigInt(Math.floor(parseFloat(amount) * 10 ** decimals))
      : 0n;

  // For ETH mode: derive a USDC-equivalent amount to feed into quote()
  // (LayerZero fee is the same regardless of donation token)
  const quoteAmount = mode === "usdc"
    ? parsedAmount
    : ethPriceUSD && parsedAmount > 0n
      ? BigInt(Math.floor(parseFloat(amount) * ethPriceUSD * 1_000_000))
      : 1_000_000n; // fallback: quote for $1 so fee loads even before price arrives

  // Auto-quote when amount changes; mark pending immediately on amount change
  useEffect(() => {
    if (quoteAmount > 0n && xc.bridgeConfigured) {
      setIsQuotePending(true);
    }
    const t = setTimeout(() => {
      if (quoteAmount > 0n && xc.bridgeConfigured) {
        xc.quote(quoteAmount);
      } else {
        setIsQuotePending(false);
      }
    }, 600); // debounce
    return () => clearTimeout(t);
  }, [quoteAmount, xc.bridgeConfigured]);

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

  const nativeSymbol = nativeBalance?.symbol ?? "ETH";
  const nativeFormatted = nativeBalance
    ? parseFloat(nativeBalance.formatted).toFixed(4)
    : null;
  const ethUsdValue =
    ethPriceUSD && amount && parseFloat(amount) > 0
      ? (parseFloat(amount) * ethPriceUSD).toFixed(2)
      : null;

  // ETH cross-chain requires the source-chain FundBraveBridge to have a funded
  // swap adapter (ETH → USDC). On mainnets this is a real DEX; on testnets the
  // mock adapter is not funded, so native donations are not supported.
  const nativeSupported = chain ? !chain.testnet : false;

  // ─── Success state ──────────────────────────────────────────────────────────

  if (xc.step === "success") {
    return (
      <div className="glass rounded-2xl p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-green-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Cross-chain donation sent!</h3>
        <p className="text-white/50 text-sm mb-1">
          Your{" "}
          <strong className="text-white">
            {amount} {mode === "eth" ? nativeSymbol : "USDC"}
          </strong>{" "}
          donation has been submitted.
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
          onClick={() => { xc.reset(); setAmount(""); setMode("usdc"); }}
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

      {/* Token mode toggle */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        <button
          onClick={() => { setMode("usdc"); setAmount(""); }}
          disabled={showSteps}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
            mode === "usdc"
              ? "bg-[#2563EB] text-white shadow"
              : "text-white/50 hover:text-white"
          }`}
        >
          USDC
        </button>
        <button
          onClick={() => { if (nativeSupported) { setMode("eth"); setAmount(""); } }}
          disabled={showSteps || !nativeSupported}
          title={!nativeSupported ? "Native ETH donations are not supported on testnets" : undefined}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all relative ${
            mode === "eth"
              ? "bg-[#2563EB] text-white shadow"
              : nativeSupported
                ? "text-white/50 hover:text-white"
                : "text-white/20 cursor-not-allowed"
          }`}
        >
          {nativeSymbol}
          {!nativeSupported && (
            <span className="absolute -top-1.5 -right-1 text-[9px] bg-white/10 text-white/40 px-1 rounded">
              mainnet
            </span>
          )}
        </button>
      </div>
      {!nativeSupported && (
        <p className="text-xs text-white/30 text-center -mt-2">
          {nativeSymbol} cross-chain requires mainnet bridge liquidity · use USDC on testnet
        </p>
      )}

      {/* USDC balance (USDC mode) */}
      {mode === "usdc" && usdcFormatted !== null && (
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5">
          <span className="text-xs text-white/40">Your USDC balance</span>
          <span className="text-sm font-medium text-white">
            {usdcFormatted} USDC
          </span>
        </div>
      )}

      {/* Native balance (ETH mode) */}
      {mode === "eth" && nativeFormatted !== null && (
        <div className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-2.5">
          <span className="text-xs text-white/40">Your {nativeSymbol} balance</span>
          <span className="text-sm font-medium text-white">
            {nativeFormatted} {nativeSymbol}
          </span>
        </div>
      )}

      {/* Amount input */}
      <div>
        <label className="block text-sm text-white/60 mb-2">
          Amount ({mode === "usdc" ? "USDC" : nativeSymbol})
        </label>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              const sanitized = e.target.value.replace(/[^0-9.]/g, "");
              const parts = sanitized.split(".");
              setAmount(parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized);
            }}
            placeholder="0.00"
            disabled={showSteps}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-medium focus:outline-none focus:border-[#2563EB] transition-colors pr-20 disabled:opacity-50"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">
            {mode === "usdc" ? "USDC" : nativeSymbol}
          </span>
        </div>

        {/* USD equivalent for ETH mode */}
        {mode === "eth" && ethUsdValue && (
          <p className="text-xs text-white/40 mt-1.5 text-right">≈ ${ethUsdValue} USD</p>
        )}

        {/* Preset amounts */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {mode === "usdc"
            ? PRESET_AMOUNTS_USDC.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p.toString())}
                  disabled={showSteps}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white/60 hover:text-white transition-all disabled:opacity-40"
                >
                  ${p}
                </button>
              ))
            : PRESET_AMOUNTS_ETH.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p.toString())}
                  disabled={showSteps}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white/60 hover:text-white transition-all disabled:opacity-40"
                >
                  {p} {nativeSymbol}
                </button>
              ))
          }
        </div>
      </div>

      {/* Fee display */}
      {parsedAmount > 0n && (
        <div className="glass rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">Donation amount</span>
            <span className="text-white font-medium">
              {amount} {mode === "usdc" ? "USDC" : nativeSymbol}
              {mode === "eth" && ethUsdValue && (
                <span className="text-white/40 font-normal text-xs ml-1">(≈${ethUsdValue})</span>
              )}
            </span>
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
              {mode === "usdc" ? (
                <>
                  {amount} USDC{" "}
                  {xc.lzFee > 0n && (
                    <span className="text-white/50 font-normal text-xs">
                      + ~{parseFloat(xc.lzFeeEth).toFixed(6)} {xc.nativeCurrency}
                    </span>
                  )}
                </>
              ) : (
                <>
                  {xc.lzFee > 0n
                    ? `~${(parseFloat(amount) + parseFloat(xc.lzFeeEth)).toFixed(6)}`
                    : amount}{" "}
                  {nativeSymbol}
                  <span className="text-white/40 font-normal text-xs ml-1">
                    (donation + LZ fee)
                  </span>
                </>
              )}
            </span>
          </div>
        </div>
      )}

      {/* Step indicators */}
      {showSteps && (
        <div className="glass rounded-xl p-4 space-y-3">
          {mode === "usdc" && (
            <StepRow
              done={approvalDone}
              active={xc.step === "approving"}
              label={xc.step === "approving" ? "Approving USDC spend…" : "USDC approved"}
            />
          )}
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
        onClick={() =>
          mode === "eth"
            ? xc.executeNative(parsedAmount)
            : xc.execute(parsedAmount)
        }
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
            {xc.step === "approving"  ? "Approving USDC…"    :
             xc.step === "sending"    ? "Sending via bridge…" :
             xc.step === "confirming" ? "Confirming…"         : "Processing…"}
          </>
        ) : (
          <>
            Donate {amount ? `${amount} ${mode === "usdc" ? "USDC" : nativeSymbol}` : ""} via Bridge
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
