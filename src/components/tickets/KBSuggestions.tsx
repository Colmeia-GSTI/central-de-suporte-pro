import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { BookOpen, ExternalLink, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface KBSuggestionsProps {
  title: string;
  description: string;
}

export function KBSuggestions({ title, description }: KBSuggestionsProps) {
  const searchText = `${title} ${description}`.trim();
  const debouncedSearch = useDebounce(searchText, 800);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["kb-suggestions", debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.length < 10) return [];

      // Extract meaningful words (>3 chars) for search
      const words = debouncedSearch
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 6);

      if (words.length === 0) return [];

      // Search using ilike on title and content
      const orFilter = words
        .map((w) => `title.ilike.%${w}%,content.ilike.%${w}%`)
        .join(",");

      const { data, error } = await supabase
        .from("knowledge_articles")
        .select("id, title, slug, excerpt, tags, views")
        .or(orFilter)
        .eq("is_public", true)
        .order("views", { ascending: false })
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    enabled: debouncedSearch.length >= 10,
    staleTime: 60000,
  });

  if (debouncedSearch.length < 10) return null;

  if (isLoading) {
    return (
      <div className="space-y-2 mt-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5" />
          Buscando artigos relacionados...
        </div>
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Lightbulb className="h-3.5 w-3.5 text-primary" />
        Artigos que podem ajudar
      </div>
      <div className="grid gap-2">
        {suggestions.map((article) => (
          <a
            key={article.id}
            href={`/knowledge/${article.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group"
          >
            <Card className="hover:border-primary/40 transition-colors cursor-pointer">
              <CardContent className="p-3 flex items-start gap-3">
                <BookOpen className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                    {article.title}
                  </p>
                  {article.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{article.excerpt}</p>
                  )}
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}
