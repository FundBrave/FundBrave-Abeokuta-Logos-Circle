/**
 * Next.js middleware — sets security headers including a Content-Security-Policy.
 *
 * FE-C1: All pages are statically pre-rendered (○ routes). Next.js App Router bakes
 * inline <script> tags (RSC payload: self.__next_f.push([...])) into the static HTML
 * at build time. These inline scripts cannot carry a per-request nonce because the HTML
 * is frozen at build time, not at request time.
 *
 * CSP design: 'self' allows same-origin /_next/static/ bundles; 'unsafe-inline' allows
 * the RSC payload inline scripts that Next.js generates. Without 'unsafe-inline', React
 * cannot hydrate (inline scripts blocked → useEffect never runs → no ConnectButton, no
 * animations). This is acceptable for a static fundraising site with no user-generated
 * content — the 'self' restriction already blocks scripts from untrusted origins.
 *
 * The nonce is kept for the x-nonce header so any future SSR routes can read it via
 * next/headers and pass it to <Script> components.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Keep generating a nonce for future SSR routes that need it via x-nonce header.
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const nonce = btoa(String.fromCharCode(...array));

  const cspHeader = [
    "default-src 'self'",
    // 'self' — same-origin Next.js chunk files (/_next/static/*)
    // 'unsafe-inline' — Next.js RSC payload inline scripts (self.__next_f.push)
    //   required for React hydration on static pages; ignored by nonce-aware
    //   browsers only when a nonce is also present, so we omit the nonce here.
    // 'unsafe-eval' — dev-only, needed for Next.js React Fast Refresh (hot reload).
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
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
      "https://iris-api.circle.com",    // Circle CCTP attestation polling
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
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
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
