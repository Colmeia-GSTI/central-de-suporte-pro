import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, Calendar, Globe, Lock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type ArticleWithCategory = Tables<"knowledge_articles"> & {
  ticket_categories: { name: string } | null;
};

interface ArticleViewerProps {
  article: ArticleWithCategory;
}

export function ArticleViewer({ article }: ArticleViewerProps) {
  const queryClient = useQueryClient();

  const incrementViewsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("knowledge_articles")
        .update({ views: article.views + 1 })
        .eq("id", article.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
    },
  });

  useEffect(() => {
    incrementViewsMutation.mutate();
  }, [article.id]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-start gap-2">
          {article.is_public ? (
            <Globe className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
          )}
          <h2 className="text-2xl font-bold">{article.title}</h2>
        </div>

        <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
          {article.ticket_categories && (
            <Badge variant="outline">{article.ticket_categories.name}</Badge>
          )}
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {article.views + 1} visualizações
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {format(new Date(article.updated_at), "dd 'de' MMMM 'de' yyyy", {
              locale: ptBR,
            })}
          </span>
        </div>
      </div>

      <Separator />

      {/* Content */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {article.content.split("\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </div>
  );
}
