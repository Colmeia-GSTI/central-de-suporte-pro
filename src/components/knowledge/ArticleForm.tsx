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
import { useFormPersistence } from "@/hooks/useFormPersistence";
import { DraftRecoveryBanner } from "@/components/ui/DraftRecoveryBanner";
import type { Tables } from "@/integrations/supabase/types";

const articleSchema = z.object({
  title: z.string()
    .min(5, "Título deve ter pelo menos 5 caracteres")
    .max(255, "Título deve ter no máximo 255 caracteres"),
  content: z.string()
    .min(20, "Conteúdo deve ter pelo menos 20 caracteres")
    .max(50000, "Conteúdo deve ter no máximo 50.000 caracteres"),
  category_id: z.string().optional(),
  is_public: z.boolean().default(true),
});

type ArticleFormData = z.infer<typeof articleSchema>;

interface ArticleFormProps {
  article?: Tables<"knowledge_articles"> | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ArticleForm({ article, onSuccess, onCancel }: ArticleFormProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const form = useForm<ArticleFormData>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: article?.title || "",
      content: article?.content || "",
      category_id: article?.category_id || "",
      is_public: article?.is_public ?? true,
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: article ? `article_edit_${article.id}` : "article_new",
    storage: "session",
    enabled: !article,
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
    mutationFn: async (data: ArticleFormData) => {
      if (!user?.id) {
        throw new Error("Usuário não autenticado. Faça login novamente.");
      }

      const payload = {
        title: data.title.trim(),
        content: data.content,
        category_id: data.category_id || null,
        is_public: data.is_public,
        author_id: user.id,
      };

      if (article) {
        const { error } = await supabase
          .from("knowledge_articles")
          .update(payload)
          .eq("id", article.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("knowledge_articles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      clearDraft();
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
      toast({ title: article ? "Artigo atualizado" : "Artigo criado" });
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
                <Input placeholder="Título do artigo" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
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

          <FormField
            control={form.control}
            name="is_public"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2 pt-8">
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="!mt-0">Público</FormLabel>
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conteúdo *</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Conteúdo do artigo (suporta Markdown)"
                  rows={12}
                  {...field}
                />
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
            {mutation.isPending ? "Salvando..." : article ? "Atualizar" : "Criar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
