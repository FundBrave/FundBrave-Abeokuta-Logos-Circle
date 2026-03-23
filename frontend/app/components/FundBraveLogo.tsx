interface Props { className?: string }

/**
 * FundBrave wordmark rendered as inline SVG — no external image dependency.
 */
export function FundBraveLogo({ className = "h-8" }: Props) {
  return (
    <svg
      viewBox="0 0 160 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="FundBrave"
    >
      {/* Icon mark */}
      <rect x="0" y="4" width="28" height="28" rx="7" fill="#450cf0" />
      <path
        d="M8 22 L14 12 L20 18 L24 14"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Wordmark */}
      <text
        x="36"
        y="26"
        fontFamily="system-ui, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill="white"
      >
        FundBrave
      </text>
    </svg>
  );
}
