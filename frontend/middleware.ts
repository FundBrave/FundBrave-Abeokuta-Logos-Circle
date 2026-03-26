/**
 * Next.js middleware — generates a per-request CSP nonce and sets security headers.
 *
 * FE-C1: Moves CSP from static next.config.js headers (which cannot use dynamic
 * nonces) to middleware so each response gets a fresh cryptographic nonce.
 * `strict-dynamic` propagates trust from the nonce'd entry-point script to
 * scripts it loads dynamically, without needing `unsafe-inline`.
 *
 * The nonce is forwarded as the `x-nonce` request header so layout.tsx can
 * read it via `next/headers` and pass it to <Script> components.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Web Crypto API — available in Edge Runtime (no Node.js crypto import needed)
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const nonce = btoa(String.fromCharCode(...array));

  const cspHeader = [
    "default-src 'self'",
    // strict-dynamic: nonce'd script may load further scripts without unsafe-inline
    // FE-C1: unsafe-eval is only included in dev mode for Next.js React Refresh (hot reload).
    // In production, eval is not needed — wagmi v2/viem use static ABI encoding.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    [
      "connect-src 'self'",
      "https://*.alchemy.com",
      "https://*.walletconnect.com",
      "https://*.walletconnect.org",
      "wss://*.walletconnect.com",
      "wss://*.walletconnect.org",
      "https://api.coingecko.com",
      "https://*.basescan.org",
      "https://blockstream.info",
      "https://*.solana.com",
      // Public RPC endpoints used by wagmi/viem defaults for each chain in providers.tsx
      "https://sepolia.base.org",       // Base Sepolia default RPC
      "https://mainnet.base.org",       // Base mainnet default RPC
      "https://sepolia.optimism.io",    // Optimism Sepolia default RPC
      "https://mainnet.optimism.io",    // Optimism mainnet default RPC
      "https://*.publicnode.com",       // Ethereum Sepolia publicnode RPC
      "https://*.infura.io",            // wagmi/RainbowKit may route through Infura
      "https://cloudflare-eth.com",     // viem mainnet fallback
      "https://eth.merkle.io",          // viem Ethereum mainnet default RPC
      "https://polygon-rpc.com",        // Polygon default RPC
      "https://arb1.arbitrum.io",       // Arbitrum default RPC
      "https://rpc.ankr.com",           // Ankr public RPCs (base_sepolia, etc.)
      "https://api.web3modal.org",      // RainbowKit/Reown remote config
    ].join(" "),
    "frame-src 'self' https://*.walletconnect.com https://*.walletconnect.org",
  ].join("; ");

  // Forward nonce to the app so layout.tsx can use it on <Script> tags
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-DNS-Prefetch-Control", "on");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  return response;
}

export const config = {
  matcher: [
    // Run on all routes except Next.js static assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
