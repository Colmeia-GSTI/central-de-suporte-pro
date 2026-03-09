import { useMemo } from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

interface ArticleTableOfContentsProps {
  content: string;
  activeId?: string;
  onItemClick?: (id: string) => void;
}

export function ArticleTableOfContents({ 
  content, 
  activeId,
  onItemClick 
}: ArticleTableOfContentsProps) {
  const tocItems = useMemo(() => {
    const items: TOCItem[] = [];
    const lines = content.split("\n");

    lines.forEach((line, index) => {
      // Match markdown headings
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = `heading-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        items.push({ id, text, level });
      }
    });

    return items;
  }, [content]);

  if (tocItems.length < 2) return null;

  return (
    <div className="sticky top-4">
      <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
        <List className="h-4 w-4" />
        <span>Neste artigo</span>
      </div>
      
      <nav className="space-y-1">
        {tocItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onItemClick?.(item.id)}
            className={cn(
              "block w-full text-left text-sm py-1.5 px-3 rounded-md transition-colors",
              "hover:bg-muted hover:text-foreground",
              item.level === 1 && "font-medium",
              item.level === 2 && "pl-5 text-muted-foreground",
              item.level === 3 && "pl-7 text-muted-foreground text-xs",
              activeId === item.id && "bg-primary/10 text-primary border-l-2 border-primary"
            )}
          >
            <span className="line-clamp-1">{item.text}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
