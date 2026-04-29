"use client";

import "./lib/gsap-config"; // Register GSAP plugins once before any page mounts

import { WagmiProvider, http } from "wagmi";
import { base, baseSepolia, mainnet, arbitrum, optimism } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";

// Explicit RPC transports — avoids the default public endpoints that get rate-limited.
const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_KEY;
const rpc = {
  baseSepolia: alchemyKey
    ? `https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`
    : "https://sepolia.base.org",
  base: alchemyKey
    ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : "https://mainnet.base.org",
};

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://abeokuta.fundbrave.com";

const config = getDefaultConfig({
  appName: "Abeokuta Logos Circle — FundBrave",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  appUrl,
  appDescription: "Fund online education courses for women entrepreneurs in Abeokuta, Nigeria.",
  chains: [base, baseSepolia, mainnet, arbitrum, optimism],
  transports: {
    [base.id]:        http(rpc.base),
    [baseSepolia.id]: http(rpc.baseSepolia),
    [mainnet.id]:     http(),
    [arbitrum.id]:    http(),
    [optimism.id]:    http(),
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
