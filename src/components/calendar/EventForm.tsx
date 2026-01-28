import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import type { Enums } from "@/integrations/supabase/types";

const eventSchema = z.object({
  title: z.string().min(2, "Título deve ter pelo menos 2 caracteres"),
  event_type: z.enum(["visit", "meeting", "on_call", "unavailable", "personal"]),
  start_date: z.string().min(1, "Data de início é obrigatória"),
  start_time: z.string().min(1, "Hora de início é obrigatória"),
  end_time: z.string().min(1, "Hora de término é obrigatória"),
  all_day: z.boolean().default(false),
  client_id: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

type EventFormData = z.infer<typeof eventSchema>;

interface EventFormProps {
  selectedDate?: Date | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function EventForm({ selectedDate, onSuccess, onCancel }: EventFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      event_type: "meeting",
      start_date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
      start_time: "09:00",
      end_time: "10:00",
      all_day: false,
      client_id: "",
      location: "",
      description: "",
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: "event_new",
    storage: "session",
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      const startTime = new Date(`${data.start_date}T${data.start_time}`);
      const endTime = new Date(`${data.start_date}T${data.end_time}`);

      const { error } = await supabase.from("calendar_events").insert({
        title: data.title,
        event_type: data.event_type as Enums<"event_type">,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        all_day: data.all_day,
        client_id: data.client_id || null,
        location: data.location || null,
        description: data.description || null,
        user_id: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      toast({ title: "Evento criado com sucesso" });
      onSuccess();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const handleCancel = () => {
    clearDraft();
    onCancel();
  };

  const isAllDay = form.watch("all_day");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título *</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Reunião com cliente" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="event_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo *</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="visit">Visita</SelectItem>
                    <SelectItem value="meeting">Reunião</SelectItem>
                    <SelectItem value="on_call">Plantão</SelectItem>
                    <SelectItem value="unavailable">Indisponível</SelectItem>
                    <SelectItem value="personal">Pessoal</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cliente</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="start_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data *</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="all_day"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="!mt-0">Dia inteiro</FormLabel>
            </FormItem>
          )}
        />

        {!isAllDay && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="start_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Início *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="end_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Término *</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Local</FormLabel>
              <FormControl>
                <Input placeholder="Endereço ou sala" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea placeholder="Detalhes do evento..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Criando..." : "Criar Evento"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
