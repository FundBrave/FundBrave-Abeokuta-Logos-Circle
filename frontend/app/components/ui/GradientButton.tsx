"use client";

import { ButtonHTMLAttributes } from "react";

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline";
  size?: "default" | "lg";
}

export function GradientButton({
  variant = "primary",
  size = "default",
  className = "",
  children,
  ...props
}: GradientButtonProps) {
  const base =
    "font-extrabold active:scale-95 transition-transform inline-flex items-center justify-center";

  const variants = {
    primary:
      "primary-gradient-bg text-white glow-shadow-primary",
    outline:
      "bg-white/5 backdrop-blur-md text-on-surface border border-white/10 hover:bg-white/10",
  };

  const sizes = {
    default: "px-8 py-4 rounded-xl text-base",
    lg: "px-10 py-5 rounded-2xl text-xl",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
