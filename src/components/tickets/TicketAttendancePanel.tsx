import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Play,
  Pause,
  Square,
  Plus,
  CheckCircle,
  Clock,
  Timer,
  Hourglass,
  ChevronDown,
  Loader2,
  Trash2,
  User,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatTimeHMS, formatTimeFriendly } from "@/lib/attendance-time";
import { useTicketAttendance } from "@/hooks/useTicketAttendance";
import { useToast } from "@/hooks/use-toast";
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

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: "Aberto", color: "bg-muted text-muted-foreground" },
  in_progress: { label: "Em Atendimento", color: "bg-green-500 text-white" },
  paused: { label: "Pausado", color: "bg-amber-500 text-white" },
  waiting_third_party: { label: "Aguardando Terceiro", color: "bg-purple-500 text-white" },
  no_contact: { label: "Sem Contato", color: "bg-orange-500 text-white" },
  resolved: { label: "Encerrado", color: "bg-muted-foreground text-white" },
  closed: { label: "Fechado", color: "bg-muted text-muted-foreground" },
  waiting: { label: "Aguardando", color: "bg-blue-500 text-white" },
};

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
};

const formatTimerDisplay = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
    waitMs,
    startAttendance,
    resumeAttendance,
    isStarting,
    isResuming,
  } = useTicketAttendance({ ticketId, status, createdAt, startedAt, resolvedAt });

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
          <div className="flex items-center justify-between">
            <Badge className={cn(cfg.color, cfg.pulse && "animate-pulse")}>
              {cfg.label}
            </Badge>
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
                  {isStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
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
                    <Button onClick={onResolve} className="gap-2 bg-green-600 hover:bg-green-700 text-white">
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
                  {isResuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Retomar Atendimento
                </Button>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Time Summary Grid — 2x2 */}
        <div className="grid grid-cols-2 gap-3 p-4">
          <TimeStat icon={<Timer className="h-4 w-4 text-primary" />} label="Trabalhado" value={formatTimeFriendly(workedMs)} />
          <TimeStat icon={<Pause className="h-4 w-4 text-amber-500" />} label="Pausado" value={formatTimeFriendly(pausedMs)} />
          <TimeStat icon={<Hourglass className="h-4 w-4 text-blue-500" />} label="Espera" value={formatTimeFriendly(waitMs)} />
          <TimeStat icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Total Decorrido" value={formatTimeFriendly(elapsedMs)} />
        </div>

        <Separator />

        {/* Integrated Manual Time Tracker */}
        <ManualTimeSection ticketId={ticketId} canEdit={canEdit} />
      </CardContent>
    </Card>
  );
}

/* ─── Sub-components ─── */

function TimeStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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

