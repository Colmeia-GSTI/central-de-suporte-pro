import { useEffect, useRef } from "react";
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

/**
 * Simple Markdown-like rendering for article content.
 * Handles: bold, italic, headings, code blocks, links, lists, and line breaks.
 */
function renderContent(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const result: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        result.push(
          <pre key={`code-${i}`} className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
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

    // Handle headings
    if (line.startsWith("### ")) {
      result.push(<h3 key={i} className="text-lg font-semibold mt-4 mb-2">{formatInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      result.push(<h2 key={i} className="text-xl font-semibold mt-4 mb-2">{formatInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      result.push(<h1 key={i} className="text-2xl font-bold mt-4 mb-2">{formatInline(line.slice(2))}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      result.push(
        <li key={i} className="ml-4 list-disc">{formatInline(line.slice(2))}</li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      result.push(
        <li key={i} className="ml-4 list-decimal">{formatInline(line.replace(/^\d+\.\s/, ""))}</li>
      );
    } else if (line.trim() === "") {
      result.push(<br key={i} />);
    } else {
      result.push(<p key={i}>{formatInline(line)}</p>);
    }
  }

  // Close any unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    result.push(
      <pre key="code-end" className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        <code>{codeBlockLines.join("\n")}</code>
      </pre>
    );
  }

  return result;
}

function formatInline(text: string): React.ReactNode {
  // Process bold (**text**), italic (*text*), inline code (`code`), and links
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(<code key={key++} className="bg-muted px-1.5 py-0.5 rounded text-sm">{codeMatch[1]}</code>);
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(<em key={key++}>{italicMatch[1]}</em>);
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a key={key++} href={linkMatch[2]} className="text-primary underline" target="_blank" rel="noopener noreferrer">
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Regular text - take one character at a time until next special char
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
  const hasIncrementedRef = useRef<string | null>(null);

  const incrementViewsMutation = useMutation({
    mutationFn: async () => {
      // Use RPC for atomic increment if available, fallback to direct update
      try {
        const { error } = await supabase.rpc("increment_article_views", {
          article_id: article.id,
        });
        if (error) throw error;
      } catch {
        // Fallback: direct update (non-atomic but functional)
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
    // Prevent double-incrementing on re-renders for the same article
    if (hasIncrementedRef.current !== article.id) {
      hasIncrementedRef.current = article.id;
      incrementViewsMutation.mutate();
    }
  }, [article.id]);

  const formattedDate = (() => {
    try {
      return format(new Date(article.updated_at), "dd 'de' MMMM 'de' yyyy", {
        locale: ptBR,
      });
    } catch {
      return "Data indisponível";
    }
  })();

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
            {(article.views || 0) + 1} visualizações
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {formattedDate}
          </span>
        </div>
      </div>

      <Separator />

      {/* Content - with Markdown rendering */}
      <div className="prose prose-sm dark:prose-invert max-w-none">
        {renderContent(article.content)}
      </div>
    </div>
  );
}
