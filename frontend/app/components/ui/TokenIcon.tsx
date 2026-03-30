"use client";

interface TokenIconProps {
  symbol: string;
  size?: number;
  className?: string;
}

export function TokenIcon({ symbol, size = 24, className = "" }: TokenIconProps) {
  const s = `${size}px`;

  switch (symbol.toUpperCase()) {
    case "USDC":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#2775CA" />
          <path
            d="M20.2 18.4c0-2.1-1.3-2.8-3.8-3.1-1.8-.3-2.2-.7-2.2-1.5s.7-1.3 1.8-1.3c1 0 1.6.4 1.9 1.2.1.1.2.2.3.2h.7c.2 0 .3-.2.3-.3-.3-1.1-1.1-2-2.3-2.2v-1.3c0-.2-.1-.3-.3-.3h-.6c-.2 0-.3.1-.3.3v1.2c-1.6.2-2.6 1.3-2.6 2.6 0 2 1.2 2.7 3.7 3 1.7.3 2.3.8 2.3 1.7s-1 1.5-2.1 1.5c-1.4 0-1.9-.6-2.1-1.4 0-.2-.1-.2-.3-.2h-.7c-.2 0-.3.2-.3.3.3 1.3 1.1 2.2 2.6 2.4v1.3c0 .2.1.3.3.3h.6c.2 0 .3-.1.3-.3V21c1.7-.2 2.7-1.3 2.7-2.6z"
            fill="white"
          />
          <path
            d="M13 24.3c-4.5-1.6-6.8-6.5-5.3-11 .8-2.2 2.5-3.9 4.7-4.7.2-.1.3-.2.3-.4v-.6c0-.2-.1-.3-.3-.3h-.1c-5.2 1.8-8 7.5-6.2 12.7 1.1 3.1 3.5 5.5 6.6 6.6.2.1.4 0 .4-.2v-.6c.1-.3 0-.4-.1-.5zm6 0c-.2-.1-.4 0-.4.2v.6c0 .2.1.4.3.4 5.2-1.8 8-7.5 6.2-12.7-1.1-3.1-3.5-5.5-6.5-6.5-.2-.1-.4 0-.4.2v.6c0 .2.1.3.3.4 4.4 1.6 6.7 6.5 5.1 10.9-.8 2.3-2.5 4-4.6 4.9z"
            fill="white"
          />
        </svg>
      );

    case "ETH":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path d="M16.5 4v8.87l7.5 3.35L16.5 4z" fill="white" fillOpacity="0.6" />
          <path d="M16.5 4L9 16.22l7.5-3.35V4z" fill="white" />
          <path d="M16.5 21.97v6.01L24 17.62l-7.5 4.35z" fill="white" fillOpacity="0.6" />
          <path d="M16.5 27.98v-6.01L9 17.62l7.5 10.36z" fill="white" />
          <path d="M16.5 20.57l7.5-4.35-7.5-3.35v7.7z" fill="white" fillOpacity="0.2" />
          <path d="M9 16.22l7.5 4.35v-7.7L9 16.22z" fill="white" fillOpacity="0.6" />
        </svg>
      );

    case "DAI":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#F5AC37" />
          <path
            d="M16 6L9 16l7 10 7-10-7-10zm0 3.2L21 16l-5 6.8L11 16l5-6.8z"
            fill="white"
          />
          <path d="M16 9.2L11 16l5 6.8L21 16l-5-6.8z" fill="white" fillOpacity="0.5" />
        </svg>
      );

    case "WETH":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#EC4899" />
          <path d="M16.5 4v8.87l7.5 3.35L16.5 4z" fill="white" fillOpacity="0.6" />
          <path d="M16.5 4L9 16.22l7.5-3.35V4z" fill="white" />
          <path d="M16.5 21.97v6.01L24 17.62l-7.5 4.35z" fill="white" fillOpacity="0.6" />
          <path d="M16.5 27.98v-6.01L9 17.62l7.5 10.36z" fill="white" />
          <path d="M16.5 20.57l7.5-4.35-7.5-3.35v7.7z" fill="white" fillOpacity="0.2" />
          <path d="M9 16.22l7.5 4.35v-7.7L9 16.22z" fill="white" fillOpacity="0.6" />
        </svg>
      );

    case "BTC":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#F7931A" />
          <path
            d="M22.6 13.8c.3-2-1.2-3-3.3-3.7l.7-2.7-1.6-.4-.7 2.6-1.3-.3.7-2.6-1.6-.4-.7 2.7-1-.3v-.1l-2.2-.5-.4 1.7s1.2.3 1.2.3c.7.2.8.6.8.9l-.8 3.3c.1 0 .2.1.3.1l-.3-.1-1.1 4.5c-.1.2-.3.5-.7.4 0 .1-1.2-.3-1.2-.3L10 21l2.1.5 1.1.3-.7 2.7 1.6.4.7-2.7 1.3.3-.7 2.7 1.6.4.7-2.7c2.7.5 4.8.3 5.6-2.2.7-1.9-.04-3-1.4-3.7 1-.2 1.8-1 2-2.5zm-3.5 4.9c-.5 2-3.8.9-4.9.6l.9-3.5c1.1.3 4.5.8 4 2.9zm.5-4.9c-.5 1.8-3.4.9-4.4.7l.8-3.2c1 .2 3.9.7 3.6 2.5z"
            fill="white"
          />
        </svg>
      );

    case "SOL":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#000000" />
          {/* Top bar → points right */}
          <path d="M8 12.5h12.5l3.5-3.5H11.5L8 12.5z" fill="url(#sol_g)" />
          {/* Middle bar ← points left */}
          <path d="M24 17.75H11.5L8 14.25h12.5L24 17.75z" fill="url(#sol_g)" />
          {/* Bottom bar → points right */}
          <path d="M8 23h12.5l3.5-3.5H11.5L8 23z" fill="url(#sol_g)" />
          <defs>
            <linearGradient id="sol_g" x1="8" y1="16" x2="24" y2="16" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00FFA3" /><stop offset="1" stopColor="#DC1FFF" />
            </linearGradient>
          </defs>
        </svg>
      );

    case "POLYGON":
    case "MATIC":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#8247E5" />
          <path d="M21.2 13.1c-.4-.2-.9-.2-1.2 0l-2.9 1.7-2 1.1-2.9 1.7c-.4.2-.9.2-1.2 0l-2.3-1.3c-.4-.2-.6-.6-.6-1.1v-2.6c0-.4.2-.9.6-1.1l2.2-1.3c.4-.2.9-.2 1.2 0l2.2 1.3c.4.2.6.6.6 1.1v1.7l2-1.1v-1.7c0-.4-.2-.9-.6-1.1l-4.2-2.4c-.4-.2-.9-.2-1.2 0l-4.3 2.5c-.4.2-.6.6-.6 1v4.9c0 .4.2.9.6 1.1l4.2 2.4c.4.2.9.2 1.2 0l2.9-1.7 2-1.1 2.9-1.7c.4-.2.9-.2 1.2 0l2.2 1.3c.4.2.6.6.6 1.1v2.6c0 .4-.2.9-.6 1.1l-2.2 1.3c-.4.2-.9.2-1.2 0l-2.2-1.3c-.4-.2-.6-.6-.6-1.1v-1.7l-2 1.1v1.7c0 .4.2.9.6 1.1l4.2 2.4c.4.2.9.2 1.2 0l4.2-2.4c.4-.2.6-.6.6-1.1v-4.9c0-.4-.2-.9-.6-1.1l-4.2-2.4z" fill="white" />
        </svg>
      );

    case "ARBITRUM":
    case "ARB":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#2D374B" />
          <path d="M17.8 10.5l4.6 7.5-2.3 1.4-3.4-5.6-1.2 2 2.7 4.4-2.3 1.4-4-6.5 5.9-4.6z" fill="#28A0F0" />
          <path d="M14.2 10.5l-4.6 7.5 2.3 1.4 3.4-5.6 1.2 2-2.7 4.4 2.3 1.4 4-6.5-5.9-4.6z" fill="white" />
        </svg>
      );

    case "OPTIMISM":
    case "OP":
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#FF0420" />
          <path d="M11.3 19.9c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.4 3-3 3zm0-4.5c-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5 1.5-.7 1.5-1.5-.7-1.5-1.5-1.5zm5.6-1.5h2.5c1.3 0 2.3 1 2.3 2.2 0 1.3-1 2.2-2.3 2.2h-1v1.6h-1.5v-6zm1.5 3h.9c.5 0 .9-.4.9-.8s-.4-.8-.9-.8h-.9v1.6z" fill="white" />
        </svg>
      );

    default:
      return (
        <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="16" fill="#6B7280" />
          <text x="16" y="20" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">
            {symbol.charAt(0)}
          </text>
        </svg>
      );
  }
}
