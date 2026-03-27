import Image from "next/image";

interface Props { className?: string; size?: number }

/**
 * Logos logo — served from the local copy of logos.co brand asset.
 */
export function LogosLogo({ className = "", size = 32 }: Props) {
  return (
    <Image
      src="/images/logo/logos-logo.png"
      alt="Logos"
      width={size}
      height={size}
      className={className}
    />
  );
}
