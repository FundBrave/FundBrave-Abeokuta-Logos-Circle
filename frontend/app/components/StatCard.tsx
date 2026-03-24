interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  className?: string;
}

export function StatCard({ label, value, sub, className = "" }: StatCardProps) {
  return (
    <div className={`glass rounded-xl p-4 ${className}`}>
      <div className="text-2xl font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-[#2563EB] mt-0.5">{sub}</div>}
      <div className="text-sm text-white/50 mt-1">{label}</div>
    </div>
  );
}
