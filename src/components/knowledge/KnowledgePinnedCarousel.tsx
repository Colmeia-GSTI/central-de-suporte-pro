import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Pin, Eye, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";

type ArticleWithCategory = Tables<"knowledge_articles"> & {
  knowledge_categories: { name: string; icon: string } | null;
};

interface KnowledgePinnedCarouselProps {
  onSelectArticle: (article: ArticleWithCategory) => void;
}

export function KnowledgePinnedCarousel({ onSelectArticle }: KnowledgePinnedCarouselProps) {
  const { data: pinnedArticles = [], isLoading } = useQuery({
    queryKey: ["knowledge-articles-pinned"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_articles")
        .select("*, knowledge_categories(name, icon)")
        .eq("is_pinned", true)
        .order("order_index")
        .limit(6);

      if (error) throw error;
      return data as ArticleWithCategory[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="min-w-[300px] h-40 rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  if (pinnedArticles.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Pin className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Artigos em Destaque</h2>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin snap-x snap-mandatory">
        {pinnedArticles.map((article, index) => (
          <Card
            key={article.id}
            interactive
            onClick={() => onSelectArticle(article)}
            className="min-w-[300px] md:min-w-[350px] shrink-0 snap-start animate-in fade-in slide-in-from-bottom-4"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base line-clamp-2">
                  {article.title}
                </CardTitle>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                {article.excerpt || article.content.replace(/<[^>]*>/g, "").slice(0, 100)}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {article.knowledge_categories && (
                    <Badge variant="secondary" className="text-xs">
                      {article.knowledge_categories.name}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {article.views}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(article.updated_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
