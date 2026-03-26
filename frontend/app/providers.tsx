"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia, mainnet, polygon, arbitrum, optimism, sepolia, optimismSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";

// Explicit RPC transports — avoids the default public endpoints that get rate-limited.
// publicnode.com is in the CSP connect-src allowlist (*.publicnode.com).
// Alchemy keys are optional: set NEXT_PUBLIC_ALCHEMY_KEY in .env.local for higher limits.
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY;
const rpc = {
  baseSepolia: alchemyKey
    ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
    : "https://sepolia.base.org",
  base: alchemyKey
    ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : "https://base-rpc.publicnode.com",
  sepolia: alchemyKey
    ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
    : "https://ethereum-sepolia-rpc.publicnode.com",
  optimismSepolia: "https://sepolia.optimism.io",
};

const config = getDefaultConfig({
  appName: "Abeokuta Logos Circle — FundBrave",
  projectId: (() => {
    const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (!id) throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required. Get one at https://cloud.walletconnect.com");
    return id;
  })(),
  // Testnet source chains (sepolia, optimismSepolia) are included so RainbowKit's
  // network switcher can reach them for cross-chain testing. They are harmless in
  // mainnet mode since the SOURCE_CHAINS list controls what the donate UI shows.
  chains: [baseSepolia, base, mainnet, polygon, arbitrum, optimism, sepolia, optimismSepolia],
  // Every chain in the chains array above must have an explicit transport entry.
  // Omitting any chain causes wagmi to receive undefined and crash on destructuring.
  transports: {
    [baseSepolia.id]:     http(rpc.baseSepolia),
    [base.id]:            http(rpc.base),
    [sepolia.id]:         http(rpc.sepolia),
    [optimismSepolia.id]: http(rpc.optimismSepolia),
    [mainnet.id]:         http(),   // viem default (eth-mainnet.g.alchemy.com or cloudflare)
    [polygon.id]:         http(),   // viem default (polygon-rpc.com)
    [arbitrum.id]:        http(),   // viem default (arb1.arbitrum.io)
    [optimism.id]:        http(),   // viem default (mainnet.optimism.io)
  },
  ssr: false,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#2563EB",
            accentColorForeground: "white",
            borderRadius: "medium",
          })}
          modalSize="compact"
        >
          {children}
          <Toaster
            position="bottom-right"
            theme="dark"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: "#1F2937",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#fff",
                borderRadius: "14px",
              },
              duration: 5000,
            }}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
