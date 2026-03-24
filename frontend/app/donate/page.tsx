"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { useDonate } from "../hooks/useDonate";
import { useCampaignStats } from "../hooks/useCampaignStats";
import { FundBraveLogo } from "../components/FundBraveLogo";
import { ProgressBar } from "../components/ProgressBar";
import { CrossChainDonate } from "../components/CrossChainDonate";
import { ManualDonations } from "../components/ManualDonations";
import {
  SUPPORTED_TOKENS,
  SOURCE_CHAINS,
  USDC_DECIMALS,
  getExplorerUrl,
  formatUSDC,
  isBaseChain,
  PRESET_AMOUNTS,
  MIN_DONATION_USD,
  MAX_DONATION_USD,
  HIGH_VALUE_USD,
  type TokenInfo,
} from "../lib/contracts";
import type { Address } from "viem";

export default function DonatePage() {
  const { address, isConnected, chain } = useAccount();
  const stats = useCampaignStats();
  const donate = useDonate();

  const [selectedToken, setSelectedToken] = useState<TokenInfo>(SUPPORTED_TOKENS[0]);
  const [amount, setAmount] = useState("");
  const [isApprovalStep, setIsApprovalStep] = useState(false);
  const [showHighValueWarning, setShowHighValueWarning] = useState(false);

  const usdcDecimals = selectedToken.decimals;
  const parsedAmount = (() => {
    if (!amount) return 0n;
    const parts = amount.split(".");
    const whole = parts[0] || "0";
    const frac = (parts[1] || "").padEnd(usdcDecimals, "0").slice(0, usdcDecimals);
    try {
      return BigInt(whole) * BigInt(10 ** usdcDecimals) + BigInt(frac);
    } catch {
      return 0n;
    }
  })();

  // True when user is connected to a non-Base chain (cross-chain mode)
  const isOnForeignChain = !!chain && !isBaseChain(chain.id);
  // True when user is on a completely unsupported chain (not in SOURCE_CHAINS either)
  const isOnUnknownChain = !!chain && !SOURCE_CHAINS.find((c) => c.chainId === chain.id);

  // FE-H3: Reset all state when wallet disconnects to prevent stale UI
  useEffect(() => {
    if (!isConnected) {
      setAmount("");
      setIsApprovalStep(false);
      setShowHighValueWarning(false);
      donate.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // After approval tx confirms, proceed to donate
  useEffect(() => {
    if (donate.isSuccess && isApprovalStep) {
      setIsApprovalStep(false);
      donate.refetchAllowance();
      // The hook will handle re-calling donateUSDC or donateERC20
    }
  }, [donate.isSuccess]);

  // Track when we enter approval step
  useEffect(() => {
    if (donate.step === "approving") setIsApprovalStep(true);
    if (donate.step === "success")   setIsApprovalStep(false);
  }, [donate.step]);

  const handleDonate = () => {
    if (!parsedAmount || parsedAmount === 0n) return;

    // FE-M2: Ask for confirmation on high-value donations
    if (!showHighValueWarning && parseFloat(amount) >= HIGH_VALUE_USD) {
      setShowHighValueWarning(true);
      return;
    }
    setShowHighValueWarning(false);

    if (selectedToken.isNative) {
      donate.donateETH(parsedAmount);
    } else if (selectedToken.address === SUPPORTED_TOKENS[0].address) {
      // USDC
      if (!donate.usdcAllowance || donate.usdcAllowance < parsedAmount) {
        donate.donateUSDC(parsedAmount); // will approve first
      } else {
        donate.donateUSDC(parsedAmount);
      }
    } else {
      donate.donateERC20(selectedToken.address as Address, parsedAmount);
    }
  };

  const handleContinueAfterApproval = () => {
    donate.proceedAfterApproval(
      selectedToken.address as Address,
      parsedAmount,
      selectedToken.symbol === "USDC"
    );
  };

  if (donate.step === "success") {
    return <SuccessScreen txHash={donate.txHash} amount={amount} token={selectedToken.symbol} onReset={donate.reset} />;
  }

  return (
    <div className="min-h-screen bg-[#09011a]">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <FundBraveLogo className="h-7" />
          </Link>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Campaign progress reminder */}
        <div className="glass rounded-xl p-4 mb-6 flex items-center justify-between">
          <div>
            <div className="text-white/50 text-sm">Campaign raised</div>
            <div className="text-white font-bold">${stats.totalRaisedFormatted} <span className="text-white/40 font-normal">of ${stats.goalMaxFormatted}</span></div>
          </div>
          <div className="w-32">
            <ProgressBar percent={stats.progressPercent} />
            <div className="text-right text-xs text-white/40 mt-1">{stats.progressPercent.toFixed(1)}%</div>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Make a Donation</h1>
        <p className="text-white/50 text-sm mb-8">
          All donations are converted to USDC and held in a transparent multisig treasury.
        </p>

        {/* Unknown / unsupported chain */}
        {isConnected && isOnUnknownChain && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-amber-400 font-medium text-sm">Unsupported network</div>
              <div className="text-white/60 text-xs mt-1">
                Switch to Base Sepolia, Ethereum, Polygon, Arbitrum, or Optimism.
              </div>
            </div>
          </div>
        )}

        {/* Not connected state */}
        {!isConnected && (
          <div className="glass rounded-xl p-8 text-center mb-6">
            <p className="text-white/60 mb-4">Connect your wallet to donate.</p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        )}

        {/* ── Cross-chain mode (non-Base chain) ── */}
        {isConnected && isOnForeignChain && !isOnUnknownChain && (
          <CrossChainDonate
            onSuccess={(hash) => {
              // Route to success screen via same-chain reset so layout is consistent
              donate.reset();
            }}
          />
        )}

        {/* ── Same-chain mode (Base / Base Sepolia) ── */}
        {/* FE-H5: Also guard against unknown chains — isOnUnknownChain implies isOnForeignChain,
            but explicit guard clarifies intent and protects against future logic changes */}
        {isConnected && !isOnForeignChain && !isOnUnknownChain && (
          <>
            {/* Token selector */}
            <div className="mb-6">
              <label className="block text-sm text-white/60 mb-2">Select token</label>
              <div className="grid grid-cols-4 gap-2">
                {SUPPORTED_TOKENS.map((token) => (
                  <button
                    key={token.symbol}
                    onClick={() => { setSelectedToken(token); setAmount(""); }}
                    className={`rounded-xl p-3 text-center text-sm font-medium transition-all ${
                      selectedToken.symbol === token.symbol
                        ? "bg-[#450cf0] text-white shadow-lg shadow-[#450cf0]/30"
                        : "glass text-white/60 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {token.symbol}
                  </button>
                ))}
              </div>
              {selectedToken.symbol !== "USDC" && (
                <p className="text-white/40 text-xs mt-2">
                  {selectedToken.symbol} will be automatically swapped to USDC via DEX.
                </p>
              )}
            </div>

            {/* Amount input */}
            <div className="mb-6">
              <label className="block text-sm text-white/60 mb-2">Amount</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    // FE-H1: Strip non-numeric chars (prevents e, +, -, scientific notation)
                    const sanitized = e.target.value.replace(/[^0-9.]/g, "");
                    // Only allow one decimal point
                    const parts = sanitized.split(".");
                    setAmount(parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : sanitized);
                  }}
                  placeholder="0.00"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-medium focus:outline-none focus:border-[#8762fa] transition-colors pr-20"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">
                  {selectedToken.symbol}
                </span>
              </div>

              {/* Preset amounts */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {PRESET_AMOUNTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmount(p.toString())}
                    className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-white/60 hover:text-white transition-all"
                  >
                    ${p}
                  </button>
                ))}
              </div>

              {amount && parseFloat(amount) > 0 && parseFloat(amount) < MIN_DONATION_USD && (
                <p className="text-amber-400 text-xs mt-2">Minimum donation is ${MIN_DONATION_USD} USDC</p>
              )}
              {amount && parseFloat(amount) > MAX_DONATION_USD && (
                <p className="text-amber-400 text-xs mt-2">Maximum per-transaction is ${MAX_DONATION_USD.toLocaleString()} USDC (circuit breaker limit)</p>
              )}
            </div>

            {/* Cross-chain info pill — informational for users on Base */}
            <div className="glass rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-white">Cross-chain also supported</div>
                <span className="bg-[#450cf0]/20 text-[#8762fa] text-xs px-2 py-1 rounded-full">Via LayerZero</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {SOURCE_CHAINS.filter((c) => !isBaseChain(c.chainId)).map((c) => (
                  <span key={c.chainId} className="text-xs bg-white/5 rounded-lg px-2 py-1 text-white/50">
                    {c.icon} {c.name}
                  </span>
                ))}
              </div>
              <p className="text-white/30 text-xs mt-2">
                Switch network in your wallet to donate from another chain.
              </p>
            </div>

            {/* FE-M2: High-value confirmation prompt */}
            {showHighValueWarning && !donate.isProcessing && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
                <p className="text-amber-400 text-sm font-medium mb-1">Confirm large donation</p>
                <p className="text-white/60 text-xs mb-3">
                  You are about to donate{" "}
                  <strong className="text-white">{amount} {selectedToken.symbol}</strong>.
                  This transaction is permanent and non-refundable. Are you sure?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDonate}
                    className="btn-primary text-sm flex-1"
                  >
                    Yes, donate {amount} {selectedToken.symbol}
                  </button>
                  <button
                    onClick={() => setShowHighValueWarning(false)}
                    className="btn-secondary text-sm flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Error message */}
            {donate.errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4 flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-400 text-sm">{donate.errorMsg}</p>
              </div>
            )}

            {/* Step indicator during approval */}
            {donate.step === "approving" && (
              <StepBanner step={1} total={2} label="Approving token spend…" sub="Please confirm in your wallet" />
            )}
            {donate.step === "donating" && (
              <StepBanner step={2} total={2} label="Submitting donation…" sub="Please confirm in your wallet" />
            )}
            {donate.step === "confirming" && (
              <StepBanner step={2} total={2} label="Confirming on chain…" sub="Waiting for block confirmation" />
            )}

            {/* After approval succeeds, need to proceed */}
            {donate.isSuccess && isApprovalStep && (
              <button
                onClick={handleContinueAfterApproval}
                disabled={donate.isProcessing}
                className="btn-primary w-full text-base mb-4"
              >
                Continue: Submit Donation
              </button>
            )}

            {/* Donate button */}
            {!isApprovalStep && (
              <button
                onClick={handleDonate}
                disabled={!amount || parseFloat(amount) < MIN_DONATION_USD || parseFloat(amount) > MAX_DONATION_USD || donate.isProcessing || showHighValueWarning}
                className="btn-primary w-full text-base disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {donate.isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {donate.step === "approving" ? "Approving…" : "Donating…"}
                  </>
                ) : (
                  `Donate ${amount ? `${amount} ${selectedToken.symbol}` : ""}`
                )}
              </button>
            )}

            <p className="text-center text-white/30 text-xs mt-4">
              Funds go directly to the campaign multisig wallet.
              Transaction is permanent and non-refundable once confirmed.
            </p>
          </>
        )}

        {/* ── Manual / non-EVM donations (always visible) ── */}
        <div className="mt-10">
          <ManualDonations />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepBanner({
  step,
  total,
  label,
  sub,
}: {
  step: number;
  total: number;
  label: string;
  sub: string;
}) {
  return (
    <div className="bg-[#450cf0]/10 border border-[#450cf0]/30 rounded-xl p-4 mb-4 flex items-center gap-3">
      <Loader2 className="w-5 h-5 text-[#8762fa] animate-spin flex-shrink-0" />
      <div>
        <div className="text-white text-sm font-medium">
          Step {step}/{total}: {label}
        </div>
        <div className="text-white/50 text-xs">{sub}</div>
      </div>
    </div>
  );
}

function SuccessScreen({
  txHash,
  amount,
  token,
  onReset,
}: {
  txHash?: `0x${string}`;
  amount: string;
  token: string;
  onReset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#09011a] flex items-center justify-center px-4">
      <div className="glass rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Thank you!</h2>
        <p className="text-white/60 mb-2">
          Your donation of{" "}
          <strong className="text-white">
            {amount} {token}
          </strong>{" "}
          has been confirmed.
        </p>
        <p className="text-white/40 text-sm mb-6">
          You&apos;re helping empower women entrepreneurs in Abeokuta, Nigeria.
        </p>

        {txHash && (
          <a
            href={getExplorerUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 text-[#8762fa] text-sm mb-6 hover:underline"
          >
            <ExternalLink className="w-4 h-4" />
            View transaction
          </a>
        )}

        <div className="flex gap-3">
          <Link href="/" className="btn-secondary flex-1 text-center text-sm">
            Back to campaign
          </Link>
          <button onClick={onReset} className="btn-primary flex-1 text-sm">
            Donate again
          </button>
        </div>
      </div>
    </div>
  );
}
