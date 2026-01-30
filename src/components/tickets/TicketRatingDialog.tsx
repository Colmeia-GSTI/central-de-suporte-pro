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
import { Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TicketRatingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string;
  ticketNumber: number;
  ticketTitle: string;
  onSuccess?: () => void;
}

export function TicketRatingDialog({
  open,
  onOpenChange,
  ticketId,
  ticketNumber,
  ticketTitle,
  onSuccess,
}: TicketRatingDialogProps) {
  const [rating, setRating] = useState(5);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const ratingMutation = useMutation({
    mutationFn: async () => {
      // Update ticket with rating and change status to closed
      const { error: ticketError } = await supabase
        .from("tickets")
        .update({
          satisfaction_rating: rating,
          satisfaction_comment: comment || null,
          status: "closed",
        })
        .eq("id", ticketId);

      if (ticketError) throw ticketError;

      // Register in history
      const { error: historyError } = await supabase
        .from("ticket_history")
        .insert({
          ticket_id: ticketId,
          user_id: user?.id,
          old_status: "resolved",
          new_status: "closed",
          comment: `Avaliação do cliente: ${rating}/5 estrelas${comment ? ` - "${comment}"` : ""}`,
        });

      if (historyError) {
        console.warn("Failed to insert history:", historyError);
      }

      // Award points to technician if good rating
      if (rating >= 4) {
        const { data: ticket } = await supabase
          .from("tickets")
          .select("assigned_to")
          .eq("id", ticketId)
          .single();

        if (ticket?.assigned_to) {
          const pointsToAward = rating === 5 ? 15 : 10;
          await supabase.from("technician_points").insert({
            user_id: ticket.assigned_to,
            points: pointsToAward,
            reason: `Avaliação ${rating}/5 no chamado #${ticketNumber}`,
            ticket_id: ticketId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-tickets"] });
      toast({ title: "Obrigado pela avaliação!" });
      onOpenChange(false);
      setRating(5);
      setComment("");
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Erro ao enviar avaliação", variant: "destructive" });
    },
  });

  const displayRating = hoveredRating || rating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Avaliar Atendimento</DialogTitle>
          <DialogDescription>
            Chamado #{ticketNumber} - {ticketTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Como você avalia o atendimento?</Label>
            <div className="flex justify-center gap-2 py-4">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="p-1 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary rounded"
                  onMouseEnter={() => setHoveredRating(value)}
                  onMouseLeave={() => setHoveredRating(0)}
                  onClick={() => setRating(value)}
                >
                  <Star
                    className={`h-8 w-8 transition-colors ${
                      value <= displayRating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {rating === 1 && "Muito ruim"}
              {rating === 2 && "Ruim"}
              {rating === 3 && "Regular"}
              {rating === 4 && "Bom"}
              {rating === 5 && "Excelente"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comment">Comentário (opcional)</Label>
            <Textarea
              id="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Deixe um comentário sobre o atendimento..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => ratingMutation.mutate()}
              disabled={ratingMutation.isPending}
            >
              {ratingMutation.isPending ? "Enviando..." : "Enviar Avaliação"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
