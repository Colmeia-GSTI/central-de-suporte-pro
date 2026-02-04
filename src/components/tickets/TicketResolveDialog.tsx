import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Clock, Loader2 } from "lucide-react";
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
  onSuccess,
}: TicketResolveDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [extraHours, setExtraHours] = useState(0);
  const [extraMinutes, setExtraMinutes] = useState(0);
  const [extraBillable, setExtraBillable] = useState(true);
  const [createArticle, setCreateArticle] = useState(false);

  // Fetch existing time entries
  const { data: timeEntries = [] } = useQuery({
    queryKey: ["ticket-time-entries-summary", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_time_entries")
        .select("duration_minutes, is_billable")
        .eq("ticket_id", ticketId);
      
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const totalMinutes = timeEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);
  const billableMinutes = timeEntries
    .filter(e => e.is_billable)
    .reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

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
            is_billable: extraBillable,
          });
        
        if (timeError) throw timeError;
      }
      
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
      const finalTotal = totalMinutes + extraMins;
      const timeInfo = finalTotal > 0 ? ` (${formatDuration(finalTotal)} trabalhadas)` : "";
      
      const { error: historyError } = await supabase
        .from("ticket_history")
        .insert({
          ticket_id: ticketId,
          user_id: user.id,
          old_status: currentStatus,
          new_status: "resolved" as Enums<"ticket_status">,
          comment: `Chamado resolvido${timeInfo}: ${resolutionNotes.trim()}`,
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
          // Don't fail the resolution if article creation fails
          toast.warning("Chamado resolvido, mas houve erro ao criar o artigo");
        }
      }
    },
    onSuccess: () => {
      toast.success("Chamado finalizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["ticket-time-entries", ticketId] });
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
    setExtraBillable(true);
    setCreateArticle(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const canSubmit = resolutionNotes.trim().length > 0;

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
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Tempo Registrado</span>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Total: </span>
                  <span className="font-medium">{formatDuration(totalMinutes)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Faturável: </span>
                  <span className="font-medium text-green-600">{formatDuration(billableMinutes)}</span>
                </div>
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
              <div className="flex items-center gap-2 ml-2">
                <Switch
                  id="extra-billable"
                  checked={extraBillable}
                  onCheckedChange={setExtraBillable}
                />
                <Label htmlFor="extra-billable" className="text-sm cursor-pointer">
                  Faturável
                </Label>
              </div>
            </div>
          </div>

          {/* Resolution Notes */}
          <div className="space-y-2">
            <Label htmlFor="resolution-notes">
              Descreva a solução aplicada <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="resolution-notes"
              placeholder="Descreva detalhadamente a solução aplicada para resolver este chamado..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={4}
              className="resize-none"
            />
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
