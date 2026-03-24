/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@rainbow-me/rainbowkit"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
  // Security headers are set dynamically per-request in middleware.ts
  // (which generates a per-request CSP nonce — not possible in static headers here)
};

module.exports = nextConfig;
