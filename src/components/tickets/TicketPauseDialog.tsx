import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Pause, Clock, UserX, Building } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Enums } from "@/integrations/supabase/types";

type PauseType = "manual" | "no_contact" | "third_party";

interface TicketPauseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  onSuccess?: () => void;
}

export function TicketPauseDialog({
  open,
  onOpenChange,
  ticketId,
  onSuccess,
}: TicketPauseDialogProps) {
  const [pauseType, setPauseType] = useState<PauseType>("manual");
  const [reason, setReason] = useState("");
  const [thirdPartyName, setThirdPartyName] = useState("");
  const [autoResumeHours, setAutoResumeHours] = useState("2");
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const getStatusForPauseType = (type: PauseType): Enums<"ticket_status"> => {
    switch (type) {
      case "no_contact":
        return "no_contact";
      case "third_party":
        return "waiting_third_party";
      default:
        return "paused";
    }
  };

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) {
        throw new Error("Informe o motivo da pausa");
      }
      if (pauseType === "third_party" && !thirdPartyName.trim()) {
        throw new Error("Informe o nome do terceiro");
      }

      // Capturar status atual para registrar no histórico
      const { data: ticketBefore } = await supabase
        .from("tickets")
        .select("status")
        .eq("id", ticketId)
        .maybeSingle();
      const oldStatus = (ticketBefore?.status as Enums<"ticket_status"> | null) ?? null;

      const newStatus = getStatusForPauseType(pauseType);
      
      // Calculate auto-resume time for no_contact
      let autoResumeAt: string | null = null;
      if (pauseType === "no_contact") {
        const hours = parseInt(autoResumeHours) || 2;
        const resumeDate = new Date();
        resumeDate.setHours(resumeDate.getHours() + hours);
        autoResumeAt = resumeDate.toISOString();
      }

      // Create pause record
      const { error: pauseError } = await supabase.from("ticket_pauses").insert({
        ticket_id: ticketId,
        paused_by: user?.id,
        pause_reason: reason,
        pause_type: pauseType,
        third_party_name: pauseType === "third_party" ? thirdPartyName : null,
        auto_resume_at: autoResumeAt,
      });
      if (pauseError) throw pauseError;

      // Update ticket status
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({ status: newStatus })
        .eq("id", ticketId);
      if (ticketError) throw ticketError;

      // Registrar no histórico (best-effort)
      const pauseLabel =
        pauseType === "no_contact"
          ? "Sem contato"
          : pauseType === "third_party"
            ? "Aguardando terceiro"
            : "Pausa";

      const { error: historyError } = await supabase.from("ticket_history").insert([
        {
          ticket_id: ticketId,
          user_id: user?.id,
          old_status: oldStatus,
          new_status: newStatus,
          comment: `${pauseLabel}: ${reason.trim()}`,
        },
      ]);

      if (historyError) {
        logger.warn("Failed to insert ticket_history (pause)", "Tickets", { error: historyError.message });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-history", ticketId] });
      toast({ title: "Chamado pausado com sucesso" });
      handleClose();
      onSuccess?.();
    },
    onError: (error) => {
      toast({
        title: "Erro ao pausar chamado",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setPauseType("manual");
    setReason("");
    setThirdPartyName("");
    setAutoResumeHours("2");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pause className="h-5 w-5" />
            Pausar Chamado
          </DialogTitle>
          <DialogDescription>
            Selecione o tipo de pausa e informe o motivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Pause Type Selection */}
          <div className="space-y-3">
            <Label>Tipo de Pausa</Label>
            <RadioGroup
              value={pauseType}
              onValueChange={(v) => setPauseType(v as PauseType)}
              className="space-y-2"
            >
              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">Pausa Manual</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Pausar temporariamente o chamado
                  </p>
                </Label>
              </div>

              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="no_contact" id="no_contact" />
                <Label htmlFor="no_contact" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <UserX className="h-4 w-4 text-orange-500" />
                    <span className="font-medium">Sem Contato</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Cliente não respondeu às tentativas de contato
                  </p>
                </Label>
              </div>

              <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
                <RadioGroupItem value="third_party" id="third_party" />
                <Label htmlFor="third_party" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">Aguardando Terceiro</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Dependendo de resposta de fornecedor/parceiro
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Third Party Name (when applicable) */}
          {pauseType === "third_party" && (
            <div className="space-y-2">
              <Label>Nome do Terceiro *</Label>
              <Input
                value={thirdPartyName}
                onChange={(e) => setThirdPartyName(e.target.value)}
                placeholder="Ex: Microsoft, Dell, Provedor de Internet..."
              />
            </div>
          )}

          {/* Auto Resume (for no_contact) */}
          {pauseType === "no_contact" && (
            <div className="space-y-2">
              <Label>Lembrete de Recontato</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="48"
                  value={autoResumeHours}
                  onChange={(e) => setAutoResumeHours(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">horas</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Você receberá uma notificação para tentar contato novamente
              </p>
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label>Motivo da Pausa *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                pauseType === "no_contact"
                  ? "Ex: Tentei ligar 3x sem resposta..."
                  : pauseType === "third_party"
                    ? "Ex: Aguardando resposta do suporte da Microsoft..."
                    : "Descreva o motivo da pausa..."
              }
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending || !reason.trim() || (pauseType === "third_party" && !thirdPartyName.trim())}
            >
              {pauseMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Pausando...
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pausar Chamado
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
