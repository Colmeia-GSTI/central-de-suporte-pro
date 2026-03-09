import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
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
import { MarkdownEditor } from "./MarkdownEditor";
import { X, Pin } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { useState, KeyboardEvent } from "react";

const articleSchema = z.object({
  title: z.string()
    .min(5, "Título deve ter pelo menos 5 caracteres")
    .max(255, "Título deve ter no máximo 255 caracteres"),
  content: z.string()
    .min(20, "Conteúdo deve ter pelo menos 20 caracteres")
    .max(50000, "Conteúdo deve ter no máximo 50.000 caracteres"),
  excerpt: z.string().max(300, "Resumo deve ter no máximo 300 caracteres").optional(),
  knowledge_category_id: z.string().optional(),
  is_public: z.boolean().default(true),
  is_pinned: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
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
  const [tagInput, setTagInput] = useState("");

  const form = useForm<ArticleFormData>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: article?.title || "",
      content: article?.content || "",
      excerpt: article?.excerpt || "",
      knowledge_category_id: article?.knowledge_category_id || "",
      is_public: article?.is_public ?? true,
      is_pinned: article?.is_pinned ?? false,
      tags: article?.tags || [],
    },
  });

  const { clearDraft, wasRestored } = useFormPersistence({
    form,
    key: article ? `article_edit_${article.id}` : "article_new",
    storage: "session",
    enabled: !article,
  });

  // Fetch knowledge categories
  const { data: categories = [] } = useQuery({
    queryKey: ["knowledge-categories-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_categories")
        .select("id, name, icon")
        .eq("is_active", true)
        .order("order_index");
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
        excerpt: data.excerpt?.trim() || null,
        knowledge_category_id: data.knowledge_category_id || null,
        is_public: data.is_public,
        is_pinned: data.is_pinned,
        tags: data.tags,
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
      queryClient.invalidateQueries({ queryKey: ["knowledge-categories"] });
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

  // Tag management
  const tags = form.watch("tags");

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed) && tags.length < 10) {
      form.setValue("tags", [...tags, trimmed]);
    }
    setTagInput("");
  };

  const removeTag = (tagToRemove: string) => {
    form.setValue("tags", tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-6">
        {wasRestored && <DraftRecoveryBanner onClear={clearDraft} />}
        
        {/* Title */}
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

        {/* Category and Pinned */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="knowledge_category_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Categoria</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
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

          <div className="flex items-center gap-6 pt-8">
            <FormField
              control={form.control}
              name="is_public"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Público</FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_pinned"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0 flex items-center gap-1">
                    <Pin className="h-3 w-3" />
                    Fixar
                  </FormLabel>
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Excerpt */}
        <FormField
          control={form.control}
          name="excerpt"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Resumo</FormLabel>
              <FormControl>
                <Input 
                  placeholder="Breve descrição do artigo (exibido na listagem)" 
                  maxLength={300}
                  {...field} 
                />
              </FormControl>
              <FormDescription>
                {field.value?.length || 0}/300 caracteres
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Tags */}
        <FormField
          control={form.control}
          name="tags"
          render={() => (
            <FormItem>
              <FormLabel>Tags</FormLabel>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <Input
                  placeholder="Digite uma tag e pressione Enter"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => tagInput && addTag(tagInput)}
                />
                <FormDescription>
                  Adicione até 10 tags para facilitar a busca
                </FormDescription>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Content with Markdown Editor */}
        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Conteúdo *</FormLabel>
              <FormControl>
                <MarkdownEditor
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Escreva o conteúdo do artigo em Markdown..."
                  rows={16}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="button" variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : article ? "Atualizar" : "Criar Artigo"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
