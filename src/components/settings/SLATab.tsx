import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { Tables, Enums } from "@/integrations/supabase/types";

type SLAWithRelations = Tables<"sla_configs"> & {
  clients: { name: string } | null;
  ticket_categories: { name: string } | null;
};

const slaSchema = z.object({
  priority: z.enum(["low", "medium", "high", "critical"]),
  response_hours: z.coerce.number().min(1),
  resolution_hours: z.coerce.number().min(1),
  client_id: z.string().optional(),
  category_id: z.string().optional(),
  contract_id: z.string().optional(),
});

type SLAFormData = z.infer<typeof slaSchema>;

const priorityLabels: Record<Enums<"ticket_priority">, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

const priorityColors: Record<Enums<"ticket_priority">, string> = {
  low: "bg-priority-low text-white",
  medium: "bg-priority-medium text-white",
  high: "bg-priority-high text-white",
  critical: "bg-priority-critical text-white",
};

export function SLATab() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSLA, setEditingSLA] = useState<SLAWithRelations | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<SLAFormData>({
    resolver: zodResolver(slaSchema),
    defaultValues: {
      priority: "medium",
      response_hours: 4,
      resolution_hours: 24,
    },
  });

  const { data: slaConfigs = [], isLoading } = useQuery({
    queryKey: ["sla-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sla_configs")
        .select("*, clients(name), ticket_categories(name)")
        .order("priority");
      if (error) throw error;
      return data as (SLAWithRelations & { contract_id?: string | null })[];
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-select-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, name")
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
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

  const mutation = useMutation({
    mutationFn: async (data: SLAFormData) => {
      const payload = {
        priority: data.priority as Enums<"ticket_priority">,
        response_hours: data.response_hours,
        resolution_hours: data.resolution_hours,
        client_id: data.client_id || null,
        category_id: data.category_id || null,
      };

      if (editingSLA) {
        const { error } = await supabase
          .from("sla_configs")
          .update(payload)
          .eq("id", editingSLA.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sla_configs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sla-configs"] });
      toast({ title: editingSLA ? "SLA atualizado" : "SLA criado" });
      handleCloseForm();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sla_configs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sla-configs"] });
      toast({ title: "SLA excluído" });
    },
  });

  const handleEdit = (sla: SLAWithRelations) => {
    setEditingSLA(sla);
    form.reset({
      priority: sla.priority,
      response_hours: sla.response_hours,
      resolution_hours: sla.resolution_hours,
      client_id: sla.client_id || "",
      category_id: sla.category_id || "",
    });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingSLA(null);
    form.reset({ priority: "medium", response_hours: 4, resolution_hours: 24 });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Configurações de SLA</CardTitle>
          <CardDescription>
            Defina tempos de resposta e resolução por prioridade
          </CardDescription>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingSLA(null); form.reset(); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo SLA
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSLA ? "Editar SLA" : "Novo SLA"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridade *</FormLabel>
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

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="response_hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resposta (horas) *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="resolution_hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Resolução (horas) *</FormLabel>
                        <FormControl>
                          <Input type="number" min={1} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente (opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Padrão para todos" />
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
                      <FormLabel>Categoria (opcional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas as categorias" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCloseForm}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Salvando..." : editingSLA ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prioridade</TableHead>
                <TableHead>Resposta</TableHead>
                <TableHead>Resolução</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : slaConfigs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Clock className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-2 text-muted-foreground">Nenhum SLA configurado</p>
                  </TableCell>
                </TableRow>
              ) : (
                slaConfigs.map((sla) => (
                  <TableRow key={sla.id}>
                    <TableCell>
                      <Badge className={priorityColors[sla.priority]}>
                        {priorityLabels[sla.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell>{sla.response_hours}h</TableCell>
                    <TableCell>{sla.resolution_hours}h</TableCell>
                    <TableCell>{sla.clients?.name || "Todos"}</TableCell>
                    <TableCell>{sla.ticket_categories?.name || "Todas"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(sla)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(sla.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
