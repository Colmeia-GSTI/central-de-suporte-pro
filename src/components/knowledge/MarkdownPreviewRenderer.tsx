import React from "react";

interface MarkdownPreviewRendererProps {
  content: string;
}

/**
 * Shared markdown preview renderer used by both MarkdownEditor and ArticleViewer.
 * Supports: headings, lists, code blocks, blockquotes, images, links, bold, italic, inline code.
 */
export function MarkdownPreviewRenderer({ content }: MarkdownPreviewRendererProps) {
  return <>{renderMarkdown(content)}</>;
}

function renderMarkdown(content: string): React.ReactNode[] {
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

    // Image line: ![alt](url)
    const imageLineMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageLineMatch) {
      result.push(
        <figure key={i} className="my-5">
          <img
            src={imageLineMatch[2]}
            alt={imageLineMatch[1] || "Imagem"}
            className="max-w-full h-auto rounded-lg border border-border/40 shadow-sm"
            loading="lazy"
          />
          {imageLineMatch[1] && (
            <figcaption className="text-xs text-muted-foreground mt-2 text-center">
              {imageLineMatch[1]}
            </figcaption>
          )}
        </figure>
      );
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
        <li key={i} className="ml-6 list-disc my-1.5 text-foreground/90 leading-relaxed">{formatInline(line.slice(2))}</li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      result.push(
        <li key={i} className="ml-6 list-decimal my-1.5 text-foreground/90 leading-relaxed">{formatInline(line.replace(/^\d+\.\s/, ""))}</li>
      );
    } else if (line.startsWith("> ")) {
      result.push(
        <blockquote key={i} className="border-l-4 border-primary/40 bg-primary/5 pl-4 py-2 pr-3 rounded-r-lg italic text-muted-foreground my-5">
          {formatInline(line.slice(2))}
        </blockquote>
      );
    } else if (line.trim() === "---") {
      result.push(<hr key={i} className="my-8 border-border/50" />);
    } else if (line.trim() === "") {
      result.push(<br key={i} />);
    } else {
      result.push(<p key={i} className="my-2 leading-relaxed text-foreground/90">{formatInline(line)}</p>);
    }
  }

  if (inCodeBlock && codeBlockLines.length > 0) {
    result.push(
      <pre key="code-end" className="bg-muted/60 border border-border/40 p-4 rounded-xl overflow-x-auto text-sm my-5 font-mono">
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
    // Inline image: ![alt](url)
    const imgMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imgMatch) {
      parts.push(
        <img
          key={key++}
          src={imgMatch[2]}
          alt={imgMatch[1] || "Imagem"}
          className="inline-block max-h-64 rounded border border-border/40"
          loading="lazy"
        />
      );
      remaining = remaining.slice(imgMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={key++} className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-md text-sm font-mono border border-primary/20">
          {codeMatch[1]}
        </code>
      );
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

    const nextSpecial = remaining.slice(1).search(/[`*\[!]/);
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
