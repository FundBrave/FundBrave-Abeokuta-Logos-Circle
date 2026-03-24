"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia, mainnet, polygon, arbitrum, optimism } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, getDefaultConfig, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";

const config = getDefaultConfig({
  appName: "Abeokuta Logos Circle — FundBrave",
  projectId: (() => {
    const id = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
    if (!id) throw new Error("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required. Get one at https://cloud.walletconnect.com");
    return id;
  })(),
  chains: [baseSepolia, base, mainnet, polygon, arbitrum, optimism],
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
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
