import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PhoneOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface NoContactButtonProps {
  ticketId: string;
  ticketNumber: number;
  currentStatus: string;
  onSuccess?: () => void;
}

export function NoContactButton({
  ticketId,
  ticketNumber,
  currentStatus,
  onSuccess,
}: NoContactButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [observation, setObservation] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const noContactMutation = useMutation({
    mutationFn: async () => {
      // Update ticket status to no_contact
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({
          status: "no_contact",
        })
        .eq("id", ticketId);

      if (ticketError) throw ticketError;

      // Register in history
      const { error: historyError } = await supabase
        .from("ticket_history")
        .insert({
          ticket_id: ticketId,
          user_id: user?.id,
          old_status: currentStatus,
          new_status: "no_contact",
          comment: `Tentativa de contato sem sucesso${observation ? `: ${observation}` : ""}`,
        });

      if (historyError) {
        console.warn("Failed to insert history:", historyError);
      }

      // Add public comment to notify client
      const { error: commentError } = await supabase
        .from("ticket_comments")
        .insert({
          ticket_id: ticketId,
          user_id: user?.id,
          content: `📞 Tentativa de contato realizada sem sucesso.${
            observation ? ` Observação: ${observation}` : ""
          } Por favor, entre em contato conosco.`,
          is_internal: false,
        });

      if (commentError) {
        console.warn("Failed to insert comment:", commentError);
      }

      // Send notification to client
      await supabase.functions.invoke("send-ticket-notification", {
        body: {
          ticket_id: ticketId,
          event_type: "updated",
          comment: `Tentativa de contato sem sucesso. Por favor, entre em contato conosco.`,
        },
      }).catch(console.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({ 
        title: "Sem contato registrado",
        description: "O cliente será notificado para entrar em contato."
      });
      setIsOpen(false);
      setObservation("");
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Erro ao registrar sem contato", variant: "destructive" });
    },
  });

  // Only show for statuses that make sense
  const canMarkNoContact = ["open", "in_progress", "waiting"].includes(currentStatus);
  if (!canMarkNoContact) return null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-1 text-orange-600 border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
      >
        <PhoneOff className="h-4 w-4" />
        Sem Contato
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneOff className="h-5 w-5 text-orange-500" />
              Registrar Sem Contato
            </DialogTitle>
            <DialogDescription>
              Chamado #{ticketNumber} - Registre que não conseguiu contato com o cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="observation">Observação (opcional)</Label>
              <Textarea
                id="observation"
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Ex: Ligação não atendida, caixa postal..."
                rows={3}
              />
            </div>

            <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3 rounded-lg">
              <p className="text-sm text-orange-800 dark:text-orange-200">
                O cliente será notificado via WhatsApp/Email para entrar em contato conosco.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={() => noContactMutation.mutate()}
                disabled={noContactMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {noContactMutation.isPending ? "Registrando..." : "Confirmar Sem Contato"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
