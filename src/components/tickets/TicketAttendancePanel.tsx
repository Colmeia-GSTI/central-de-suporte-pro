import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Pause,
  CheckCircle,
  Clock,
  Timer,
  RefreshCw,
  Hash,
  Loader2,
} from "lucide-react";
import { formatTimeHMS, formatTimeFriendly } from "@/lib/attendance-time";
import { useTicketAttendance } from "@/hooks/useTicketAttendance";
import { cn } from "@/lib/utils";
import type { Enums } from "@/integrations/supabase/types";

type TicketStatus = Enums<"ticket_status">;

interface TicketAttendancePanelProps {
  ticketId: string;
  status: TicketStatus;
  createdAt: string;
  startedAt: string | null;
  resolvedAt: string | null;
  onPause?: () => void;
  onResolve?: () => void;
  canEdit?: boolean;
}

const statusConfig: Record<string, { label: string; color: string; pulse?: boolean }> = {
  open: { label: "Aberto", color: "bg-muted text-muted-foreground" },
  in_progress: { label: "Em Atendimento", color: "bg-green-500 text-white", pulse: true },
  paused: { label: "Pausado", color: "bg-amber-500 text-white" },
  waiting_third_party: { label: "Aguardando Terceiro", color: "bg-purple-500 text-white" },
  no_contact: { label: "Sem Contato", color: "bg-orange-500 text-white" },
  resolved: { label: "Encerrado", color: "bg-muted-foreground text-white" },
  closed: { label: "Fechado", color: "bg-muted text-muted-foreground" },
  waiting: { label: "Aguardando", color: "bg-blue-500 text-white" },
};

export function TicketAttendancePanel({
  ticketId,
  status,
  createdAt,
  startedAt,
  resolvedAt,
  onPause,
  onResolve,
  canEdit = true,
}: TicketAttendancePanelProps) {
  const {
    workedMs,
    elapsedMs,
    pausedMs,
    pauseCount,
    sessionCount,
    startAttendance,
    resumeAttendance,
    isStarting,
    isResuming,
  } = useTicketAttendance({
    ticketId,
    status,
    createdAt,
    startedAt,
    resolvedAt,
  });

  const cfg = statusConfig[status] || statusConfig.open;
  const isRunning = status === "in_progress";
  const isPaused = status === "paused" || status === "waiting_third_party" || status === "no_contact";
  const isOpen = status === "open";
  const isClosed = status === "resolved" || status === "closed";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Status Banner + Timer */}
        <div className="bg-muted/40 p-4 space-y-3">
          {/* Status Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className={cn(cfg.color, cfg.pulse && "animate-pulse")}>
                {cfg.label}
              </Badge>
            </div>
          </div>

          {/* Main Timer Display */}
          <div className="text-center space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              Tempo Trabalhado
            </p>
            <p
              className={cn(
                "text-3xl font-mono font-bold tracking-tight tabular-nums",
                isRunning && "text-green-600 dark:text-green-400",
                isPaused && "text-amber-600 dark:text-amber-400",
                isClosed && "text-muted-foreground"
              )}
            >
              {formatTimeHMS(workedMs)}
            </p>
            {isRunning && (
              <div className="flex items-center justify-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  Contando...
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {canEdit && (
            <div className="flex items-center justify-center gap-2 pt-1">
              {isOpen && (
                <Button
                  onClick={startAttendance}
                  disabled={isStarting}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  {isStarting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Iniciar Atendimento
                </Button>
              )}

              {isRunning && (
                <>
                  {onPause && (
                    <Button variant="outline" onClick={onPause} className="gap-2">
                      <Pause className="h-4 w-4" />
                      Pausar
                    </Button>
                  )}
                  {onResolve && (
                    <Button
                      onClick={onResolve}
                      className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="h-4 w-4" />
                      Encerrar
                    </Button>
                  )}
                </>
              )}

              {isPaused && (
                <Button
                  onClick={resumeAttendance}
                  disabled={isResuming}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  {isResuming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Retomar Atendimento
                </Button>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Time Summary Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
          <TimeStat
            icon={<Timer className="h-4 w-4 text-primary" />}
            label="Trabalhado"
            value={formatTimeFriendly(workedMs)}
          />
          <TimeStat
            icon={<Pause className="h-4 w-4 text-amber-500" />}
            label="Pausado"
            value={formatTimeFriendly(pausedMs)}
          />
          <TimeStat
            icon={<Clock className="h-4 w-4 text-muted-foreground" />}
            label="Total Decorrido"
            value={formatTimeFriendly(elapsedMs)}
          />
          <TimeStat
            icon={<RefreshCw className="h-4 w-4 text-blue-500" />}
            label="Pausas"
            value={String(pauseCount)}
          />
          <TimeStat
            icon={<Hash className="h-4 w-4 text-purple-500" />}
            label="Sessões"
            value={String(sessionCount)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TimeStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {icon}
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}
