"use client";

interface StatItemProps {
  value: string;
  label: string;
  sublabel?: string;
  colorClass?: string;
}

export function StatItem({
  value,
  label,
  sublabel,
  colorClass = "text-primary",
}: StatItemProps) {
  return (
    <div className="stat-item text-center">
      <p
        className={`${colorClass} text-4xl md:text-5xl font-headline font-black mb-3 tracking-tighter`}
      >
        {value}
      </p>
      <p className="text-on-surface-variant uppercase tracking-[0.2em] text-[10px] font-bold leading-tight">
        {label}
        {sublabel && (
          <>
            <br />
            {sublabel}
          </>
        )}
      </p>
    </div>
  );
}
