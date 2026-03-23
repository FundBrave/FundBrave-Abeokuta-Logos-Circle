interface Props { className?: string }

/**
 * Logos Network logo — minimalist geometric mark.
 */
export function LogosLogo({ className = "h-8" }: Props) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logos Network"
    >
      <circle cx="16" cy="16" r="15" stroke="white" strokeWidth="1.5" opacity="0.6" />
      <circle cx="16" cy="16" r="6"  fill="white" opacity="0.9" />
      <path d="M16 1 L16 31" stroke="white" strokeWidth="1" opacity="0.3" />
      <path d="M1 16 L31 16" stroke="white" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}
