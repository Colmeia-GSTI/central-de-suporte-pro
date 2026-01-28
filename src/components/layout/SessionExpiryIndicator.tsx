import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

// Show warning when less than 10 minutes remaining
const WARNING_THRESHOLD_MS = 10 * 60 * 1000;
// Show critical when less than 2 minutes remaining
const CRITICAL_THRESHOLD_MS = 2 * 60 * 1000;

export function SessionExpiryIndicator() {
  const { session } = useAuth();
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.expires_at) {
      setTimeRemaining(null);
      return;
    }

    const updateTimeRemaining = () => {
      const expiresAtMs = session.expires_at! * 1000;
      const now = Date.now();
      const remaining = expiresAtMs - now;
      setTimeRemaining(remaining > 0 ? remaining : 0);
    };

    // Update immediately
    updateTimeRemaining();

    // Update every 30 seconds
    const interval = setInterval(updateTimeRemaining, 30000);

    return () => clearInterval(interval);
  }, [session?.expires_at]);

  // Don't show if no session or plenty of time remaining
  if (timeRemaining === null || timeRemaining > WARNING_THRESHOLD_MS) {
    return null;
  }

  const isCritical = timeRemaining <= CRITICAL_THRESHOLD_MS;
  const minutes = Math.floor(timeRemaining / 60000);
  const seconds = Math.floor((timeRemaining % 60000) / 1000);

  const formatTime = () => {
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "gap-1.5 cursor-default transition-colors",
            isCritical
              ? "border-destructive/50 bg-destructive/10 text-destructive animate-pulse"
              : "border-warning/50 bg-warning/10 text-warning"
          )}
        >
          {isCritical ? (
            <AlertTriangle className="h-3 w-3" />
          ) : (
            <Clock className="h-3 w-3" />
          )}
          <span className="text-xs font-medium">{formatTime()}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-sm">
          {isCritical
            ? "Sessão expirando! Será renovada automaticamente."
            : "Sessão será renovada em breve."}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
