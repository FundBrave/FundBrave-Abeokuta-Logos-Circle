"use client";

import { HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section";
}

export function GlassCard({
  as: Tag = "div",
  className = "",
  children,
  ...props
}: GlassCardProps) {
  return (
    <Tag
      className={`glass-card rounded-[2.5rem] border border-outline-variant/20 shadow-2xl ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}
