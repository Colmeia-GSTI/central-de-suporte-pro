import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Plus, Edit, Trash2, ChevronRight, ChevronDown, FolderTree } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

const subcategorySchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  description: z.string().optional(),
  sla_hours_override: z.coerce.number().min(1).optional().or(z.literal("")),
  is_active: z.boolean().default(true),
});

type SubcategoryFormData = z.infer<typeof subcategorySchema>;

interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  sla_hours_override: number | null;
  is_active: boolean;
}

interface Category {
  id: string;
  name: string;
  sla_hours: number | null;
  is_active: boolean;
}

interface SubcategoriesSectionProps {
  categories: Category[];
}

export function SubcategoriesSection({ categories }: SubcategoriesSectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<Subcategory | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<SubcategoryFormData>({
    resolver: zodResolver(subcategorySchema),
    defaultValues: {
      name: "",
      description: "",
      sla_hours_override: "",
      is_active: true,
    },
  });

  const { data: subcategories = [] } = useQuery({
    queryKey: ["ticket-subcategories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_subcategories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Subcategory[];
    },
  });

  const subcategoriesByCategory = subcategories.reduce((acc, sub) => {
    if (!acc[sub.category_id]) acc[sub.category_id] = [];
    acc[sub.category_id].push(sub);
    return acc;
  }, {} as Record<string, Subcategory[]>);

  const mutation = useMutation({
    mutationFn: async (data: SubcategoryFormData) => {
      const payload = {
        category_id: selectedCategoryId!,
        name: data.name,
        description: data.description || null,
        sla_hours_override: data.sla_hours_override ? Number(data.sla_hours_override) : null,
        is_active: data.is_active,
      };

      if (editingSubcategory) {
        const { error } = await supabase
          .from("ticket_subcategories")
          .update(payload)
          .eq("id", editingSubcategory.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ticket_subcategories").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-subcategories"] });
      toast({ title: editingSubcategory ? "Subcategoria atualizada" : "Subcategoria criada" });
      handleCloseForm();
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ticket_subcategories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket-subcategories"] });
      toast({ title: "Subcategoria excluída" });
    },
    onError: () => {
      toast({ title: "Erro ao excluir subcategoria", variant: "destructive" });
    },
  });

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAddSubcategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setEditingSubcategory(null);
    form.reset({ name: "", description: "", sla_hours_override: "", is_active: true });
    setIsFormOpen(true);
  };

  const handleEditSubcategory = (subcategory: Subcategory) => {
    setSelectedCategoryId(subcategory.category_id);
    setEditingSubcategory(subcategory);
    form.reset({
      name: subcategory.name,
      description: subcategory.description || "",
      sla_hours_override: subcategory.sla_hours_override || "",
      is_active: subcategory.is_active,
    });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingSubcategory(null);
    setSelectedCategoryId(null);
    form.reset();
  };

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <FolderTree className="h-4 w-4" />
        Subcategorias por Categoria
      </div>

      <div className="space-y-2">
        {categories.map((category) => {
          const subs = subcategoriesByCategory[category.id] || [];
          const isExpanded = expandedCategories.has(category.id);

          return (
            <Collapsible
              key={category.id}
              open={isExpanded}
              onOpenChange={() => toggleCategory(category.id)}
            >
              <div className="rounded-lg border bg-card">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left">
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="font-medium">{category.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {subs.length} sub
                      </Badge>
                      {category.sla_hours && (
                        <span className="text-xs text-muted-foreground">
                          SLA: {category.sla_hours}h
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddSubcategory(category.id);
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Subcategoria
                    </Button>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t px-3 pb-3">
                    {subs.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-3 text-center">
                        Nenhuma subcategoria. Clique em "+ Subcategoria" para adicionar.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {subs.map((sub) => (
                          <div
                            key={sub.id}
                            className="flex items-center justify-between py-2"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">└</span>
                              <span className={sub.is_active ? "" : "text-muted-foreground line-through"}>
                                {sub.name}
                              </span>
                              {sub.sla_hours_override && (
                                <span className="text-xs text-muted-foreground">
                                  ({sub.sla_hours_override}h)
                                </span>
                              )}
                              {!sub.is_active && (
                                <Badge variant="secondary" className="text-xs">
                                  Inativo
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleEditSubcategory(sub)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => deleteMutation.mutate(sub.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSubcategory ? "Editar Subcategoria" : "Nova Subcategoria"}
            </DialogTitle>
          </DialogHeader>
          {selectedCategory && (
            <p className="text-sm text-muted-foreground">
              Categoria: <strong>{selectedCategory.name}</strong>
            </p>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Servidor Virtual" {...field} />
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
                      <Textarea placeholder="Descrição opcional..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sla_hours_override"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SLA Específico (horas)</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} placeholder="Usar SLA da categoria" {...field} />
                    </FormControl>
                    <FormDescription>
                      Deixe em branco para herdar o SLA da categoria ({selectedCategory?.sla_hours}h)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <FormLabel className="!mt-0">Ativo</FormLabel>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleCloseForm}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Salvando..." : editingSubcategory ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
