import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Play,
  Pause,
  Square,
  Plus,
  Clock,
  Trash2,
  DollarSign,
  User,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface TicketTimeTrackerProps {
  ticketId: string;
}

interface TimeEntry {
  id: string;
  ticket_id: string;
  user_id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  description: string | null;
  is_billable: boolean;
  entry_type: string;
  created_at: string;
  profiles?: { full_name: string } | null;
}

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}min`;
  }
  return `${mins}min`;
};

const formatTimerDisplay = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

export function TicketTimeTracker({ ticketId }: TicketTimeTrackerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualBillable, setManualBillable] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch time entries
  const { data: timeEntries = [], isLoading } = useQuery({
    queryKey: ["ticket-time-entries", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_time_entries")
        .select("id, ticket_id, user_id, started_at, ended_at, duration_minutes, description, is_billable, entry_type, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      const userIds = [...new Set(data.map(e => e.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
      
      return data.map(entry => ({
        ...entry,
        profiles: { full_name: profileMap.get(entry.user_id) || "Usuário" }
      })) as TimeEntry[];
    },
  });

  const totalMinutes = timeEntries.reduce((sum, entry) => sum + entry.duration_minutes, 0);
  const billableMinutes = timeEntries
    .filter((entry) => entry.is_billable)
    .reduce((sum, entry) => sum + entry.duration_minutes, 0);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  const saveStopwatchMutation = useMutation({
    mutationFn: async () => {
      if (!startTime) return;
      const endTime = new Date();
      const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));

      const { error } = await supabase.from("ticket_time_entries").insert({
        ticket_id: ticketId,
        user_id: user?.id,
        started_at: startTime.toISOString(),
        ended_at: endTime.toISOString(),
        duration_minutes: durationMinutes,
        entry_type: "stopwatch",
        is_billable: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-time-entries", ticketId] });
      toast({ title: "Tempo registrado" });
      resetTimer();
    },
    onError: () => {
      toast({ title: "Erro ao salvar tempo", variant: "destructive" });
    },
  });

  const saveManualMutation = useMutation({
    mutationFn: async () => {
      const hours = parseInt(manualHours) || 0;
      const minutes = parseInt(manualMinutes) || 0;
      const totalMins = hours * 60 + minutes;

      if (totalMins <= 0) {
        throw new Error("Informe um tempo válido");
      }

      const { error } = await supabase.from("ticket_time_entries").insert({
        ticket_id: ticketId,
        user_id: user?.id,
        duration_minutes: totalMins,
        description: manualDescription || null,
        entry_type: "manual",
        is_billable: manualBillable,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-time-entries", ticketId] });
      toast({ title: "Tempo registrado" });
      setIsManualDialogOpen(false);
      resetManualForm();
    },
    onError: (error) => {
      toast({ title: error.message || "Erro ao salvar tempo", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const { error } = await supabase
        .from("ticket_time_entries")
        .delete()
        .eq("id", entryId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-time-entries", ticketId] });
      toast({ title: "Registro excluído" });
      setDeleteConfirm(null);
    },
    onError: () => {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    },
  });

  const handleStart = () => {
    setStartTime(new Date());
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleResume = () => {
    setIsRunning(true);
  };

  const handleStop = () => {
    if (elapsedSeconds >= 60) {
      saveStopwatchMutation.mutate();
    } else {
      toast({ title: "Tempo mínimo: 1 minuto", variant: "destructive" });
      resetTimer();
    }
  };

  const resetTimer = () => {
    setIsRunning(false);
    setElapsedSeconds(0);
    setStartTime(null);
  };

  const resetManualForm = () => {
    setManualHours("");
    setManualMinutes("");
    setManualDescription("");
    setManualBillable(true);
  };

  return (
    <div className="border rounded-lg">
      {/* Compact Header */}
      <div className="flex items-center justify-between p-3 bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{formatDuration(totalMinutes)}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {billableMinutes > 0 && (
            <div className="flex items-center gap-1 text-sm text-green-600">
              <DollarSign className="h-3 w-3" />
              <span>{formatDuration(billableMinutes)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Inline Timer Controls */}
          {!isRunning && elapsedSeconds === 0 ? (
            <Button size="sm" variant="outline" onClick={handleStart} className="gap-1 h-8">
              <Play className="h-3 w-3" />
              Cronômetro
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium tabular-nums">
                {formatTimerDisplay(elapsedSeconds)}
              </span>
              {isRunning ? (
                <Button size="sm" variant="outline" onClick={handlePause} className="h-8 w-8 p-0">
                  <Pause className="h-3 w-3" />
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={handleResume} className="h-8 w-8 p-0">
                    <Play className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleStop}
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
                <Plus className="h-3 w-3" />
                Manual
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar Tempo Manualmente</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <Label>Horas</Label>
                    <Input
                      type="number"
                      min="0"
                      value={manualHours}
                      onChange={(e) => setManualHours(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Minutos</Label>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={manualMinutes}
                      onChange={(e) => setManualMinutes(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
                <div>
                  <Label>Descrição (opcional)</Label>
                  <Textarea
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder="O que foi feito neste período..."
                    rows={3}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="billable"
                    checked={manualBillable}
                    onCheckedChange={setManualBillable}
                  />
                  <Label htmlFor="billable" className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    Faturável
                  </Label>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsManualDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => saveManualMutation.mutate()}
                    disabled={saveManualMutation.isPending}
                  >
                    {saveManualMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Expand/Collapse button */}
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </div>

      {/* Collapsible Time Entries */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent>
          {timeEntries.length > 0 ? (
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Data</TableHead>
                    <TableHead className="text-xs">Técnico</TableHead>
                    <TableHead className="text-xs">Duração</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Descrição</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeEntries.slice(0, 5).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs py-2">
                        {format(new Date(entry.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {entry.profiles?.full_name || "—"}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <Badge variant="secondary" className="text-xs">
                          {formatDuration(entry.duration_minutes)}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-xs">
                            {entry.entry_type === "stopwatch" ? "⏱" : "✍"}
                          </Badge>
                          {entry.is_billable && (
                            <DollarSign className="h-3 w-3 text-green-600" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate py-2">
                        {entry.description || "—"}
                      </TableCell>
                      <TableCell className="py-2">
                        {entry.user_id === user?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => setDeleteConfirm(entry.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {timeEntries.length > 5 && (
                <p className="text-xs text-muted-foreground text-center py-2 border-t">
                  +{timeEntries.length - 5} registros
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-3 border-t">
              Nenhum registro de tempo
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
        title="Excluir registro de tempo?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
        variant="destructive"
      />
    </div>
  );
}
