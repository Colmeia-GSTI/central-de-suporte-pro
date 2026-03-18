import { Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface KnowledgeHeroProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export function KnowledgeHero({ search, onSearchChange }: KnowledgeHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-background border border-primary/20">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 left-0 w-72 h-72 bg-primary/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
      </div>

      <div className="relative px-6 py-12 md:px-12 md:py-16 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Sparkles className="h-6 w-6 text-primary" />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Central de Ajuda
          </h1>
        </div>
        
        <p className="text-muted-foreground text-lg mb-8 max-w-2xl mx-auto">
          Encontre respostas, tutoriais e documentação técnica para resolver seus problemas
        </p>

        {/* Search Input */}
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar artigos, tutoriais, documentação..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={cn(
              "pl-12 pr-4 h-14 text-lg rounded-xl",
              "bg-background/80 backdrop-blur-sm",
              "border-primary/20 focus:border-primary",
              "shadow-lg shadow-primary/5",
              "placeholder:text-muted-foreground/70"
            )}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground bg-muted rounded">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex items-center justify-center gap-6 mt-8 text-sm text-muted-foreground">
          <span>Artigos disponíveis</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
          <span>Atualizados frequentemente</span>
        </div>
      </div>
    </div>
  );
}
