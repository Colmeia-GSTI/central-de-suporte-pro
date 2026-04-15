import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type DocTableName =
  | "doc_internet_links"
  | "doc_devices"
  | "doc_cftv"
  | "doc_software_erp"
  | "doc_domains"
  | "doc_credentials"
  | "doc_contacts"
  | "doc_external_providers"
  | "doc_routines";

interface UseDocTableCrudOptions {
  tableName: DocTableName;
  clientId: string;
  filter?: { column: string; values: string[] };
  enabled?: boolean;
}

export function useDocTableCrud<T extends Record<string, unknown>>({
  tableName,
  clientId,
  filter,
  enabled = true,
}: UseDocTableCrudOptions) {
  const queryClient = useQueryClient();
  const queryKey = [tableName, clientId, filter?.values?.join(",") ?? "all"];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let query = (supabase.from(tableName) as any)
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (filter) {
        query = query.in(filter.column, filter.values);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as T[];
    },
    enabled: !!clientId && enabled,
    staleTime: 5 * 60 * 1000,
  });

  const { mutateAsync: create, isPending: isCreating } = useMutation({
    mutationFn: async (values: Partial<T>) => {
      const { error } = await (supabase.from(tableName) as any).insert({
        ...values,
        client_id: clientId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Registro criado com sucesso");
    },
    onError: (error: Error) => {
      console.error(`[useDocTableCrud] Create ${tableName} failed:`, error);
      toast.error("Erro ao criar registro");
    },
  });

  const { mutateAsync: update, isPending: isUpdating } = useMutation({
    mutationFn: async ({ id, ...values }: Partial<T> & { id: string }) => {
      const { error } = await (supabase.from(tableName) as any)
        .update(values)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Registro atualizado com sucesso");
    },
    onError: (error: Error) => {
      console.error(`[useDocTableCrud] Update ${tableName} failed:`, error);
      toast.error("Erro ao atualizar registro");
    },
  });

  const { mutateAsync: remove, isPending: isRemoving } = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(tableName) as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Registro excluído com sucesso");
    },
    onError: (error: Error) => {
      console.error(`[useDocTableCrud] Delete ${tableName} failed:`, error);
      toast.error("Erro ao excluir registro");
    },
  });

  return {
    items,
    isLoading,
    create,
    update,
    remove,
    isCreating,
    isUpdating,
    isRemoving,
    isMutating: isCreating || isUpdating || isRemoving,
    count: items.length,
  };
}
