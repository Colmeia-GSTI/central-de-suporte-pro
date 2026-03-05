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
import { Plus, Edit, Trash2, Tag, Lock } from "lucide-react";
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
  FormDescription,
} from "@/components/ui/form";
import { TagBadge } from "@/components/tickets/TagBadge";

const tagSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres").max(30, "Nome muito longo"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor deve ser hexadecimal (#RRGGBB)"),
});

type TagFormData = z.infer<typeof tagSchema>;

interface TicketTag {
  id: string;
  name: string;
  color: string | null;
  is_system: boolean;
  created_at: string;
}

const COLOR_PRESETS = [
  { name: "Vermelho", value: "#ef4444" },
  { name: "Laranja", value: "#f97316" },
  { name: "Amarelo", value: "#eab308" },
  { name: "Verde", value: "#22c55e" },
  { name: "Azul", value: "#3b82f6" },
  { name: "Roxo", value: "#8b5cf6" },
  { name: "Rosa", value: "#ec4899" },
  { name: "Cinza", value: "#6b7280" },
];

export function TagsTab() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<TicketTag | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<TagFormData>({
    resolver: zodResolver(tagSchema),
    defaultValues: {
      name: "",
      color: "#3b82f6",
    },
  });

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["ticket-tags-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_tags")
        .select("id, name, color, is_system")
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as TicketTag[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: TagFormData) => {
      const payload = {
        name: data.name.toLowerCase().replace(/\s+/g, "-"),
        color: data.color,
      };

      if (editingTag) {
        const { error } = await supabase
          .from("ticket_tags")
          .update(payload)
          .eq("id", editingTag.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ticket_tags").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-tags-admin"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-tags"] });
      toast({ title: editingTag ? "Tag atualizada" : "Tag criada" });
      handleCloseForm();
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate")) {
        toast({ title: "Erro", description: "Já existe uma tag com este nome", variant: "destructive" });
      } else {
        toast({ title: "Erro", description: error.message, variant: "destructive" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ticket_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-tags-admin"] });
      queryClient.invalidateQueries({ queryKey: ["ticket-tags"] });
      toast({ title: "Tag excluída" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir tag", variant: "destructive" });
    },
  });

  const handleEdit = (tag: TicketTag) => {
    setEditingTag(tag);
    form.reset({
      name: tag.name,
      color: tag.color || "#6b7280",
    });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingTag(null);
    form.reset({ name: "", color: "#3b82f6" });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tags de Tickets</CardTitle>
          <CardDescription>
            Gerencie as tags para classificação flexível de chamados
          </CardDescription>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingTag(null); form.reset(); }}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Tag
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTag ? "Editar Tag" : "Nova Tag"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: urgente" {...field} />
                      </FormControl>
                      <FormDescription>
                        Será convertido para minúsculas e hífens
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cor *</FormLabel>
                      <FormControl>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="w-12 h-10 rounded cursor-pointer border"
                            />
                            <Input
                              value={field.value}
                              onChange={(e) => field.onChange(e.target.value)}
                              placeholder="#000000"
                              className="w-32"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {COLOR_PRESETS.map((preset) => (
                              <button
                                key={preset.value}
                                type="button"
                                className="w-6 h-6 rounded border-2 transition-transform hover:scale-110"
                                style={{
                                  backgroundColor: preset.value,
                                  borderColor: field.value === preset.value ? "hsl(var(--foreground))" : "transparent",
                                }}
                                onClick={() => field.onChange(preset.value)}
                                title={preset.name}
                              />
                            ))}
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Preview */}
                <div className="pt-2">
                  <p className="text-sm text-muted-foreground mb-2">Preview:</p>
                  <TagBadge
                    name={form.watch("name") || "exemplo"}
                    color={form.watch("color")}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleCloseForm}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? "Salvando..." : editingTag ? "Atualizar" : "Criar"}
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
                <TableHead>Tag</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : tags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <Tag className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-2 text-muted-foreground">Nenhuma tag cadastrada</p>
                  </TableCell>
                </TableRow>
              ) : (
                tags.map((tag) => (
                  <TableRow key={tag.id}>
                    <TableCell>
                      <TagBadge name={tag.name} color={tag.color || "#6b7280"} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded border"
                          style={{ backgroundColor: tag.color || "#6b7280" }}
                        />
                        <code className="text-xs text-muted-foreground">
                          {tag.color || "#6b7280"}
                        </code>
                      </div>
                    </TableCell>
                    <TableCell>
                      {tag.is_system ? (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="h-3 w-3" />
                          Sistema
                        </Badge>
                      ) : (
                        <Badge variant="outline">Customizada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(tag)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!tag.is_system && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(tag.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
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
