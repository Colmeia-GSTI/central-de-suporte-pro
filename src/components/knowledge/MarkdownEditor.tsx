import { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  Code,
  Link,
  List,
  ListOrdered,
  Quote,
  Minus,
  Eye,
  Edit3,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownPreviewRenderer } from "./MarkdownPreviewRenderer";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

interface ToolbarButton {
  icon: React.ElementType;
  label: string;
  prefix: string;
  suffix?: string;
  block?: boolean;
}

const toolbarButtons: ToolbarButton[] = [
  { icon: Bold, label: "Negrito", prefix: "**", suffix: "**" },
  { icon: Italic, label: "Itálico", prefix: "*", suffix: "*" },
  { icon: Code, label: "Código", prefix: "`", suffix: "`" },
  { icon: Link, label: "Link", prefix: "[", suffix: "](url)" },
];

const headingButtons: ToolbarButton[] = [
  { icon: Heading1, label: "Título 1", prefix: "# ", block: true },
  { icon: Heading2, label: "Título 2", prefix: "## ", block: true },
  { icon: Heading3, label: "Título 3", prefix: "### ", block: true },
];

const blockButtons: ToolbarButton[] = [
  { icon: List, label: "Lista", prefix: "- ", block: true },
  { icon: ListOrdered, label: "Lista numerada", prefix: "1. ", block: true },
  { icon: Quote, label: "Citação", prefix: "> ", block: true },
  { icon: Minus, label: "Separador", prefix: "\n---\n", block: true },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Escreva seu conteúdo em Markdown...",
  rows = 12,
  className,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<string>("write");
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const insertMarkdown = (prefix: string, suffix?: string, block?: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let newText: string;
    let cursorPosition: number;

    if (block) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const beforeLine = value.substring(0, lineStart);
      const afterLine = value.substring(lineStart);
      newText = beforeLine + prefix + afterLine;
      cursorPosition = lineStart + prefix.length;
    } else if (selectedText) {
      newText = value.substring(0, start) + prefix + selectedText + (suffix || "") + value.substring(end);
      cursorPosition = start + prefix.length + selectedText.length + (suffix?.length || 0);
    } else {
      newText = value.substring(0, start) + prefix + "texto" + (suffix || "") + value.substring(end);
      cursorPosition = start + prefix.length;
    }

    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);
  };

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem (JPG, PNG, GIF, WebP).", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "O tamanho máximo é 5MB.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `articles/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("knowledge-images")
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("knowledge-images")
        .getPublicUrl(filePath);

      const imageMarkdown = `![${file.name}](${urlData.publicUrl})`;
      const textarea = textareaRef.current;
      const pos = textarea ? textarea.selectionStart : value.length;
      const before = value.substring(0, pos);
      const after = value.substring(pos);
      const newLine = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
      onChange(before + newLine + imageMarkdown + "\n" + after);

      toast({ title: "Imagem inserida com sucesso" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      toast({ title: "Erro ao enviar imagem", description: msg, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [value, onChange, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleImageUpload(file);
    }
  }, [handleImageUpload]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) handleImageUpload(file);
        return;
      }
    }
  }, [handleImageUpload]);

  const ToolbarBtn = ({ button }: { button: ToolbarButton }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => insertMarkdown(button.prefix, button.suffix, button.block)}
      className="h-8 w-8 p-0"
      title={button.label}
    >
      <button.icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImageUpload(file);
        }}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-2">
          <div className="flex items-center gap-0.5 py-1">
            {toolbarButtons.map((btn) => (
              <ToolbarBtn key={btn.label} button={btn} />
            ))}
            <Separator orientation="vertical" className="mx-1 h-6" />
            {headingButtons.map((btn) => (
              <ToolbarBtn key={btn.label} button={btn} />
            ))}
            <Separator orientation="vertical" className="mx-1 h-6" />
            {blockButtons.map((btn) => (
              <ToolbarBtn key={btn.label} button={btn} />
            ))}
            <Separator orientation="vertical" className="mx-1 h-6" />
            {/* Image upload button */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 p-0"
              title="Inserir imagem"
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          <TabsList className="h-8 bg-transparent">
            <TabsTrigger value="write" className="h-7 text-xs gap-1">
              <Edit3 className="h-3 w-3" />
              Escrever
            </TabsTrigger>
            <TabsTrigger value="preview" className="h-7 text-xs gap-1">
              <Eye className="h-3 w-3" />
              Visualizar
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="write" className="m-0">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onPaste={handlePaste}
            placeholder={placeholder}
            rows={rows}
            className="border-0 rounded-none focus-visible:ring-0 resize-none font-mono text-sm"
          />
          {isUploading && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/30 border-t">
              <Loader2 className="h-3 w-3 animate-spin" />
              Enviando imagem...
            </div>
          )}
        </TabsContent>

        <TabsContent value="preview" className="m-0">
          <div 
            className="prose prose-sm dark:prose-invert max-w-none p-4 min-h-[200px] overflow-auto"
            style={{ minHeight: `${rows * 1.5}rem` }}
          >
            {value ? (
              <MarkdownPreviewRenderer content={value} />
            ) : (
              <p className="text-muted-foreground italic">Nenhum conteúdo para visualizar</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
