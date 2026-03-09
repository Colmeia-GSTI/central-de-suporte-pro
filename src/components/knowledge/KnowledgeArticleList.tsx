import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Eye, Calendar, Globe, Lock, Edit, Trash2, ThumbsUp, BookOpen } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import type { Tables } from "@/integrations/supabase/types";

type ArticleWithCategory = Tables<"knowledge_articles"> & {
  knowledge_categories: { name: string; icon: string } | null;
  ticket_categories: { name: string } | null;
};

type SortOption = "recent" | "popular" | "helpful" | "alphabetical";

interface KnowledgeArticleListProps {
  articles: ArticleWithCategory[];
  isLoading: boolean;
  sortBy: SortOption;
  onSortChange: (value: SortOption) => void;
  onSelectArticle: (article: ArticleWithCategory) => void;
  onEditArticle: (article: ArticleWithCategory) => void;
  onDeleteArticle: (article: ArticleWithCategory) => void;
  searchHighlight?: string;
}

// Helper to highlight search terms
function highlightText(text: string, highlight: string): React.ReactNode {
  if (!highlight || highlight.length < 2) return text;
  
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-primary/30 text-foreground rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function KnowledgeArticleList({
  articles,
  isLoading,
  sortBy,
  onSortChange,
  onSelectArticle,
  onEditArticle,
  onDeleteArticle,
  searchHighlight,
}: KnowledgeArticleListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 bg-muted rounded animate-pulse" />
          <div className="h-10 w-40 bg-muted rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {articles.length} {articles.length === 1 ? "Artigo" : "Artigos"}
        </h2>
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="popular">Mais visualizados</SelectItem>
            <SelectItem value="helpful">Mais úteis</SelectItem>
            <SelectItem value="alphabetical">Alfabética</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="mx-auto h-16 w-16 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-medium">Nenhum artigo encontrado</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Não encontramos artigos com os filtros selecionados. Tente ajustar sua busca ou criar um novo artigo.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article, index) => {
            const categoryName = article.knowledge_categories?.name || article.ticket_categories?.name;
            const excerpt = article.excerpt || article.content.replace(/<[^>]*>/g, "").slice(0, 150);

            return (
              <Card
                key={article.id}
                interactive
                onClick={() => onSelectArticle(article)}
                className="animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-1">
                        {article.is_public ? (
                          <Globe className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        ) : (
                          <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        )}
                        <h3 className="font-medium line-clamp-1">
                          {highlightText(article.title, searchHighlight || "")}
                        </h3>
                        {article.is_pinned && (
                          <Badge variant="default" className="text-xs shrink-0">
                            Destaque
                          </Badge>
                        )}
                      </div>
                      
                      <p className="text-sm text-muted-foreground line-clamp-2 ml-6">
                        {highlightText(excerpt, searchHighlight || "")}
                        {article.content.length > 150 ? "..." : ""}
                      </p>

                      <div className="flex items-center gap-4 mt-3 ml-6">
                        {categoryName && (
                          <Badge variant="outline" className="text-xs">
                            {categoryName}
                          </Badge>
                        )}
                        
                        {/* Tags */}
                        {article.tags && article.tags.length > 0 && (
                          <div className="flex items-center gap-1">
                            {article.tags.slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {article.tags.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{article.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}

                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="h-3 w-3" />
                          {article.views}
                        </span>

                        {article.helpful_count > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <ThumbsUp className="h-3 w-3" />
                            {article.helpful_count}
                          </span>
                        )}

                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDistanceToNow(new Date(article.updated_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <PermissionGate module="knowledge" action="edit">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditArticle(article);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                      <PermissionGate module="knowledge" action="delete">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteArticle(article);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
