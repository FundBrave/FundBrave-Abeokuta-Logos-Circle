"use client";

import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useBalance, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDonate } from "../hooks/useDonate";
import { useCampaignStats } from "../hooks/useCampaignStats";
import { SubPageNav } from "../components/sections/SubPageNav";
import { Footer } from "../components/sections/Footer";
import { CrossChainDonate } from "../components/CrossChainDonate";
import { DonateCampaignBanner } from "../components/sections/DonateCampaignBanner";
import { DonateTokenSelector } from "../components/sections/DonateTokenSelector";
import { DonateAmountInput } from "../components/sections/DonateAmountInput";
import { DonateSummaryCard } from "../components/sections/DonateSummaryCard";
import { DonateCrossChainInfo } from "../components/sections/DonateCrossChainInfo";
import { DonateManualSection } from "../components/sections/DonateManualSection";
import { DonateTransparencyNote } from "../components/sections/DonateTransparencyNote";
import { DonateSuccessScreen } from "../components/sections/DonateSuccessScreen";
import {
  SUPPORTED_TOKENS,
  SOURCE_CHAINS,
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

  // ── Testnet faucet — calls MockUSDC.mint(address, 1000 USDC) so testers can donate. ──
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

  // ETH balance on Base Sepolia
  const { data: ethBalance } = useBalance({
    address,
    chainId: TARGET_CHAIN_ID,
    query:   { enabled: !!address, refetchInterval: 10_000 },
  });

  // ETH/WETH live price for displaying USD equivalent
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

  const isOnForeignChain = !!chain && !isBaseChain(chain.id);
  const isOnUnknownChain = !!chain && !SOURCE_CHAINS.find((c) => c.chainId === chain.id);
  const displaySymbol = selectedToken.symbol;

  // FE-H1: Watch `address` (not `isConnected`) so state resets on both disconnect AND wallet switch.
  useEffect(() => {
    if (!address) {
      setAmount("");
      setIsApprovalStep(false);
      setShowHighValueWarning(false);
      donate.reset();
    } else {
      donate.refetchBalance();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // After approval tx confirms, automatically proceed to the donation step.
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
      donate.donateUSDC(parsedAmount);
    } else {
      donate.donateERC20(selectedToken.address as Address, parsedAmount);
    }
  };

  const handleTokenSelect = (token: TokenInfo) => {
    setSelectedToken(token);
    setAmount("");
    resetMint();
  };

  // ── Success state ──
  if (donate.step === "success") {
    return (
      <DonateSuccessScreen
        txHash={donate.txHash}
        amount={amount}
        token={selectedToken.symbol}
        onReset={donate.reset}
      />
    );
  }

  return (
    <div className="min-h-screen bg-surface-container-lowest text-on-surface font-body">
      <SubPageNav />

      <main className="pt-32 pb-24 px-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* 1. Mini Campaign Progress Banner */}
          <DonateCampaignBanner />

          {/* 2. Page Title Area */}
          <div className="text-center space-y-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-tertiary-container/30 to-tertiary/10 border border-tertiary/20 shadow-[0_0_40px_rgba(181,78,0,0.15)]">
              <span
                className="material-symbols-outlined text-tertiary !text-5xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                favorite
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold font-headline tracking-tighter text-on-surface">
              Make a Donation
            </h1>
            <p className="text-on-surface-variant max-w-lg mx-auto leading-relaxed">
              Supporting women entrepreneurs in{" "}
              <span className="text-on-surface font-semibold">Abeokuta</span>.
              All contributions are secured via a multisig treasury and converted
              to USDC for transparent local distribution.
            </p>
          </div>

          {/* Campaign goal reached — no further donations accepted */}
          {stats.maxGoalReached && (
            <div className="glass-card rounded-2xl p-6 border border-green-500/20 text-center space-y-3">
              <div className="text-3xl">🎉</div>
              <h2 className="text-green-400 font-headline font-bold text-lg">Campaign Goal Reached!</h2>
              <p className="text-on-surface-variant text-sm">
                The campaign has raised its full goal of ${stats.goalMaxFormatted} USDC.
                No further donations are being accepted. Thank you to everyone who contributed!
              </p>
            </div>
          )}

          {/* Unknown / unsupported chain */}
          {!stats.maxGoalReached && isConnected && isOnUnknownChain && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-400 flex-shrink-0 mt-0.5">
                warning
              </span>
              <div>
                <div className="text-amber-400 font-medium text-sm">
                  Unsupported network
                </div>
                <div className="text-on-surface-variant text-xs mt-1">
                  Switch to Base Sepolia, Ethereum, Polygon, Arbitrum, or
                  Optimism.
                </div>
              </div>
            </div>
          )}

          {/* Not connected state */}
          {!stats.maxGoalReached && !isConnected && (
            <div className="glass-card rounded-2xl p-8 text-center border border-outline-variant/15">
              <p className="text-on-surface-variant mb-4">
                Connect your wallet to donate.
              </p>
              <div className="flex justify-center">
                <ConnectButton />
              </div>
            </div>
          )}

          {/* ── Cross-chain mode (non-Base chain) ── */}
          {!stats.maxGoalReached && isConnected && isOnForeignChain && !isOnUnknownChain && (
            <CrossChainDonate
              onSuccess={() => {
                donate.reset();
              }}
            />
          )}

          {/* ── Same-chain mode (Base / Base Sepolia) ── */}
          {!stats.maxGoalReached && isConnected && !isOnForeignChain && !isOnUnknownChain && (
            <>
              {/* 3. Main Donation Card */}
              <section className="glass-card rounded-2xl p-2 md:p-8 border border-outline-variant/15 space-y-10 shadow-2xl relative overflow-hidden">
                {/* Decorative Glow */}
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-primary-container/10 blur-[100px] pointer-events-none" />
                <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-tertiary-container/10 blur-[100px] pointer-events-none" />

                {/* Section A: Token Selector */}
                <DonateTokenSelector
                  tokens={SUPPORTED_TOKENS}
                  selectedToken={selectedToken}
                  onSelect={handleTokenSelect}
                />

                {/* Section B: Amount Input */}
                <DonateAmountInput
                  amount={amount}
                  onChange={setAmount}
                  tokenSymbol={selectedToken.symbol}
                  presets={selectedToken.isNative || selectedToken.symbol === "WETH" ? PRESET_AMOUNTS_ETH : PRESET_AMOUNTS}
                />

                {/* ETH/WETH USD equivalent */}
                {(selectedToken.isNative || selectedToken.symbol === "WETH") && amount && ethPriceUSD && (
                  <p className="text-on-surface-variant/60 text-xs -mt-6">
                    ≈ ${(parseFloat(amount) * ethPriceUSD).toFixed(2)} USD
                  </p>
                )}

                {/* Token balance display */}
                {address && !selectedToken.isNative && tokenBalanceData !== undefined && (
                  <div className="flex items-center justify-between text-xs text-on-surface-variant/60 -mt-6">
                    <span>
                      Balance: {(Number(tokenBalanceData) / 10 ** selectedToken.decimals).toFixed(selectedToken.decimals === 6 ? 2 : 4)} {displaySymbol}
                    </span>
                    {/* Testnet faucet  
                    <button
                      onClick={() => handleMintTestToken(selectedToken.address as Address, BigInt(1000) * BigInt(10 ** selectedToken.decimals))}
                      disabled={isMinting}
                      className="text-primary hover:text-primary-fixed-dim transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {isMinting ? "Minting…" : `Mint 1,000 ${displaySymbol} (testnet)`}
                    </button>*/}
                    <div></div>
                  </div>
                )}

                {/* ETH balance display */}
                {address && selectedToken.isNative && ethBalance && (
                  <div className="flex items-center justify-between text-xs text-on-surface-variant/60 -mt-6">
                    <span>Balance: {parseFloat(ethBalance.formatted).toFixed(4)} ETH</span>
                  </div>
                )}

                {/* Section C: Donation Summary */}
                {amount && parseFloat(amount) > 0 && (
                  <DonateSummaryCard
                    amount={amount}
                    tokenSymbol={selectedToken.symbol}
                  />
                )}

                {/* Section D: Cross-chain info */}
                <DonateCrossChainInfo />

                {/* FE-M2: High-value confirmation prompt */}
                {showHighValueWarning && !donate.isProcessing && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3">
                    <p className="text-amber-400 text-sm font-medium">
                      Confirm large donation
                    </p>
                    <p className="text-on-surface-variant text-xs">
                      You are about to donate{" "}
                      <strong className="text-on-surface">
                        {amount} {displaySymbol}
                      </strong>
                      . This transaction is permanent and non-refundable. Are you
                      sure?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDonate}
                        className="flex-1 bg-tertiary-container text-on-tertiary-container font-medium py-2 px-3 rounded-xl transition-all text-sm cursor-pointer hover:brightness-110 active:scale-[0.98]"
                      >
                        Yes, donate {amount} {displaySymbol}
                      </button>
                      <button
                        onClick={() => setShowHighValueWarning(false)}
                        className="flex-1 border border-outline-variant/20 bg-surface-container-high hover:bg-surface-variant text-on-surface font-medium py-2 px-3 rounded-xl transition-colors text-sm cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Error message */}
                {donate.errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-red-400 flex-shrink-0 mt-0.5">
                      error
                    </span>
                    <p className="text-red-400 text-sm">{donate.errorMsg}</p>
                  </div>
                )}

                {/* Step indicators */}
                {donate.step === "approving" && (
                  <StepBanner
                    step={1}
                    total={2}
                    label="Approving token spend…"
                    sub="Please confirm in your wallet"
                  />
                )}
                {donate.step === "donating" && (
                  <StepBanner
                    step={2}
                    total={2}
                    label="Submitting donation…"
                    sub="Please confirm in your wallet"
                  />
                )}
                {donate.step === "confirming" && (
                  <StepBanner
                    step={2}
                    total={2}
                    label="Confirming on chain…"
                    sub="Waiting for block confirmation"
                  />
                )}

                {/* After approval — auto-proceed fires, show brief status */}
                {donate.isSuccess && isApprovalStep && (
                  <StepBanner step={2} total={2} label="Submitting donation…" sub="Approval confirmed — sending donation now" />
                )}

                {/* Section E: Main CTA */}
                {!isApprovalStep && (
                  <button
                    onClick={handleDonate}
                    disabled={
                      !amount ||
                      parseFloat(amount) <= 0 ||
                      (!selectedToken.isNative && selectedToken.symbol !== "WETH" && (parseFloat(amount) < MIN_DONATION_USD || parseFloat(amount) > MAX_DONATION_USD)) ||
                      donate.isProcessing ||
                      showHighValueWarning
                    }
                    className="w-full bg-gradient-to-r from-tertiary-container to-tertiary hover:brightness-110 text-on-tertiary py-5 rounded-xl font-extrabold font-headline text-lg flex items-center justify-center gap-3 shadow-[0_10px_40px_rgba(181,78,0,0.3)] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    aria-label={`Donate ${amount ? `${amount} ${displaySymbol}` : ""}`}
                  >
                    {donate.isProcessing ? (
                      <>
                        <span className="material-symbols-outlined animate-spin">
                          progress_activity
                        </span>
                        {donate.step === "approving"
                          ? "Approving…"
                          : "Donating…"}
                      </>
                    ) : (
                      <>
                        <span
                          className="material-symbols-outlined"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          favorite
                        </span>
                        Donate Now
                      </>
                    )}
                  </button>
                )}
              </section>

              {/* 4. Manual Donations Section */}
              <DonateManualSection />

              {/* 5. Transparency Note */}
              <DonateTransparencyNote />
            </>
          )}
        </div>
      </main>

      <Footer />
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
    <div className="bg-primary-container/10 border border-primary-container/30 rounded-xl p-4 flex items-center gap-3">
      <span className="material-symbols-outlined text-primary animate-spin flex-shrink-0">
        progress_activity
      </span>
      <div>
        <div className="text-on-surface text-sm font-medium">
          Step {step}/{total}: {label}
        </div>
        <div className="text-on-surface-variant text-xs">{sub}</div>
      </div>
    </div>
  );
}
