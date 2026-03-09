import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

interface KnowledgeCategoryGridProps {
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string | null) => void;
}

interface Category {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  icon: string | null;
  article_count: number;
  order_index: number;
}

export function KnowledgeCategoryGrid({ 
  selectedCategory, 
  onSelectCategory 
}: KnowledgeCategoryGridProps) {
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["knowledge-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_categories")
        .select("id, name, slug, description, icon, article_count, order_index")
        .eq("is_active", true)
        .order("order_index");
      
      if (error) throw error;
      return data as Category[];
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (categories.length === 0) return null;

  // Dynamic icon lookup
  const getIcon = (iconName: string | null) => {
    if (!iconName) return LucideIcons.FolderOpen;
    const Icon = (LucideIcons as Record<string, React.ComponentType<{ className?: string }>>)[iconName];
    return Icon || LucideIcons.FolderOpen;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Categorias</h2>
        {selectedCategory && (
          <button
            onClick={() => onSelectCategory(null)}
            className="text-sm text-primary hover:underline"
          >
            Limpar filtro
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {categories.map((category) => {
          const Icon = getIcon(category.icon);
          const isSelected = selectedCategory === category.id;

          return (
            <Card
              key={category.id}
              interactive
              onClick={() => onSelectCategory(isSelected ? null : category.id)}
              className={cn(
                "cursor-pointer transition-all duration-200",
                isSelected && "ring-2 ring-primary border-primary bg-primary/5"
              )}
            >
              <CardContent className="p-4 text-center">
                <div className={cn(
                  "w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center transition-colors",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="font-medium text-sm line-clamp-1">{category.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {category.article_count} {category.article_count === 1 ? "artigo" : "artigos"}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
