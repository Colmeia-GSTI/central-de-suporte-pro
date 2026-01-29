import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import { TagsInput } from "@/components/tickets/TagsInput";
import type { Tables, Enums } from "@/integrations/supabase/types";

const ticketSchema = z.object({
  title: z.string().min(5, "Título deve ter pelo menos 5 caracteres"),
  description: z.string().optional(),
  client_id: z.string().optional(),
  category_id: z.string().optional(),
  subcategory_id: z.string().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  origin: z.enum(["portal", "phone", "email", "chat", "whatsapp"]),
});

type TicketFormData = z.infer<typeof ticketSchema>;

interface TicketFormProps {
  onSuccess: () => void;
  onCancel: () => void;
  initialData?: {
    title?: string;
    description?: string;
    client_id?: string;
    priority?: "low" | "medium" | "high" | "critical";
  };
}

export function TicketForm({ onSuccess, onCancel, initialData }: TicketFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      title: initialData?.title || "",
      description: initialData?.description || "",
      client_id: initialData?.client_id || "",
      priority: initialData?.priority || "medium",
      origin: "portal",
      category_id: "",
      subcategory_id: "",
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: "ticket_new",
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

  const { data: categories = [] } = useQuery({
    queryKey: ["categories-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["subcategories-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_subcategories")
        .select("id, category_id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Filter subcategories based on selected category
  const selectedCategoryId = form.watch("category_id");
  const filteredSubcategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    return subcategories.filter((sub) => sub.category_id === selectedCategoryId);
  }, [subcategories, selectedCategoryId]);

  const mutation = useMutation({
    mutationFn: async (data: TicketFormData) => {
      const payload = {
        title: data.title,
        description: data.description || null,
        client_id: data.client_id || null,
        category_id: data.category_id || null,
        subcategory_id: data.subcategory_id || null,
        priority: data.priority as Enums<"ticket_priority">,
        origin: data.origin as Enums<"ticket_origin">,
        created_by: user?.id,
        status: "open" as Enums<"ticket_status">,
      };

      const { data: newTicket, error } = await supabase
        .from("tickets")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      // Registrar criação no histórico
      if (newTicket?.id) {
        const { error: historyError } = await supabase.from("ticket_history").insert({
          ticket_id: newTicket.id,
          user_id: user?.id,
          old_status: null,
          new_status: "open" as const,
          comment: "Chamado criado",
        });
        if (historyError) {
          console.warn("Failed to insert creation history:", historyError);
        }

        // Assign tags to the ticket
        if (selectedTagIds.length > 0) {
          const tagAssignments = selectedTagIds.map((tagId) => ({
            ticket_id: newTicket.id,
            tag_id: tagId,
          }));
          const { error: tagError } = await supabase
            .from("ticket_tag_assignments")
            .insert(tagAssignments);
          if (tagError) {
            console.warn("Failed to assign tags:", tagError);
          }
        }
      }
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: "Chamado criado",
        description: "O chamado foi criado com sucesso",
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast({
        title: "Chamado criado",
        description: "O chamado foi criado com sucesso",
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TicketFormData) => {
    mutation.mutate(data);
  };

  const handleCancel = () => {
    clearDraft();
    onCancel();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Título *</FormLabel>
              <FormControl>
                <Input placeholder="Descreva brevemente o problema" {...field} />
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
                <Textarea
                  placeholder="Descreva o problema em detalhes..."
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="client_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cliente</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente" />
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

          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    // Reset subcategory when category changes
                    form.setValue("subcategory_id", "");
                  }} 
                  value={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="subcategory_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Subcategoria</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  value={field.value}
                  disabled={filteredSubcategories.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={
                        filteredSubcategories.length === 0 
                          ? "Selecione uma categoria primeiro" 
                          : "Selecione uma subcategoria"
                      } />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {filteredSubcategories.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prioridade</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="origin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Origem</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="portal">Portal</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="chat">Chat</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Tags */}
        <div className="space-y-2">
          <Label>Tags</Label>
          <TagsInput
            selectedTagIds={selectedTagIds}
            onChange={setSelectedTagIds}
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Criando..." : "Criar Chamado"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
