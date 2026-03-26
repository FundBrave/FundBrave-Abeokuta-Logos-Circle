"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBalance, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, AlertCircle, ExternalLink, DollarSign } from "lucide-react";
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
  PRESET_AMOUNTS_ETH,
  MIN_DONATION_USD,
  MAX_DONATION_USD,
  HIGH_VALUE_USD,
  CONTRACT_ADDRESSES,
  TARGET_CHAIN_ID,
  ERC20_ABI,
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

  // Testnet faucet — calls MockUSDC.mint(address, 1000 USDC) so testers can donate.
  // Uses the same pre-simulation approach as useDonate to bypass MetaMask's RPC gas estimation.
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID });
  const { writeContract: mintToken, data: mintTxHash, isPending: isMinting, reset: resetMint } = useWriteContract();
  const { isSuccess: mintSuccess } = useWaitForTransactionReceipt({
    hash:    mintTxHash,
    chainId: TARGET_CHAIN_ID,
  });
  useEffect(() => {
    if (mintSuccess) {
      donate.refetchBalance();
      donate.refetchAllowance();
      refetchTokenBalance();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mintSuccess]);

  // Balance for the currently selected ERC20 token (DAI, WETH, USDC)
  const { data: tokenBalanceData, refetch: refetchTokenBalance } = useReadContract({
    address:      selectedToken.isNative ? undefined : selectedToken.address as Address,
    abi:          ERC20_ABI,
    functionName: "balanceOf",
    args:         address ? [address] : undefined,
    chainId:      TARGET_CHAIN_ID,
    query:        { enabled: !!address && !selectedToken.isNative, refetchInterval: 10_000 },
  });

  const handleMintTestToken = async (tokenAddress: Address, amount: bigint) => {
    if (!address) return;
    const params = {
      address:      tokenAddress,
      abi:          ERC20_ABI,
      functionName: "mint" as const,
      args:         [address, amount] as const,
      chainId:      TARGET_CHAIN_ID,
    };
    let gas: bigint | undefined;
    if (publicClient) {
      try {
        const { request } = await publicClient.simulateContract({ ...params, account: address });
        if (request.gas && request.gas <= 1_000_000n) gas = request.gas;
      } catch { /* fall through */ }
    }
    mintToken({ ...params, gas: gas ?? 100_000n });
  };

  // ETH balance on Base Sepolia (for display when ETH/WETH token is selected)
  const { data: ethBalance } = useBalance({
    address,
    chainId: TARGET_CHAIN_ID,
    query:   { enabled: !!address, refetchInterval: 10_000 },
  });

  // ETH/WETH live price for displaying USD equivalent below the input
  const [ethPriceUSD, setEthPriceUSD] = useState<number | null>(null);
  useEffect(() => {
    if (!selectedToken.isNative && selectedToken.symbol !== "WETH") return;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd")
      .then((r) => r.json())
      .then((d) => setEthPriceUSD(d?.ethereum?.usd ?? null))
      .catch(() => {});
  }, [selectedToken.symbol]);

  const usdcDecimals = selectedToken.decimals;
  const parsedAmount = (() => {
    if (!amount) return 0n;
    const parts = amount.split(".");
    const whole = parts[0] || "0";
    const frac = (parts[1] || "").padEnd(usdcDecimals, "0").slice(0, usdcDecimals);
    try {
      const result = BigInt(whole) * BigInt(10 ** usdcDecimals) + BigInt(frac);
      // FE-H2: Cap only applies to 6-decimal tokens (USDC).
      // 18-decimal tokens (ETH, WETH, DAI) would exceed the cap in their base units.
      if (selectedToken.decimals === 6) {
        const cap = BigInt(MAX_DONATION_USD) * 1_000_000n;
        return result > cap ? 0n : result;
      }
      return result;
    } catch {
      return 0n;
    }
  })();

  // True when user is connected to a non-Base chain (cross-chain mode)
  const isOnForeignChain = !!chain && !isBaseChain(chain.id);
  // True when user is on a completely unsupported chain (not in SOURCE_CHAINS either)
  const isOnUnknownChain = !!chain && !SOURCE_CHAINS.find((c) => c.chainId === chain.id);

  // FE-H1: Watch `address` (not `isConnected`) so state resets on both disconnect AND wallet switch.
  // isConnected stays true during wallet switch, so watching only it misses the switch case.
  useEffect(() => {
    if (!address) {
      setAmount("");
      setIsApprovalStep(false);
      setShowHighValueWarning(false);
      donate.reset();
    } else {
      // Eagerly fetch balance when wallet connects (in case the query didn't fire automatically)
      donate.refetchBalance();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // After approval tx confirms, automatically proceed to the donation step.
  // Previously this just cleared isApprovalStep without triggering the donate tx —
  // the donation was never sent. Now we call proceedAfterApproval directly.
  useEffect(() => {
    if (donate.isSuccess && isApprovalStep) {
      setIsApprovalStep(false);
      donate.proceedAfterApproval(
        selectedToken.address as Address,
        parsedAmount,
        selectedToken.symbol === "USDC"
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (donate.step === "success") {
    return <SuccessScreen txHash={donate.txHash} amount={amount} token={selectedToken.symbol} onReset={donate.reset} />;
  }

  return (
    <div className="min-h-screen bg-[#0A0E1A]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#111827] border-b border-white/10 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white/60 hover:text-white transition-colors cursor-pointer" aria-label="Back to home">
            <ArrowLeft className="w-4 h-4" />
            <FundBraveLogo className="h-7" />
          </Link>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="avatar" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Campaign progress reminder */}
        <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 mb-6 flex items-center justify-between">
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

        {/* Campaign goal reached — no further donations accepted */}
        {stats.maxGoalReached && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 mb-6 text-center">
            <div className="text-3xl mb-3">🎉</div>
            <h2 className="text-green-400 font-bold text-lg mb-1">Campaign Goal Reached!</h2>
            <p className="text-white/60 text-sm">
              The campaign has raised its full goal of ${stats.goalMaxFormatted} USDC.
              No further donations are being accepted. Thank you to everyone who contributed!
            </p>
          </div>
        )}

        {/* Unknown / unsupported chain */}
        {!stats.maxGoalReached && isConnected && isOnUnknownChain && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-6 flex items-start gap-3">
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
        {!stats.maxGoalReached && !isConnected && (
          <div className="bg-[#111827] border border-white/10 rounded-2xl p-8 text-center mb-6">
            <p className="text-white/60 mb-4">Connect your wallet to donate.</p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        )}

        {/* ── Cross-chain mode (non-Base chain) ── */}
        {!stats.maxGoalReached && isConnected && isOnForeignChain && !isOnUnknownChain && (
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
        {!stats.maxGoalReached && isConnected && !isOnForeignChain && !isOnUnknownChain && (
          <>
            {/* Token selector */}
            <div className="mb-6">
              <label className="block text-sm text-white/60 mb-2">Select token</label>
              <div className="grid grid-cols-4 gap-2">
                {SUPPORTED_TOKENS.map((token) => (
                  <button
                    key={token.symbol}
                    onClick={() => { setSelectedToken(token); setAmount(""); resetMint(); }}
                    className={`rounded-xl p-3 text-center text-sm font-medium transition-all cursor-pointer min-h-11 ${
                      selectedToken.symbol === token.symbol
                        ? "bg-[#F97316] text-white shadow-lg shadow-[#F97316]/30"
                        : "bg-[#111827] border border-white/10 text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                    aria-label={`Select ${token.symbol}`}
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
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-lg font-medium focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]/20 transition-colors pr-20"
                  aria-label="Donation amount"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 font-medium">
                  {selectedToken.symbol}
                </span>
              </div>

              {/* Preset amounts — token-aware */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {(selectedToken.isNative || selectedToken.symbol === "WETH"
                  ? PRESET_AMOUNTS_ETH
                  : PRESET_AMOUNTS
                ).map((p) => (
                  <button
                    key={p}
                    onClick={() => setAmount(p.toString())}
                    className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white/60 hover:text-white transition-all cursor-pointer min-h-9"
                    aria-label={`Preset: ${p} ${selectedToken.symbol}`}
                  >
                    {selectedToken.isNative || selectedToken.symbol === "WETH"
                      ? `${p} ETH`
                      : `$${p}`}
                  </button>
                ))}
              </div>

              {/* USD equivalent for ETH / WETH */}
              {(selectedToken.isNative || selectedToken.symbol === "WETH") && amount && parseFloat(amount) > 0 && (
                <p className="text-white/40 text-xs mt-2">
                  {ethPriceUSD
                    ? `≈ $${(parseFloat(amount) * ethPriceUSD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                    : "Fetching price…"}
                </p>
              )}

              {amount && parseFloat(amount) > 0 && parseFloat(amount) < MIN_DONATION_USD
                && !selectedToken.isNative && selectedToken.symbol !== "WETH" && (
                <p className="text-amber-400 text-xs mt-2">Minimum donation is ${MIN_DONATION_USD} USDC</p>
              )}
              {amount && parseFloat(amount) > MAX_DONATION_USD
                && !selectedToken.isNative && selectedToken.symbol !== "WETH" && (
                <p className="text-amber-400 text-xs mt-2">Maximum per-transaction is ${MAX_DONATION_USD.toLocaleString()} USDC (circuit breaker limit)</p>
              )}
            </div>

            {/* Testnet faucet — visible on Base Sepolia for USDC, DAI, WETH */}
            {(TARGET_CHAIN_ID as number) === 84532 && !selectedToken.isNative && (() => {
              const faucetCfg: Record<string, { amount: bigint; label: string }> = {
                USDC: { amount: 1_000n * 1_000_000n,             label: "Get 1,000 test USDC" },
                DAI:  { amount: 1_000n * 10n ** 18n,             label: "Get 1,000 test DAI"  },
                WETH: { amount: 1n    * 10n ** 18n,              label: "Get 1 test WETH"      },
              };
              const cfg = faucetCfg[selectedToken.symbol];
              if (!cfg) return null;
              return (
                <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-white/60 text-xs">Your {selectedToken.symbol} balance</p>
                    <p className="text-white text-sm font-medium">
                      {tokenBalanceData !== undefined
                        ? selectedToken.decimals === 6
                          ? `${formatUSDC(tokenBalanceData as bigint)} ${selectedToken.symbol}`
                          : `${(Number(tokenBalanceData) / 1e18).toFixed(4)} ${selectedToken.symbol}`
                        : <span className="text-white/40">—</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleMintTestToken(selectedToken.address as Address, cfg.amount)}
                    disabled={isMinting || mintSuccess}
                    className="bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    {isMinting ? "Minting…" : mintSuccess ? "✓ Minted" : cfg.label}
                  </button>
                </div>
              );
            })()}

            {/* ETH balance — shown when ETH or WETH is selected */}
            {(selectedToken.isNative || selectedToken.symbol === "WETH") && (
              <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 mb-6 flex items-center justify-between">
                <div>
                  <p className="text-white/60 text-xs">Your ETH balance</p>
                  <p className="text-white text-sm font-medium">
                    {ethBalance
                      ? `${parseFloat(ethBalance.formatted).toFixed(4)} ETH`
                      : <span className="text-white/40">Loading…</span>}
                  </p>
                  {ethBalance && ethPriceUSD && (
                    <p className="text-white/40 text-xs mt-0.5">
                      ≈ ${(parseFloat(ethBalance.formatted) * ethPriceUSD).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Cross-chain info pill — informational for users on Base */}
            <div className="bg-[#111827] border border-white/10 rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-white">Cross-chain also supported</div>
                <span className="bg-[#2563EB]/20 text-[#2563EB] text-xs px-2 py-1 rounded-full">Via LayerZero</span>
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
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-4">
                <p className="text-amber-400 text-sm font-medium mb-1">Confirm large donation</p>
                <p className="text-white/60 text-xs mb-3">
                  You are about to donate{" "}
                  <strong className="text-white">{amount} {selectedToken.symbol}</strong>.
                  This transaction is permanent and non-refundable. Are you sure?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDonate}
                    className="flex-1 bg-[#F97316] hover:bg-[#EA580C] text-white font-medium py-2 px-3 rounded-xl transition-colors text-sm cursor-pointer min-h-10"
                  >
                    Yes, donate {amount} {selectedToken.symbol}
                  </button>
                  <button
                    onClick={() => setShowHighValueWarning(false)}
                    className="flex-1 border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium py-2 px-3 rounded-xl transition-colors text-sm cursor-pointer min-h-10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Error message */}
            {donate.errorMsg && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 mb-4 flex items-start gap-3">
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

            {/* After approval — show a brief "Submitting donation…" state while auto-proceed fires */}
            {donate.isSuccess && isApprovalStep && (
              <StepBanner step={2} total={2} label="Submitting donation…" sub="Approval confirmed — sending donation now" />
            )}

            {/* Donate button */}
            {!isApprovalStep && (
              <button
                onClick={handleDonate}
                disabled={!amount || parseFloat(amount) <= 0 || (!selectedToken.isNative && selectedToken.symbol !== "WETH" && (parseFloat(amount) < MIN_DONATION_USD || parseFloat(amount) > MAX_DONATION_USD)) || donate.isProcessing || showHighValueWarning}
                className="bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl transition-colors w-full text-base flex items-center justify-center gap-2 min-h-12 cursor-pointer"
                aria-label={`Donate ${amount ? `${amount} ${selectedToken.symbol}` : ""}`}
              >
                {donate.isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {donate.step === "approving" ? "Approving…" : "Donating…"}
                  </>
                ) : (
                  <>
                    <DollarSign className="w-4 h-4" />
                    {`Donate ${amount ? `${amount} ${selectedToken.symbol}` : ""}`}
                  </>
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
    <div className="bg-[#2563EB]/10 border border-[#2563EB]/30 rounded-2xl p-4 mb-4 flex items-center gap-3">
      <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin flex-shrink-0" />
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
    <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center px-4">
      <div className="bg-[#111827] border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
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
            className="flex items-center justify-center gap-2 text-[#2563EB] text-sm mb-6 hover:underline cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            View transaction
          </a>
        )}

        <div className="flex gap-3">
          <Link href="/" className="flex-1 border border-white/10 bg-white/5 hover:bg-white/10 text-white font-medium py-2 px-3 rounded-xl transition-colors text-sm text-center cursor-pointer min-h-10 flex items-center justify-center">
            Back to campaign
          </Link>
          <button onClick={onReset} className="flex-1 bg-[#F97316] hover:bg-[#EA580C] text-white font-medium py-2 px-3 rounded-xl transition-colors text-sm cursor-pointer min-h-10">
            Donate again
          </button>
        </div>
      </div>
    </div>
  );
}
