import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { ArticleViewer } from "@/components/knowledge/ArticleViewer";
import { CardSkeleton } from "@/components/ui/loading-skeleton";
import { ArrowLeft, FileQuestion } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type ArticleWithCategory = Tables<"knowledge_articles"> & {
  knowledge_categories: { name: string; icon: string } | null;
  ticket_categories: { name: string } | null;
};

export default function KnowledgeArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const { data: article, isLoading, error } = useQuery({
    queryKey: ["knowledge-article", slug],
    queryFn: async () => {
      if (!slug) throw new Error("Slug não fornecido");

      // Try to find by slug first, then by ID
      let query = supabase
        .from("knowledge_articles")
        .select("*, knowledge_categories(name, icon), ticket_categories(name)")
        .eq("slug", slug)
        .maybeSingle();

      const { data: bySlug, error: slugError } = await query;
      
      if (bySlug) return bySlug as ArticleWithCategory;

      // If not found by slug, try by ID (for backwards compatibility)
      const { data: byId, error: idError } = await supabase
        .from("knowledge_articles")
        .select("*, knowledge_categories(name, icon), ticket_categories(name)")
        .eq("id", slug)
        .maybeSingle();

      if (idError) throw idError;
      if (!byId) throw new Error("Artigo não encontrado");

      return byId as ArticleWithCategory;
    },
    enabled: !!slug,
    retry: false,
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <CardSkeleton className="h-12 w-48" />
          <CardSkeleton className="h-96" />
        </div>
      </AppLayout>
    );
  }

  if (error || !article) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <FileQuestion className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Artigo não encontrado</h1>
          <p className="text-muted-foreground mb-6">
            O artigo que você está procurando não existe ou foi removido.
          </p>
          <Button onClick={() => navigate("/knowledge")} className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar para a Base de Conhecimento
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/knowledge")}
          className="mb-6 gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <ArticleViewer article={article} />
      </div>
    </AppLayout>
  );
}
