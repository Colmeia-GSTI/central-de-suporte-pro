import { useEffect, useRef, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Eye, 
  Calendar, 
  Globe, 
  Lock, 
  Clock, 
  Share2, 
  Copy, 
  Check,
  ChevronRight,
  ThumbsUp 
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { ArticleFeedback } from "./ArticleFeedback";
import { ArticleTableOfContents } from "./ArticleTableOfContents";
import { MarkdownPreviewRenderer } from "./MarkdownPreviewRenderer";
import type { Tables } from "@/integrations/supabase/types";
import { useState } from "react";

type ArticleWithCategory = Tables<"knowledge_articles"> & {
  knowledge_categories?: { name: string; icon?: string } | null;
  ticket_categories?: { name: string } | null;
};

interface ArticleViewerProps {
  article: ArticleWithCategory;
}

function calculateReadingTime(content: string): number {
  const words = content.replace(/<[^>]*>/g, "").split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function ArticleViewer({ article }: ArticleViewerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasIncrementedRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: relatedArticles = [] } = useQuery({
    queryKey: ["knowledge-articles-related", article.id, article.knowledge_category_id],
    queryFn: async () => {
      if (!article.knowledge_category_id) return [];
      const { data, error } = await supabase
        .from("knowledge_articles")
        .select("id, title, slug, views")
        .eq("knowledge_category_id", article.knowledge_category_id)
        .neq("id", article.id)
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!article.knowledge_category_id,
  });

  const incrementViewsMutation = useMutation({
    mutationFn: async () => {
      try {
        const { error } = await supabase.rpc("increment_article_views", {
          article_id: article.id,
        });
        if (error) throw error;
      } catch {
        const { error } = await supabase
          .from("knowledge_articles")
          .update({ views: (article.views || 0) + 1 })
          .eq("id", article.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
    },
  });

  useEffect(() => {
    if (hasIncrementedRef.current !== article.id) {
      hasIncrementedRef.current = article.id;
      incrementViewsMutation.mutate();
    }
  }, [article.id]);

  const categoryName = article.knowledge_categories?.name || article.ticket_categories?.name;
  const readingTime = useMemo(() => calculateReadingTime(article.content), [article.content]);

  const formattedDate = (() => {
    try {
      return format(new Date(article.updated_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return "Data indisponível";
    }
  })();

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/knowledge/${article.slug || article.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copiado!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleScrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-8">
      {categoryName && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="hover:text-foreground cursor-pointer transition-colors">Base de Conhecimento</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="hover:text-foreground cursor-pointer transition-colors">{categoryName}</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium truncate max-w-[240px]">{article.title}</span>
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 shrink-0">
            {article.is_public ? (
              <Globe className="h-5 w-5 text-primary" />
            ) : (
              <Lock className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold leading-tight text-foreground">{article.title}</h1>
            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs font-medium bg-secondary/60">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-border/40">
          {categoryName && (
            <Badge variant="outline" className="font-medium border-primary/30 text-primary">
              {categoryName}
            </Badge>
          )}
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            {(article.views || 0) + 1}
          </span>
          {article.helpful_count > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ThumbsUp className="h-3.5 w-3.5" />
              {article.helpful_count}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {readingTime} min
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {formattedDate}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-1.5 h-8 text-xs">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar link"}
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
              <Share2 className="h-3.5 w-3.5" />
              Compartilhar
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-10">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <MarkdownPreviewRenderer content={article.content} />
        </div>
        <div className="hidden lg:block">
          <ArticleTableOfContents
            content={article.content}
            onItemClick={handleScrollToHeading}
          />
        </div>
      </div>

      <ArticleFeedback articleId={article.id} />

      {relatedArticles.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 text-foreground">Artigos Relacionados</h3>
          <div className="grid gap-2">
            {relatedArticles.map((related) => (
              <button
                key={related.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-primary/5 hover:border-primary/30 transition-all text-left group"
              >
                <span className="font-medium text-foreground group-hover:text-primary transition-colors">{related.title}</span>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  {related.views}
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
