import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ClientBranch = Pick<
  Tables<"client_branches">,
  | "id"
  | "client_id"
  | "name"
  | "is_main"
  | "address"
  | "city"
  | "state"
  | "cep"
  | "phone"
  | "email"
  | "notes"
  | "created_at"
  | "updated_at"
>;

export type ClientBranchPayload = {
  name: string;
  is_main: boolean;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

const SELECT_COLS =
  "id, client_id, name, is_main, address, city, state, cep, phone, email, notes, created_at, updated_at";

export function useClientBranches(clientId: string) {
  const queryClient = useQueryClient();
  const queryKey = ["client-branches", clientId];

  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_branches")
        .select(SELECT_COLS)
        .eq("client_id", clientId)
        .order("is_main", { ascending: false })
        .order("name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as ClientBranch[];
    },
    enabled: !!clientId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: async (payload: ClientBranchPayload) => {
      const { error } = await supabase
        .from("client_branches")
        .insert({ ...payload, client_id: clientId });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: ClientBranchPayload & { id: string }) => {
      const { error } = await supabase
        .from("client_branches")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_branches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return {
    items,
    isLoading,
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: removeMutation.mutateAsync,
    isMutating:
      createMutation.isPending || updateMutation.isPending || removeMutation.isPending,
  };
}
