import { useEffect, useRef, useMemo } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import type { Tables } from "@/integrations/supabase/types";
import { useState } from "react";

type ArticleWithCategory = Tables<"knowledge_articles"> & {
  knowledge_categories?: { name: string; icon?: string } | null;
  ticket_categories?: { name: string } | null;
};

interface ArticleViewerProps {
  article: ArticleWithCategory;
}

/**
 * Calculate estimated reading time based on word count
 */
function calculateReadingTime(content: string): number {
  const words = content.replace(/<[^>]*>/g, "").split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200)); // ~200 words per minute
}

/**
 * Simple Markdown-like rendering for article content.
 */
function renderContent(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const result: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        result.push(
          <pre key={`code-${i}`} className="bg-muted/60 border border-border/40 p-4 rounded-xl overflow-x-auto text-sm my-5 font-mono">
            <code>{codeBlockLines.join("\n")}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (line.startsWith("### ")) {
      const text = line.slice(4).trim();
      const headingId = `heading-${i}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      result.push(
        <h3 key={i} id={headingId} className="text-lg font-semibold mt-8 mb-3 scroll-mt-20 text-foreground">
          {formatInline(text)}
        </h3>
      );
    } else if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      const headingId = `heading-${i}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      result.push(
        <h2 key={i} id={headingId} className="text-xl font-semibold mt-10 mb-4 scroll-mt-20 text-foreground border-b border-border/40 pb-2">
          {formatInline(text)}
        </h2>
      );
    } else if (line.startsWith("# ")) {
      const text = line.slice(2).trim();
      const headingId = `heading-${i}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      result.push(
        <h1 key={i} id={headingId} className="text-2xl font-bold mt-10 mb-4 scroll-mt-20 text-foreground">
          {formatInline(text)}
        </h1>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      result.push(
        <li key={i} className="ml-6 list-disc my-1">{formatInline(line.slice(2))}</li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      result.push(
        <li key={i} className="ml-6 list-decimal my-1">{formatInline(line.replace(/^\d+\.\s/, ""))}</li>
      );
    } else if (line.startsWith("> ")) {
      result.push(
        <blockquote key={i} className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-4">
          {formatInline(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === "---") {
      result.push(<hr key={i} className="my-6 border-border" />);
    } else if (line.trim() === "") {
      result.push(<br key={i} />);
    } else {
      result.push(<p key={i} className="my-2 leading-relaxed">{formatInline(line)}</p>);
    }
  }

  if (inCodeBlock && codeBlockLines.length > 0) {
    result.push(
      <pre key="code-end" className="bg-muted p-4 rounded-lg overflow-x-auto text-sm my-4">
        <code>{codeBlockLines.join("\n")}</code>
      </pre>
    );
  }

  return result;
}

function formatInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<code key={key++} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a key={key++} href={linkMatch[2]} className="text-primary underline underline-offset-2 hover:text-primary/80" target="_blank" rel="noopener noreferrer">
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const nextSpecial = remaining.slice(1).search(/[`*\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else {
      parts.push(remaining.slice(0, nextSpecial + 1));
      remaining = remaining.slice(nextSpecial + 1);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export function ArticleViewer({ article }: ArticleViewerProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasIncrementedRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Fetch related articles
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
      return format(new Date(article.updated_at), "dd 'de' MMMM 'de' yyyy", {
        locale: ptBR,
      });
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
    <div className="space-y-6">
      {/* Breadcrumbs */}
      {categoryName && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Base de Conhecimento</span>
          <ChevronRight className="h-4 w-4" />
          <span>{categoryName}</span>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground truncate max-w-[200px]">{article.title}</span>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex items-start gap-3">
          {article.is_public ? (
            <Globe className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold leading-tight">{article.title}</h1>
            
            {/* Tags */}
            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
          {categoryName && (
            <Badge variant="outline">{categoryName}</Badge>
          )}
          <span className="flex items-center gap-1">
            <Eye className="h-4 w-4" />
            {(article.views || 0) + 1} visualizações
          </span>
          {article.helpful_count > 0 && (
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-4 w-4" />
              {article.helpful_count} acharam útil
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {readingTime} min de leitura
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {formattedDate}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 mt-4">
          <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado!" : "Copiar link"}
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Share2 className="h-4 w-4" />
            Compartilhar
          </Button>
        </div>
      </div>

      <Separator />

      {/* Content with optional TOC */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-8">
        {/* Main content */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {renderContent(article.content)}
        </div>

        {/* Table of Contents (desktop only) */}
        <div className="hidden lg:block">
          <ArticleTableOfContents
            content={article.content}
            onItemClick={handleScrollToHeading}
          />
        </div>
      </div>

      {/* Feedback Widget */}
      <ArticleFeedback articleId={article.id} />

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <div className="border-t pt-6 mt-8">
          <h3 className="text-lg font-semibold mb-4">Artigos Relacionados</h3>
          <div className="grid gap-2">
            {relatedArticles.map((related) => (
              <button
                key={related.id}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted transition-colors text-left"
              >
                <span className="font-medium">{related.title}</span>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Eye className="h-3 w-3" />
                  {related.views}
                  <ChevronRight className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
