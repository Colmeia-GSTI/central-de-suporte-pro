import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, BookOpen, Eye, Edit, Trash2, Globe, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { ArticleForm } from "@/components/knowledge/ArticleForm";
import { ArticleViewer } from "@/components/knowledge/ArticleViewer";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import type { Tables } from "@/integrations/supabase/types";

type ArticleWithCategory = Tables<"knowledge_articles"> & {
  ticket_categories: { name: string } | null;
};

export default function KnowledgePage() {
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<ArticleWithCategory | null>(null);
  const [viewingArticle, setViewingArticle] = useState<ArticleWithCategory | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; article: ArticleWithCategory | null }>({
    open: false,
    article: null,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["knowledge-articles", search],
    queryFn: async () => {
      let query = supabase
        .from("knowledge_articles")
        .select("*, ticket_categories(name)")
        .order("updated_at", { ascending: false });

      if (search) {
        query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as ArticleWithCategory[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
      toast({ title: "Artigo excluído com sucesso" });
      setDeleteConfirm({ open: false, article: null });
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

  const handleDeleteClick = (e: React.MouseEvent, article: ArticleWithCategory) => {
    e.stopPropagation();
    setDeleteConfirm({ open: true, article });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Base de Conhecimento</h1>
            <p className="text-muted-foreground">
              Documentação e artigos de suporte
            </p>
          </div>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <PermissionGate module="knowledge" action="create">
              <DialogTrigger asChild>
                <Button onClick={() => setEditingArticle(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Artigo
                </Button>
              </DialogTrigger>
            </PermissionGate>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar artigos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Articles Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="text-center py-12">
            <BookOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">
              Nenhum artigo encontrado
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <Card
                key={article.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setViewingArticle(article)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg line-clamp-2">
                      {article.title}
                    </CardTitle>
                    {article.is_public ? (
                      <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {article.content.replace(/<[^>]*>/g, "").slice(0, 150)}...
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {article.ticket_categories && (
                        <Badge variant="outline">
                          {article.ticket_categories.name}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {article.views}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <PermissionGate module="knowledge" action="edit">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(article);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                      <PermissionGate module="knowledge" action="delete">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDeleteClick(e, article)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Atualizado {formatDistanceToNow(new Date(article.updated_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Article Viewer Dialog */}
        <Dialog open={!!viewingArticle} onOpenChange={() => setViewingArticle(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            {viewingArticle && <ArticleViewer article={viewingArticle} />}
          </DialogContent>
        </Dialog>
      </div>

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
