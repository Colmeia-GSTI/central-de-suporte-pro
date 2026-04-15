import { useState } from "react";
import { Bell, AlertTriangle, AlertCircle, Info, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DocAlert {
  id: string;
  title: string;
  description: string;
  expiry_date: string;
  days_remaining: number;
  severity: string;
  alert_type: string;
}

interface Props {
  alerts: DocAlert[];
  criticalCount: number;
  warningCount: number;
  onAcknowledge: (alertId: string) => void;
  isAcknowledging: boolean;
}

function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
    case "warning":
      return <AlertCircle className="h-4 w-4 text-warning shrink-0" />;
    default:
      return <Info className="h-4 w-4 text-info shrink-0" />;
  }
}

function formatExpiryDate(dateStr: string): string {
  try {
    return format(new Date(dateStr + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

export function DocAlertsPanel({ alerts, criticalCount, warningCount, onAcknowledge, isAcknowledging }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) return null;

  const hasCritical = criticalCount > 0;
  const bannerVariant = hasCritical ? "destructive" : "warning";

  // Sort: critical first, then by days_remaining ascending
  const sorted = [...alerts].sort((a, b) => {
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    const aDiff = severityOrder[a.severity] ?? 3;
    const bDiff = severityOrder[b.severity] ?? 3;
    if (aDiff !== bDiff) return aDiff - bDiff;
    return a.days_remaining - b.days_remaining;
  });

  return (
    <div className="border-b">
      {/* Banner */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-muted/30 ${
          hasCritical ? "bg-destructive/5" : "bg-warning/5"
        }`}
      >
        <Bell className={`h-4 w-4 shrink-0 ${hasCritical ? "text-destructive" : "text-warning"}`} />
        <span className="font-medium">
          {alerts.length} {alerts.length === 1 ? "alerta" : "alertas"} de vencimento
        </span>
        {criticalCount > 0 && (
          <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
            {criticalCount} crítico{criticalCount > 1 ? "s" : ""}
          </Badge>
        )}
        {warningCount > 0 && (
          <Badge variant="warning" className="text-[10px] py-0 px-1.5">
            {warningCount} aviso{warningCount > 1 ? "s" : ""}
          </Badge>
        )}
        <div className="ml-auto">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="divide-y max-h-[300px] overflow-y-auto">
          {sorted.map((alert) => (
            <div key={alert.id} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/20">
              <SeverityIcon severity={alert.severity} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{alert.title}</p>
                <p className="text-xs text-muted-foreground">
                  {alert.description} · Vencimento: {formatExpiryDate(alert.expiry_date)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledge(alert.id);
                }}
                disabled={isAcknowledging}
              >
                <Check className="h-3.5 w-3.5" />
                Reconhecer
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
