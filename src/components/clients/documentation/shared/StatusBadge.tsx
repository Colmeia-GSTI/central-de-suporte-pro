import { Badge } from "@/components/ui/badge";
import { statusColors } from "@/lib/doc-utils";

interface StatusBadgeProps {
  status: string | null;
}

/**
 * Unified badge for device status (online/offline/overdue/unknown).
 * Uses the centralized statusColors from doc-utils.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  const s = status || "unknown";
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={`h-2 w-2 rounded-full ${statusColors[s] || statusColors.unknown}`} />
      {s}
    </Badge>
  );
}
