import { cn } from "@/lib/utils";

interface MetricGaugeProps {
  label: string;
  value: number;
  className?: string;
}

export function MetricGauge({ label, value, className }: MetricGaugeProps) {
  const getColor = (val: number) => {
    if (val <= 50) return "bg-status-success";
    if (val <= 80) return "bg-status-warning";
    return "bg-status-danger";
  };

  const displayValue = Math.min(Math.max(value, 0), 100);

  return (
    <div className={cn("flex flex-col items-center gap-1 min-w-[70px]", className)}>
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <span className="text-lg font-bold">{displayValue.toFixed(0)}%</span>
      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", getColor(displayValue))}
          style={{ width: `${displayValue}%` }}
        />
      </div>
    </div>
  );
}
