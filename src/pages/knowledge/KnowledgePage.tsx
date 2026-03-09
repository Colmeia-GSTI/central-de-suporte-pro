import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { ArticleForm } from "@/components/knowledge/ArticleForm";
import { ArticleViewer } from "@/components/knowledge/ArticleViewer";
import { KnowledgeHero } from "@/components/knowledge/KnowledgeHero";
import { KnowledgeCategoryGrid } from "@/components/knowledge/KnowledgeCategoryGrid";
import { KnowledgePinnedCarousel } from "@/components/knowledge/KnowledgePinnedCarousel";
import { KnowledgeArticleList } from "@/components/knowledge/KnowledgeArticleList";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Tables } from "@/integrations/supabase/types";

type ArticleWithCategory = Tables<"knowledge_articles"> & {
  knowledge_categories: { name: string; icon: string } | null;
  ticket_categories: { name: string } | null;
};

type SortOption = "recent" | "popular" | "helpful" | "alphabetical";

export default function KnowledgePage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleWithCategory | null>(null);
  const [viewingArticle, setViewingArticle] = useState<ArticleWithCategory | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; article: ArticleWithCategory | null }>({
    open: false,
    article: null,
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 300);

  // Fetch all articles
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["knowledge-articles", debouncedSearch, selectedCategory],
    queryFn: async () => {
      let query = supabase
        .from("knowledge_articles")
        .select("*, knowledge_categories(name, icon), ticket_categories(name)");

      if (debouncedSearch) {
        query = query.or(`title.ilike.%${debouncedSearch}%,content.ilike.%${debouncedSearch}%`);
      }

      if (selectedCategory) {
        query = query.eq("knowledge_category_id", selectedCategory);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ArticleWithCategory[];
    },
  });

  // Sort articles
  const sortedArticles = useMemo(() => {
    const sorted = [...articles];
    
    switch (sortBy) {
      case "popular":
        sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
        break;
      case "helpful":
        sorted.sort((a, b) => (b.helpful_count || 0) - (a.helpful_count || 0));
        break;
      case "alphabetical":
        sorted.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
        break;
      case "recent":
      default:
        sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
    }
    
    return sorted;
  }, [articles, sortBy]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-categories"] });
      toast({ title: "Artigo excluído com sucesso" });
      setDeleteConfirm({ open: false, article: null });
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir artigo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (article: ArticleWithCategory) => {
    setEditingArticle(article);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingArticle(null);
  };

  const handleDeleteClick = (article: ArticleWithCategory) => {
    setDeleteConfirm({ open: true, article });
  };

  return (
    <AppLayout>
      <div className="space-y-8 pb-8">
        {/* Hero with Search */}
        <KnowledgeHero search={search} onSearchChange={setSearch} />

        {/* Create Article Button */}
        <div className="flex justify-end">
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <PermissionGate module="knowledge" action="create">
              <DialogTrigger asChild>
                <Button onClick={() => setEditingArticle(null)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Novo Artigo
                </Button>
              </DialogTrigger>
            </PermissionGate>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingArticle ? "Editar Artigo" : "Novo Artigo"}
                </DialogTitle>
              </DialogHeader>
              <ArticleForm
                article={editingArticle}
                onSuccess={handleCloseForm}
                onCancel={handleCloseForm}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Pinned Articles Carousel */}
        {!debouncedSearch && !selectedCategory && (
          <KnowledgePinnedCarousel onSelectArticle={setViewingArticle} />
        )}

        {/* Category Grid */}
        <KnowledgeCategoryGrid
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />

        {/* Article List */}
        <KnowledgeArticleList
          articles={sortedArticles}
          isLoading={isLoading}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onSelectArticle={setViewingArticle}
          onEditArticle={handleEdit}
          onDeleteArticle={handleDeleteClick}
          searchHighlight={debouncedSearch}
        />
      </div>

      {/* Article Viewer Sheet (mobile-friendly) */}
      <Sheet open={!!viewingArticle} onOpenChange={() => setViewingArticle(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl lg:max-w-3xl overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>{viewingArticle?.title}</SheetTitle>
          </SheetHeader>
          {viewingArticle && <ArticleViewer article={viewingArticle} />}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Excluir Artigo"
        description={`Tem certeza que deseja excluir o artigo "${deleteConfirm.article?.title}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => deleteConfirm.article && deleteMutation.mutate(deleteConfirm.article.id)}
        isLoading={deleteMutation.isPending}
      />
    </AppLayout>
  );
}