function ManualTimeSection({ ticketId, canEdit }: { ticketId: string; canEdit: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerStartTime, setTimerStartTime] = useState<Date | null>(null);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: timeEntries = [] } = useQuery({
    queryKey: ["ticket-time-entries", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_time_entries")
        .select("id, ticket_id, user_id, started_at, ended_at, duration_minutes, description, is_billable, entry_type, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const userIds = [...new Set(data.map((e) => e.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) || []);

      return data.map((entry) => ({
        ...entry,
        userName: profileMap.get(entry.user_id) || "Usuário",
      }));
    },
    staleTime: 30_000,
  });

  const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.duration_minutes, 0);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRunning]);

  const resetTimer = () => { setIsRunning(false); setElapsedSeconds(0); setTimerStartTime(null); };
  const resetManualForm = () => { setManualHours(""); setManualMinutes(""); setManualDescription(""); };

  const saveStopwatchMutation = useMutation({
    mutationFn: async () => {
      if (!timerStartTime) return;
      const endTime = new Date();
      const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
      const { error } = await supabase.from("ticket_time_entries").insert({
        ticket_id: ticketId,
        user_id: user?.id,
        started_at: timerStartTime.toISOString(),
        ended_at: endTime.toISOString(),
        duration_minutes: durationMinutes,
        entry_type: "stopwatch",
        is_billable: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-time-entries", ticketId] }); toast({ title: "Tempo registrado" }); resetTimer(); },
    onError: () => { toast({ title: "Erro ao salvar tempo", variant: "destructive" }); },
  });

  const saveManualMutation = useMutation({
    mutationFn: async () => {
      const hours = parseInt(manualHours) || 0;
      const minutes = parseInt(manualMinutes) || 0;
      const totalMins = hours * 60 + minutes;
      if (totalMins <= 0) throw new Error("Informe um tempo válido");
      const { error } = await supabase.from("ticket_time_entries").insert({
        ticket_id: ticketId,
        user_id: user?.id,
        duration_minutes: totalMins,
        description: manualDescription || null,
        entry_type: "manual",
        is_billable: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-time-entries", ticketId] }); toast({ title: "Tempo registrado" }); setIsManualDialogOpen(false); resetManualForm(); },
    onError: (error) => { toast({ title: error.message || "Erro ao salvar tempo", variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase.from("ticket_time_entries").delete().eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["ticket-time-entries", ticketId] }); toast({ title: "Registro excluído" }); setDeleteConfirm(null); },
    onError: () => { toast({ title: "Erro ao excluir", variant: "destructive" }); },
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full p-3 text-sm hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Registro de Tempo</span>
            {totalMinutes > 0 && (
              <Badge variant="secondary" className="text-xs">{formatDuration(totalMinutes)}</Badge>
            )}
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-3">
          {/* Controls */}
          {canEdit && (
            <div className="flex items-center gap-2 flex-wrap">
              {!isRunning && elapsedSeconds === 0 ? (
                <Button size="sm" variant="outline" onClick={() => { setTimerStartTime(new Date()); setIsRunning(true); }} className="gap-1 h-8">
                  <Play className="h-3 w-3" /> Cronômetro
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium tabular-nums">{formatTimerDisplay(elapsedSeconds)}</span>
                  {isRunning ? (
                    <Button size="sm" variant="outline" onClick={() => setIsRunning(false)} className="h-8 w-8 p-0">
                      <Pause className="h-3 w-3" />
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setIsRunning(true)} className="h-8 w-8 p-0">
                        <Play className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => elapsedSeconds >= 60 ? saveStopwatchMutation.mutate() : (toast({ title: "Tempo mínimo: 1 minuto", variant: "destructive" }), resetTimer())}
                        disabled={saveStopwatchMutation.isPending}
                        className="h-8 w-8 p-0"
                      >
                        <Square className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              )}

              <Dialog open={isManualDialogOpen} onOpenChange={setIsManualDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 h-8">
                    <Plus className="h-3 w-3" /> Manual
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Registrar Tempo Manualmente</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <Label>Horas</Label>
                        <Input type="number" min="0" value={manualHours} onChange={(e) => setManualHours(e.target.value)} placeholder="0" />
                      </div>
                      <div className="flex-1">
                        <Label>Minutos</Label>
                        <Input type="number" min="0" max="59" value={manualMinutes} onChange={(e) => setManualMinutes(e.target.value)} placeholder="0" />
                      </div>
                    </div>
                    <div>
                      <Label>Descrição (opcional)</Label>
                      <Textarea value={manualDescription} onChange={(e) => setManualDescription(e.target.value)} placeholder="O que foi feito neste período..." rows={3} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsManualDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={() => saveManualMutation.mutate()} disabled={saveManualMutation.isPending}>
                        {saveManualMutation.isPending ? "Salvando..." : "Salvar"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Time Entries List */}
          {timeEntries.length > 0 ? (
            <div className="space-y-1.5">
              {timeEntries.slice(0, 5).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{entry.userName}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5">{formatDuration(entry.duration_minutes)}</Badge>
                    <span className="text-muted-foreground">{format(new Date(entry.created_at), "dd/MM HH:mm", { locale: ptBR })}</span>
                  </div>
                  {entry.user_id === user?.id && canEdit && (
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(entry.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              {timeEntries.length > 5 && (
                <p className="text-[10px] text-muted-foreground text-center">+{timeEntries.length - 5} registros</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">Nenhum registro de tempo</p>
          )}
        </div>
      </CollapsibleContent>

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title="Excluir registro de tempo?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
        variant="destructive"
      />
    </Collapsible>
  );
}
