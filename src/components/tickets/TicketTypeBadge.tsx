import { Badge } from "@/components/ui/badge";
import { Lock, CheckSquare } from "lucide-react";

interface TicketTypeBadgeProps {
  isInternal?: boolean | null;
  origin?: string | null;
  className?: string;
}

/**
 * Shows a badge for internal tickets or tasks.
 * External tickets show nothing (default behavior).
 */
export function TicketTypeBadge({ isInternal, origin, className }: TicketTypeBadgeProps) {
  if (!isInternal) return null;

  if (origin === "task") {
    return (
      <Badge className={`text-[9px] px-1.5 py-0 h-4 bg-purple-500/15 text-purple-600 border-purple-500/30 ${className || ""}`}>
        <CheckSquare className="h-2.5 w-2.5 mr-0.5" />
        Tarefa
      </Badge>
    );
  }

  return (
    <Badge className={`text-[9px] px-1.5 py-0 h-4 bg-blue-500/15 text-blue-600 border-blue-500/30 ${className || ""}`}>
      <Lock className="h-2.5 w-2.5 mr-0.5" />
      Interno
    </Badge>
  );
}
