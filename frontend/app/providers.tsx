"use client";

import "./lib/gsap-config"; // Register GSAP plugins once before any page mounts

import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia, mainnet, polygon, arbitrum, optimism, sepolia, optimismSepolia } from "wagmi/chains";
import { defineChain } from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";

// Status Network Testnet — not in wagmi/chains yet, define manually
export const statusNetworkTestnet = defineChain({
  id: 1660990954,
  name: "Status Network Testnet",
  nativeCurrency: { name: "Ethereum", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://public.sepolia.rpc.status.network"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://sepoliascan.status.network" },
  },
  testnet: true,
});

// Explicit RPC transports — avoids the default public endpoints that get rate-limited.
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
  chains: [baseSepolia, base, mainnet, polygon, arbitrum, optimism, sepolia, optimismSepolia, statusNetworkTestnet],
  transports: {
    [baseSepolia.id]:            http(rpc.baseSepolia),
    [base.id]:                   http(rpc.base),
    [sepolia.id]:                http(rpc.sepolia),
    [optimismSepolia.id]:        http(rpc.optimismSepolia),
    [mainnet.id]:                http(),
    [polygon.id]:                http(),
    [arbitrum.id]:               http(),
    [optimism.id]:               http(),
    [statusNetworkTestnet.id]:   http("https://public.sepolia.rpc.status.network"),
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
