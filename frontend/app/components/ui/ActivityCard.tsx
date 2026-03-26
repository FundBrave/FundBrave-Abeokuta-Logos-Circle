"use client";

import { ReactNode } from "react";

interface ActivityCardProps {
  icon: ReactNode;
  iconBgClass?: string;
  children: ReactNode;
  timestamp: string;
  hoverBorderClass?: string;
}

export function ActivityCard({
  icon,
  iconBgClass = "bg-primary/10",
  children,
  timestamp,
  hoverBorderClass = "hover:border-primary/30",
}: ActivityCardProps) {
  return (
    <div
      className={`flex gap-6 items-start p-8 bg-[#111827] rounded-[2rem] border border-outline-variant/10 ${hoverBorderClass} transition-all`}
    >
      <div
        className={`w-14 h-14 rounded-full ${iconBgClass} flex items-center justify-center shrink-0`}
      >
        {icon}
      </div>
      <div>
        <p className="text-on-surface mb-2 font-medium">{children}</p>
        <p className="text-on-surface-variant text-sm font-bold uppercase tracking-widest">
          {timestamp}
        </p>
      </div>
    </div>
  );
}
