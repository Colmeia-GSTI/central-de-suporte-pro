import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

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

// Simple markdown preview renderer
function renderMarkdownPreview(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const result: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        result.push(
          <pre key={`code-${i}`} className="bg-muted p-4 rounded-lg overflow-x-auto text-sm my-2">
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
      result.push(<h3 key={i} className="text-lg font-semibold mt-4 mb-2">{formatInline(line.slice(4))}</h3>);
    } else if (line.startsWith("## ")) {
      result.push(<h2 key={i} className="text-xl font-semibold mt-4 mb-2">{formatInline(line.slice(3))}</h2>);
    } else if (line.startsWith("# ")) {
      result.push(<h1 key={i} className="text-2xl font-bold mt-4 mb-2">{formatInline(line.slice(2))}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      result.push(<li key={i} className="ml-4 list-disc">{formatInline(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      result.push(<li key={i} className="ml-4 list-decimal">{formatInline(line.replace(/^\d+\.\s/, ""))}</li>);
    } else if (line.startsWith("> ")) {
      result.push(
        <blockquote key={i} className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-2">
          {formatInline(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === "---") {
      result.push(<hr key={i} className="my-4 border-border" />);
    } else if (line.trim() === "") {
      result.push(<br key={i} />);
    } else {
      result.push(<p key={i} className="my-1">{formatInline(line)}</p>);
    }
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
      parts.push(<code key={key++} className="bg-muted px-1.5 py-0.5 rounded text-sm">{codeMatch[1]}</code>);
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
        <a key={key++} href={linkMatch[2]} className="text-primary underline" target="_blank" rel="noopener noreferrer">
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

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Escreva seu conteúdo em Markdown...",
  rows = 12,
  className,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeTab, setActiveTab] = useState<string>("write");

  const insertMarkdown = (prefix: string, suffix?: string, block?: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    let newText: string;
    let cursorPosition: number;

    if (block) {
      // For block elements, insert at the beginning of the line
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const beforeLine = value.substring(0, lineStart);
      const afterLine = value.substring(lineStart);
      newText = beforeLine + prefix + afterLine;
      cursorPosition = lineStart + prefix.length;
    } else if (selectedText) {
      // Wrap selected text
      newText = value.substring(0, start) + prefix + selectedText + (suffix || "") + value.substring(end);
      cursorPosition = start + prefix.length + selectedText.length + (suffix?.length || 0);
    } else {
      // Insert placeholder
      newText = value.substring(0, start) + prefix + "texto" + (suffix || "") + value.substring(end);
      cursorPosition = start + prefix.length;
    }

    onChange(newText);

    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    }, 0);
  };

  const ToolbarButton = ({ button }: { button: ToolbarButton }) => (
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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-2">
          <div className="flex items-center gap-0.5 py-1">
            {toolbarButtons.map((btn) => (
              <ToolbarButton key={btn.label} button={btn} />
            ))}
            <Separator orientation="vertical" className="mx-1 h-6" />
            {headingButtons.map((btn) => (
              <ToolbarButton key={btn.label} button={btn} />
            ))}
            <Separator orientation="vertical" className="mx-1 h-6" />
            {blockButtons.map((btn) => (
              <ToolbarButton key={btn.label} button={btn} />
            ))}
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
            placeholder={placeholder}
            rows={rows}
            className="border-0 rounded-none focus-visible:ring-0 resize-none font-mono text-sm"
          />
        </TabsContent>

        <TabsContent value="preview" className="m-0">
          <div 
            className="prose prose-sm dark:prose-invert max-w-none p-4 min-h-[200px] overflow-auto"
            style={{ minHeight: `${rows * 1.5}rem` }}
          >
            {value ? (
              renderMarkdownPreview(value)
            ) : (
              <p className="text-muted-foreground italic">Nenhum conteúdo para visualizar</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
