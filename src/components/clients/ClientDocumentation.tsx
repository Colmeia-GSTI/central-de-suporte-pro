import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Edit3, Eye, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { cn, getErrorMessage } from "@/lib/utils";

interface ClientDocumentationProps {
  clientId: string;
  initialContent: string;
}

// HTML escape function to prevent XSS
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Simple Markdown renderer with XSS protection
function MarkdownPreview({ content }: { content: string }) {
  const renderMarkdown = (text: string) => {
    if (!text) return <p className="text-muted-foreground">Nenhuma documentação disponível.</p>;

    const lines = text.split("\n");
    const elements: JSX.Element[] = [];
    let inCodeBlock = false;
    let codeContent = "";
    let codeLanguage = "";

    lines.forEach((line, index) => {
      // Code blocks
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre key={index} className="bg-muted rounded-md p-4 overflow-x-auto my-4">
              <code className="text-sm font-mono">{codeContent}</code>
            </pre>
          );
          codeContent = "";
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
          codeLanguage = line.slice(3);
        }
        return;
      }

      if (inCodeBlock) {
        codeContent += (codeContent ? "\n" : "") + line;
        return;
      }

      // Headers - use React elements instead of dangerouslySetInnerHTML
      if (line.startsWith("### ")) {
        elements.push(
          <h3 key={index} className="text-lg font-semibold mt-6 mb-2">
            {line.slice(4)}
          </h3>
        );
        return;
      }
      if (line.startsWith("## ")) {
        elements.push(
          <h2 key={index} className="text-xl font-bold mt-8 mb-3">
            {line.slice(3)}
          </h2>
        );
        return;
      }
      if (line.startsWith("# ")) {
        elements.push(
          <h1 key={index} className="text-2xl font-bold mt-8 mb-4">
            {line.slice(2)}
          </h1>
        );
        return;
      }

      // Lists
      if (line.startsWith("- ") || line.startsWith("* ")) {
        elements.push(
          <li key={index} className="ml-4 list-disc">
            {line.slice(2)}
          </li>
        );
        return;
      }

      // Numbered lists
      const numberedMatch = line.match(/^\d+\.\s/);
      if (numberedMatch) {
        elements.push(
          <li key={index} className="ml-4 list-decimal">
            {line.slice(numberedMatch[0].length)}
          </li>
        );
        return;
      }

      // Horizontal rule
      if (line.match(/^---+$/)) {
        elements.push(<hr key={index} className="my-6 border-border" />);
        return;
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<br key={index} />);
        return;
      }

      // Parse inline formatting safely using React elements
      const parseInlineFormatting = (text: string): (string | JSX.Element)[] => {
        const result: (string | JSX.Element)[] = [];
        let remaining = text;
        let keyCounter = 0;

        // Process bold, italic, and code in sequence
        while (remaining.length > 0) {
          // Check for bold **text**
          const boldMatch = remaining.match(/^(.*?)\*\*(.+?)\*\*(.*)/);
          if (boldMatch) {
            if (boldMatch[1]) result.push(boldMatch[1]);
            result.push(<strong key={`b-${keyCounter++}`}>{boldMatch[2]}</strong>);
            remaining = boldMatch[3];
            continue;
          }

          // Check for italic *text*
          const italicMatch = remaining.match(/^(.*?)\*(.+?)\*(.*)/);
          if (italicMatch) {
            if (italicMatch[1]) result.push(italicMatch[1]);
            result.push(<em key={`i-${keyCounter++}`}>{italicMatch[2]}</em>);
            remaining = italicMatch[3];
            continue;
          }

          // Check for inline code `text`
          const codeMatch = remaining.match(/^(.*?)`(.+?)`(.*)/);
          if (codeMatch) {
            if (codeMatch[1]) result.push(codeMatch[1]);
            result.push(
              <code key={`c-${keyCounter++}`} className="bg-muted px-1 py-0.5 rounded text-sm">
                {codeMatch[2]}
              </code>
            );
            remaining = codeMatch[3];
            continue;
          }

          // No more matches, add remaining text
          result.push(remaining);
          break;
        }

        return result;
      };

      elements.push(
        <p key={index} className="my-2">
          {parseInlineFormatting(line)}
        </p>
      );
    });

    return <>{elements}</>;
  };

  return <div className="prose prose-sm dark:prose-invert max-w-none">{renderMarkdown(content)}</div>;
}

export function ClientDocumentation({ clientId, initialContent }: ClientDocumentationProps) {
  const [content, setContent] = useState(initialContent);
  const [hasChanges, setHasChanges] = useState(false);
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setContent(initialContent);
    setHasChanges(false);
  }, [initialContent]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("clients")
        .update({ documentation: content })
        .eq("id", clientId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      toast({ title: "Documentação salva" });
      setHasChanges(false);
    },
    onError: (error: unknown) => {
      toast({ title: "Erro ao salvar", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const handleContentChange = (value: string) => {
    setContent(value);
    setHasChanges(value !== initialContent);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Documentação</CardTitle>
          <CardDescription>
            Documentação técnica do cliente em formato Markdown
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="h-9">
              <TabsTrigger value="split" className="text-xs">
                <Edit3 className="h-3.5 w-3.5 mr-1" />
                Split
              </TabsTrigger>
              <TabsTrigger value="edit" className="text-xs">
                <Edit3 className="h-3.5 w-3.5 mr-1" />
                Editar
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs">
                <Eye className="h-3.5 w-3.5 mr-1" />
                Visualizar
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <PermissionGate module="clients" action="edit">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!hasChanges || saveMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </PermissionGate>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "min-h-[500px]",
            viewMode === "split" && "grid grid-cols-2 gap-4"
          )}
        >
          {/* Editor */}
          {(viewMode === "split" || viewMode === "edit") && (
            <div className={cn("space-y-2", viewMode === "edit" && "h-full")}>
              {viewMode === "split" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2 border-b">
                  <Edit3 className="h-4 w-4" />
                  Editor Markdown
                </div>
              )}
              <Textarea
                value={content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="# Título&#10;&#10;Documentação do cliente...&#10;&#10;## Seção&#10;&#10;- Item 1&#10;- Item 2&#10;&#10;```&#10;código aqui&#10;```"
                className={cn(
                  "font-mono text-sm resize-none",
                  viewMode === "split" ? "min-h-[450px]" : "min-h-[500px]"
                )}
              />
            </div>
          )}

          {/* Preview */}
          {(viewMode === "split" || viewMode === "preview") && (
            <div className={cn("space-y-2", viewMode === "preview" && "h-full")}>
              {viewMode === "split" && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground pb-2 border-b">
                  <Eye className="h-4 w-4" />
                  Visualização
                </div>
              )}
              <div
                className={cn(
                  "rounded-md border bg-muted/30 p-4 overflow-y-auto",
                  viewMode === "split" ? "min-h-[450px]" : "min-h-[500px]"
                )}
              >
                <MarkdownPreview content={content} />
              </div>
            </div>
          )}
        </div>

        {!content && viewMode !== "edit" && (
          <div className="text-center py-8">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">
              Nenhuma documentação ainda. Comece a escrever!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
