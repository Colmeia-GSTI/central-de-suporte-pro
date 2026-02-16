import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUnifiedRealtime } from "@/hooks/useUnifiedRealtime";

interface QueueItem {
  id: string;
  invoice_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  attempt_number: number;
  max_attempts: number;
  process_type: string;
  next_retry_at: string | null;
  last_error: string | null;
  error_code: string | null;
  created_at: string;
}

interface UseInvoiceProcessingQueueResult {
  queueItems: QueueItem[];
  isLoading: boolean;
  retryManually: (queueId: string) => Promise<void>;
  cancelQueue: (queueId: string) => Promise<void>;
  getRetryCountdown: (nextRetryAt: string | null) => { days: number; hours: number; minutes: number; seconds: number } | null;
}

/**
 * Hook for managing invoice processing queue
 */
export function useInvoiceProcessingQueue(
  invoiceId?: string
): UseInvoiceProcessingQueueResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState<Record<string, any>>({});

  // Fetch queue items
  const { data: queueItems = [], isLoading } = useQuery({
    queryKey: ["invoiceQueue", invoiceId],
    queryFn: async () => {
      let query = supabase.from("invoice_processing_queue").select("*");

      if (invoiceId) {
        query = query.eq("invoice_id", invoiceId);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) {
        console.error("Error fetching queue items:", error);
        return [];
      }

      return (data || []) as QueueItem[];
    },
  });

  // Setup real-time subscription
  useUnifiedRealtime("invoice_processing_queue", (payload) => {
    if (
      payload.eventType === "INSERT" ||
      payload.eventType === "UPDATE"
    ) {
      queryClient.invalidateQueries({
        queryKey: ["invoiceQueue"],
      });
    }
  });

  // Update countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      const newCountdown: Record<string, any> = {};

      queueItems.forEach((item) => {
        if (item.next_retry_at) {
          const targetTime = new Date(item.next_retry_at).getTime();
          const now = Date.now();
          const diff = Math.max(0, targetTime - now);

          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
          const hours = Math.floor(
            (diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
          );
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);

          newCountdown[item.id] = {
            days,
            hours,
            minutes,
            seconds,
            isExpired: diff === 0,
          };
        }
      });

      setCountdown(newCountdown);
    }, 1000);

    return () => clearInterval(interval);
  }, [queueItems]);

  // Mutation: Retry manually
  const retryMutation = useMutation({
    mutationFn: async (queueId: string) => {
      const { error } = await supabase
        .from("invoice_processing_queue")
        .update({
          status: "pending",
          next_retry_at: new Date().toISOString(),
          attempt_number: 0,
          last_error: null,
        })
        .eq("id", queueId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Fatura enfileirada para reprocessamento",
      });
      queryClient.invalidateQueries({ queryKey: ["invoiceQueue"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Erro ao enfileirar para reprocessamento",
        variant: "destructive",
      });
    },
  });

  // Mutation: Cancel queue
  const cancelMutation = useMutation({
    mutationFn: async (queueId: string) => {
      const { error } = await supabase
        .from("invoice_processing_queue")
        .update({
          status: "failed",
        })
        .eq("id", queueId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Sucesso",
        description: "Item removido da fila",
      });
      queryClient.invalidateQueries({ queryKey: ["invoiceQueue"] });
    },
  });

  const getRetryCountdown = useCallback(
    (nextRetryAt: string | null) => {
      if (!nextRetryAt) return null;

      const targetTime = new Date(nextRetryAt).getTime();
      const now = Date.now();
      const diff = Math.max(0, targetTime - now);

      return {
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      };
    },
    []
  );

  return {
    queueItems: queueItems as QueueItem[],
    isLoading,
    retryManually: (queueId) => retryMutation.mutateAsync(queueId),
    cancelQueue: (queueId) => cancelMutation.mutateAsync(queueId),
    getRetryCountdown,
  };
}
