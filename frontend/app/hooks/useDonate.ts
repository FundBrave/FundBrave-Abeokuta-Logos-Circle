"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  usePublicClient,
} from "wagmi";
import {
  CAMPAIGN_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
  TARGET_CHAIN_ID,
  UNISWAP_ROUTER_ADDRESS,
  UNISWAP_ROUTER_ABI,
  WETH_ADDRESS,
  friendlyError,
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
  const publicClient = usePublicClient({ chainId: TARGET_CHAIN_ID });
  const toastId    = useRef<string | number | undefined>(undefined);
  const successMsg = useRef<string>("Donation confirmed!");

  const {
    writeContract,
    data: txHash,
    error: writeError,
    isPending: isWritePending,
    reset: resetWrite,
  } = useWriteContract();

  // chainId is explicit so the hook always polls Base Sepolia (TARGET_CHAIN),
  // regardless of which chain the user's wallet is currently showing.
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash:    txHash,
    chainId: TARGET_CHAIN_ID,
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

  // Read the user's USDC balance (for UI display and testnet faucet gating)
  const {
    data: usdcBalance,
    refetch: refetchBalance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
  } = useReadContract({
    address:      CONTRACT_ADDRESSES.usdc,
    abi:          ERC20_ABI,
    functionName: "balanceOf",
    args:         address ? [address] : undefined,
    chainId:      TARGET_CHAIN_ID,
    query:        { enabled: !!address, refetchInterval: 10_000, staleTime: 0 },
  });

  const reset = () => {
    setStep("idle");
    setErrorMsg(null);
    resetWrite();
  };

  /**
   * Pre-simulate via our configured transport (Ankr) to get a gas estimate, then
   * call writeContract with gas already set.  MetaMask skips its own
   * eth_estimateGas when the tx already has a gas field, so it never calls its
   * built-in (often rate-limited) RPC before the confirmation popup appears.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // Safe gas ceilings per operation type (unused gas is refunded).
  // donateETH/donateERC20 involve a Uniswap swap so need more headroom.
  const GAS_FALLBACK: Record<string, bigint> = {
    approve:     100_000n,
    donateUSDC:  400_000n,
    donateETH:   600_000n,
    donateERC20: 600_000n,
  };

  const simulateAndWrite = async (params: any) => {
    let gas: bigint | undefined;
    if (publicClient && address) {
      try {
        const { request } = await publicClient.simulateContract({
          ...params,
          account: address,
        });
        // Sanity-check: ignore unreasonably large estimates (RPC bug / bad node).
        // A donation or approval should never exceed 1M gas on Base.
        if (request.gas && request.gas <= 1_000_000n) {
          gas = request.gas;
        }
      } catch {
        // Simulation failed — fall through to fallback
      }
    }
    // If simulation gas was bad or unavailable, use a safe per-function fallback
    // rather than letting MetaMask estimate (its estimator can return bad values too).
    const fallback = GAS_FALLBACK[params.functionName] ?? 600_000n;
    writeContract({ ...params, gas: gas ?? fallback });
  };

  /**
   * L-3 / F-007: Get a quote from the Uniswap V2 router and apply 5% slippage.
   * Throws if the quote call fails — callers must handle the error and block the
   * transaction rather than falling back to minUsdcOut=0 (which removes all MEV
   * protection and exposes users to sandwich attacks).
   */
  const getMinUsdcOut = async (path: Address[], amountIn: bigint): Promise<bigint> => {
    if (!publicClient || amountIn === 0n) return 0n;
    const amounts = await publicClient.readContract({
      address:      UNISWAP_ROUTER_ADDRESS,
      abi:          UNISWAP_ROUTER_ABI,
      functionName: "getAmountsOut",
      args:         [amountIn, path],
    });
    const expectedOut = (amounts as bigint[])[amounts.length - 1];
    return expectedOut * 95n / 100n; // 5% slippage tolerance
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
        await simulateAndWrite({
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
      await simulateAndWrite({
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
      await simulateAndWrite({
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
  const proceedAfterApproval = async (
    tokenAddress: Address,
    amount: bigint,
    isUSDC: boolean
  ) => {
    setStep("donating");
    resetWrite();

    if (isUSDC) {
      await simulateAndWrite({
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "donateUSDC",
        args:         [amount],
        chainId:      TARGET_CHAIN_ID,
      });
    } else {
      // L-3: Quote the expected USDC output and apply 5% slippage floor.
      // Path: tokenIn → WETH → USDC (standard V2 route via the wrapped native).
      const minUsdcOut = await getMinUsdcOut(
        [tokenAddress, WETH_ADDRESS, CONTRACT_ADDRESSES.usdc],
        amount
      );
      await simulateAndWrite({
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "donateERC20",
        args:         [tokenAddress, amount, minUsdcOut],
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
      // L-3: Quote the expected USDC output via WETH→USDC path and apply 5% slippage floor.
      const minUsdcOut = await getMinUsdcOut(
        [WETH_ADDRESS, CONTRACT_ADDRESSES.usdc],
        value
      );
      await simulateAndWrite({
        address:      CONTRACT_ADDRESSES.campaign,
        abi:          CAMPAIGN_ABI,
        functionName: "donateETH",
        args:         [minUsdcOut],
        value,
        chainId:      TARGET_CHAIN_ID,
      });
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
    }
  };

  // ─── State machine (effects) ──────────────────────────────────────────────

  useEffect(() => {
    if (isSuccess && (step === "donating" || step === "confirming")) {
      setStep("success");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, step]);

  useEffect(() => {
    if (isConfirming && step === "donating") {
      setStep("confirming");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfirming, step]);

  useEffect(() => {
    if (writeError && step !== "error") {
      console.error("[useDonate] write error:", writeError);
      setStep("error");
      setErrorMsg(friendlyError(writeError));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writeError]);

  // ─── Toast notifications ──────────────────────────────────────────────────

  useEffect(() => {
    switch (step) {
      case "approving":
        toastId.current = toast.loading("Step 1/2: Approving token spend…");
        successMsg.current = "Donation confirmed!";
        break;
      case "donating":
        if (toastId.current !== undefined)
          toast.loading("Step 2/2: Confirm donation in wallet…", { id: toastId.current });
        else
          toastId.current = toast.loading("Confirm donation in wallet…");
        successMsg.current = "Donation confirmed!";
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
    usdcBalance: usdcBalance as bigint | undefined,
    refetchBalance,
    isBalanceLoading,
    isBalanceError,
  };
}
