import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown, MessageSquare, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ArticleFeedbackProps {
  articleId: string;
}

export function ArticleFeedback({ articleId }: ArticleFeedbackProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");

  // Check if user already voted
  const { data: existingFeedback } = useQuery({
    queryKey: ["article-feedback", articleId, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      const { data, error } = await supabase
        .from("article_feedback")
        .select("*")
        .eq("article_id", articleId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const feedbackMutation = useMutation({
    mutationFn: async (isHelpful: boolean) => {
      if (!user?.id) {
        throw new Error("Você precisa estar logado para avaliar.");
      }

      const payload = {
        article_id: articleId,
        user_id: user.id,
        is_helpful: isHelpful,
        comment: comment.trim() || null,
      };

      if (existingFeedback) {
        // Update existing
        const { error } = await supabase
          .from("article_feedback")
          .update({ is_helpful: isHelpful, comment: payload.comment })
          .eq("id", existingFeedback.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("article_feedback")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["article-feedback", articleId] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-articles"] });
      toast({ title: "Obrigado pelo feedback!" });
      setShowComment(false);
      setComment("");
    },
    onError: (error) => {
      toast({
        title: "Erro ao enviar feedback",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const hasVoted = existingFeedback !== null && existingFeedback !== undefined;
  const votedHelpful = existingFeedback?.is_helpful === true;
  const votedNotHelpful = existingFeedback?.is_helpful === false;

  return (
    <div className="border-t pt-6 mt-8">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">Este artigo foi útil?</p>
        
        <div className="flex items-center justify-center gap-3">
          <Button
            variant={votedHelpful ? "default" : "outline"}
            size="lg"
            onClick={() => feedbackMutation.mutate(true)}
            disabled={feedbackMutation.isPending}
            className={cn(
              "gap-2 transition-all",
              votedHelpful && "bg-green-600 hover:bg-green-700"
            )}
          >
            {votedHelpful ? <Check className="h-4 w-4" /> : <ThumbsUp className="h-4 w-4" />}
            Sim, foi útil
          </Button>
          
          <Button
            variant={votedNotHelpful ? "default" : "outline"}
            size="lg"
            onClick={() => {
              if (!votedNotHelpful) {
                setShowComment(true);
              } else {
                feedbackMutation.mutate(false);
              }
            }}
            disabled={feedbackMutation.isPending}
            className={cn(
              "gap-2 transition-all",
              votedNotHelpful && "bg-orange-600 hover:bg-orange-700"
            )}
          >
            {votedNotHelpful ? <Check className="h-4 w-4" /> : <ThumbsDown className="h-4 w-4" />}
            Não ajudou
          </Button>
        </div>

        {/* Comment form for negative feedback */}
        {showComment && !votedNotHelpful && (
          <div className="max-w-md mx-auto space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span>Como podemos melhorar? (opcional)</span>
            </div>
            <Textarea
              placeholder="Conte-nos o que faltou ou como podemos melhorar este artigo..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowComment(false);
                  setComment("");
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => feedbackMutation.mutate(false)}
                disabled={feedbackMutation.isPending}
              >
                Enviar feedback
              </Button>
            </div>
          </div>
        )}

        {hasVoted && (
          <p className="text-sm text-muted-foreground animate-in fade-in">
            ✓ Você já avaliou este artigo
          </p>
        )}
      </div>
    </div>
  );
}
