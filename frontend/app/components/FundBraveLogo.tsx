import Image from "next/image";

interface Props { className?: string; size?: number }

export function FundBraveLogo({ className = "", size = 36 }: Props) {
  return (
    <Image
      src="/images/logo/Fundbrave_icon-gradient.png"
      alt="FundBrave"
      width={size}
      height={size}
      className={`rounded-lg ${className}`}
    />
  );
}
