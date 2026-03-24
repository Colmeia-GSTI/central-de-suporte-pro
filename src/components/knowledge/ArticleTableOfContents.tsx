import { useMemo, useState, useEffect } from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  activeId: externalActiveId,
  onItemClick 
}: ArticleTableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | undefined>(externalActiveId);

  const tocItems = useMemo(() => {
    const items: TOCItem[] = [];
    const lines = content.split("\n");

    lines.forEach((line, index) => {
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

  // Intersection observer for scroll tracking
  useEffect(() => {
    if (tocItems.length < 2) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    tocItems.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [tocItems]);

  // Sync external activeId
  useEffect(() => {
    if (externalActiveId) setActiveId(externalActiveId);
  }, [externalActiveId]);

  if (tocItems.length < 2) return null;

  return (
    <div className="sticky top-20">
      <div className="rounded-xl border border-border/60 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/30">
          <List className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Neste artigo</span>
        </div>
        
        <ScrollArea className="max-h-[calc(100vh-12rem)]">
          <nav className="p-2 space-y-0.5">
            {tocItems.map((item) => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveId(item.id);
                    onItemClick?.(item.id);
                  }}
                  className={cn(
                    "block w-full text-left text-sm py-2 px-3 rounded-lg transition-all duration-200",
                    "hover:bg-primary/8 hover:text-foreground",
                    item.level === 1 && "font-semibold text-foreground",
                    item.level === 2 && "pl-5 text-muted-foreground font-medium",
                    item.level === 3 && "pl-8 text-muted-foreground text-xs",
                    isActive && "bg-primary/15 text-primary font-semibold border-l-2 border-primary -ml-px"
                  )}
                >
                  <span className="line-clamp-2">{item.text}</span>
                </button>
              );
            })}
          </nav>
        </ScrollArea>
      </div>
    </div>
  );
}
