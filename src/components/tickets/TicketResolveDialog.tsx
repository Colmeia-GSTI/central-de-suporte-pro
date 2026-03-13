import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { calculateElapsedBusinessMinutes } from "@/lib/sla-calculator";
import { calcWorkedTimeMs, formatTimeFriendly } from "@/lib/attendance-time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Clock, Loader2, Timer } from "lucide-react";
import type { Enums } from "@/integrations/supabase/types";

interface TicketResolveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketNumber: number;
  currentStatus: Enums<"ticket_status">;
  categoryId?: string | null;
  clientId?: string | null;
  ticketTitle: string;
  ticketCreatedAt: string;
  firstResponseAt?: string | null;
  onSuccess?: () => void;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export function TicketResolveDialog({
  open,
  onOpenChange,
  ticketId,
  ticketNumber,
  currentStatus,
  categoryId,
  clientId,
  ticketTitle,
  ticketCreatedAt,
  onSuccess,
}: TicketResolveDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [extraHours, setExtraHours] = useState(0);
  const [extraMinutes, setExtraMinutes] = useState(0);
  const [createArticle, setCreateArticle] = useState(false);

  // Fetch attendance sessions for worked time calculation
  const { data: attendanceSessions = [] } = useQuery({
    queryKey: ["ticket-attendance-sessions", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_attendance_sessions")
        .select("started_at, ended_at")
        .eq("ticket_id", ticketId)
        .order("started_at");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Fetch business hours for auto-calculation
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-business-hours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("business_hours")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch ticket pauses
  const { data: ticketPauses = [] } = useQuery({
    queryKey: ["ticket-pauses-resolve", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_pauses")
        .select("paused_at, resumed_at")
        .eq("ticket_id", ticketId);
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Calculate worked time from attendance sessions (consistent with panel)
  const workedMs = useMemo(() => {
    return calcWorkedTimeMs({
      created_at: ticketCreatedAt,
      started_at: null,
      resolved_at: null,
      sessions: attendanceSessions,
      pauses: [],
    });
  }, [attendanceSessions, ticketCreatedAt]);

  const workedMinutes = Math.floor(workedMs / 60000);

  // Sempre contar desde a abertura do ticket (ticketCreatedAt)
  const autoElapsedMinutes = useMemo(() => {
    if (!ticketCreatedAt) return 0;

    const businessHours = companySettings?.business_hours as {
      timezone: string;
      shifts: { name: string; start: string; end: string }[];
      days: Record<string, boolean>;
    } | null;

    if (!businessHours) return 0;

    let elapsed = calculateElapsedBusinessMinutes(
      new Date(ticketCreatedAt),
      new Date(),
      businessHours
    );

    // Descontar tempo de pausas
    for (const pause of ticketPauses) {
      const pauseStart = new Date(pause.paused_at);
      const pauseEnd = pause.resumed_at ? new Date(pause.resumed_at) : new Date();
      if (pauseStart >= pauseEnd) continue;
      elapsed -= calculateElapsedBusinessMinutes(pauseStart, pauseEnd, businessHours);
    }

    return Math.max(0, elapsed);
  }, [ticketCreatedAt, companySettings, ticketPauses]);

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Usuário não autenticado");
      
      const extraMins = (extraHours * 60) + extraMinutes;
      
      // 1. If there's extra time, insert in ticket_time_entries
      if (extraMins > 0) {
        const { error: timeError } = await supabase
          .from("ticket_time_entries")
          .insert({
            ticket_id: ticketId,
            user_id: user.id,
            duration_minutes: extraMins,
            description: "Tempo adicional registrado na finalização",
            entry_type: "manual",
            is_billable: true,
          });
        
        if (timeError) throw timeError;
      }

      // Close active attendance session
      await supabase
        .from("ticket_attendance_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("ticket_id", ticketId)
        .is("ended_at", null);
      
      // 2. Update ticket
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({
          status: "resolved" as Enums<"ticket_status">,
          resolved_at: new Date().toISOString(),
          resolution_notes: resolutionNotes.trim(),
        })
        .eq("id", ticketId);
      
      if (ticketError) throw ticketError;
      
      // 3. Register in history with total time
      const workedInfo = workedMinutes > 0 ? `Tempo trabalhado: ${formatDuration(workedMinutes)}` : "";
      const autoInfo = autoElapsedMinutes > 0 ? `Tempo total (abertura → agora): ${formatDuration(autoElapsedMinutes)}` : "";
      const extraInfo = extraMins > 0 ? `Tempo extra: ${formatDuration(extraMins)}` : "";
      const timeInfo = [workedInfo, autoInfo, extraInfo].filter(Boolean).join(" | ");
      const timeDisplay = timeInfo ? ` (${timeInfo})` : "";
      const timeDisplay = timeInfo ? ` (${timeInfo})` : "";
      
      const { error: historyError } = await supabase
        .from("ticket_history")
        .insert({
          ticket_id: ticketId,
          user_id: user.id,
          old_status: currentStatus,
          new_status: "resolved" as Enums<"ticket_status">,
          comment: `Chamado resolvido${timeDisplay}: ${resolutionNotes.trim()}`,
        });
      
      if (historyError) throw historyError;
      
      // 4. If checkbox is checked, create article in knowledge base
      if (createArticle) {
        const { error: articleError } = await supabase
          .from("knowledge_articles")
          .insert({
            title: `Solução: ${ticketTitle}`,
            content: resolutionNotes.trim(),
            category_id: categoryId || null,
            client_id: clientId || null,
            is_public: false,
            author_id: user.id,
          });
        
        if (articleError) {
          logger.error("Erro ao criar artigo", "Tickets", { error: articleError.message });
          toast.warning("Chamado resolvido, mas houve erro ao criar o artigo");
        }
      }
    },
    onSuccess: () => {
      toast.success("Chamado finalizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-time-entries", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-attendance-sessions", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-attendance-pauses", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      logger.error("Erro ao finalizar chamado", "Tickets", { error: String(error) });
      toast.error("Erro ao finalizar chamado");
    },
  });

  const resetForm = () => {
    setResolutionNotes("");
    setExtraHours(0);
    setExtraMinutes(0);
    setCreateArticle(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const canSubmit = resolutionNotes.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Finalizar Chamado #{ticketNumber}
          </DialogTitle>
          <DialogDescription>
            Descreva a solução aplicada para resolver este chamado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Time Summary Card */}
          <Card className="bg-muted/50">
            <CardContent className="py-3 px-4">
              {autoElapsedMinutes > 0 && (
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
                  <Timer className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Tempo Total (abertura → agora)</span>
                  <span className="ml-auto text-sm font-semibold text-primary">
                    {formatDuration(autoElapsedMinutes)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Tempo Registrado</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-medium">{formatDuration(totalMinutes)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Extra Time */}
          <div className="space-y-2">
            <Label className="text-sm">Adicionar tempo extra? (opcional)</Label>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="99"
                  value={extraHours}
                  onChange={(e) => setExtraHours(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-16 text-center"
                />
                <span className="text-sm text-muted-foreground">hrs</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="59"
                  value={extraMinutes}
                  onChange={(e) => setExtraMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                  className="w-16 text-center"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            </div>
          </div>

          {/* Resolution Notes */}
          <div className="space-y-2">
            <Label htmlFor="resolution-notes">
              Descreva a solução aplicada <span className="text-destructive">*</span>
              <span className="text-xs text-muted-foreground ml-2">
                (mínimo 10 caracteres)
              </span>
            </Label>
            <Textarea
              id="resolution-notes"
              placeholder="Descreva detalhadamente a solução aplicada para resolver este chamado..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={4}
              className="resize-none"
            />
            {resolutionNotes.trim().length < 10 ? (
              <p className="text-xs text-destructive">
                Faltam {10 - resolutionNotes.trim().length} caracteres
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {resolutionNotes.trim().length} caracteres ✓
              </p>
            )}
          </div>

          {/* Create Article Checkbox */}
          <div className="flex items-start space-x-3 pt-2">
            <Checkbox
              id="create-article"
              checked={createArticle}
              onCheckedChange={(checked) => setCreateArticle(checked === true)}
            />
            <div className="grid gap-1 leading-none">
              <Label
                htmlFor="create-article"
                className="text-sm font-medium cursor-pointer"
              >
                Criar artigo na Base de Conhecimento
              </Label>
              <p className="text-xs text-muted-foreground">
                Marque se esta solução pode ser útil para outros casos similares
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => resolveMutation.mutate()}
            disabled={!canSubmit || resolveMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {resolveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Finalizando...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Finalizar Chamado
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
