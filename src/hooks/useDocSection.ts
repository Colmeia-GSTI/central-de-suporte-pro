import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

type DocTable = "doc_infrastructure" | "doc_telephony" | "doc_support_hours";

export function useDocSection<T extends Record<string, unknown>>(
  tableName: DocTable,
  clientId: string
) {
  const queryClient = useQueryClient();
  const queryKey = [tableName, clientId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from(tableName) as any)
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as T | null;
    },
    enabled: !!clientId,
    staleTime: 5 * 60 * 1000,
  });

  const { mutateAsync: save, isPending: isSaving } = useMutation({
    mutationFn: async (values: Partial<T>) => {
      if (data) {
        // Update existing record
        const { error } = await (supabase
          .from(tableName) as any)
          .update(values)
          .eq("client_id", clientId);
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await (supabase
          .from(tableName) as any)
          .insert({ ...values, client_id: clientId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Dados salvos com sucesso");
    },
    onError: (error: Error) => {
      console.error(`[useDocSection] Failed to save ${tableName}:`, error);
      toast.error("Erro ao salvar dados");
    },
  });

  return { data, isLoading, save, isSaving };
}

// Hook for updating the clients table directly (Section 1)
export function useClientUpdate(clientId: string) {
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  const save = async (values: Record<string, unknown>) => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update(values)
        .eq("id", clientId);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      toast.success("Dados salvos com sucesso");
    } catch (error) {
      console.error("[useClientUpdate] Failed:", error);
      toast.error("Erro ao salvar dados");
      throw error;
    } finally {
      setIsSaving(false);
    }
  };

  return { save, isSaving };
}
