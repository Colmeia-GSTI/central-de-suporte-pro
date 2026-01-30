import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Clock, MapPin, User, Calendar, Trash2, Edit } from "lucide-react";
import type { Tables, Enums } from "@/integrations/supabase/types";

type EventWithClient = Tables<"calendar_events"> & {
  clients: { name: string } | null;
};

const eventTypeLabels: Record<Enums<"event_type">, string> = {
  visit: "Visita",
  meeting: "Reunião",
  on_call: "Plantão",
  unavailable: "Indisponível",
  personal: "Pessoal",
  billing_reminder: "Cobrança",
};

const eventTypeColors: Record<Enums<"event_type">, string> = {
  visit: "bg-info text-info-foreground",
  meeting: "bg-primary text-primary-foreground",
  on_call: "bg-warning text-warning-foreground",
  unavailable: "bg-muted text-muted-foreground",
  personal: "bg-accent text-accent-foreground",
  billing_reminder: "bg-destructive text-destructive-foreground",
};

interface EventDetailsSheetProps {
  event: EventWithClient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (event: EventWithClient) => void;
}

export function EventDetailsSheet({
  event,
  open,
  onOpenChange,
  onEdit,
}: EventDetailsSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast({ title: "Evento excluído" });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!event) return null;

  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[85vh] rounded-t-xl">
        <SheetHeader className="text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-xl truncate">{event.title}</SheetTitle>
              <SheetDescription className="mt-1">
                <Badge
                  variant="secondary"
                  className={`${eventTypeColors[event.event_type]} border-0`}
                >
                  {eventTypeLabels[event.event_type]}
                </Badge>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Date & Time */}
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">
                {format(startDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
              </p>
              {!event.all_day && (
                <p className="text-sm text-muted-foreground">
                  {format(startDate, "HH:mm")} - {format(endDate, "HH:mm")}
                </p>
              )}
              {event.all_day && (
                <p className="text-sm text-muted-foreground">Dia inteiro</p>
              )}
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
              <p>{event.location}</p>
            </div>
          )}

          {/* Client */}
          {event.clients && (
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <p>{event.clients.name}</p>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Descrição</p>
                <p className="whitespace-pre-wrap">{event.description}</p>
              </div>
            </>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            {onEdit && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onEdit(event)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </Button>
            )}
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => deleteMutation.mutate(event.id)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
