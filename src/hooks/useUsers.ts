import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";

export interface UseUsersFilters {
  /** Future SaaS multi-tenancy: scopes the query to a tenant. Currently unused (single-tenant). */
  tenantId?: string;
  role?: Enums<"app_role"> | "all";
  status?: "all" | "confirmed" | "pending" | "orphan";
  search?: string;
}

export interface UserListRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  roles: Enums<"app_role">[];
  client_name: string | null;
  client_id: string | null;
}

const STALE_MS = 5 * 60 * 1000;

export function useUsers(filters: UseUsersFilters = {}) {
  const { tenantId, role = "all", search = "" } = filters;

  return useQuery({
    queryKey: ["users", tenantId ?? "default", role, search],
    staleTime: STALE_MS,
    queryFn: async (): Promise<UserListRow[]> => {
      let q = supabase
        .from("profiles")
        .select("user_id, full_name, email, phone")
        .order("full_name");
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`full_name.ilike.%${s}%,email.ilike.%${s}%`);
      }
      const { data: profiles, error } = await q;
      if (error) throw error;

      const ids = (profiles ?? []).map((p) => p.user_id);
      if (ids.length === 0) return [];

      const [{ data: roles }, { data: contacts }] = await Promise.all([
        supabase.from("user_roles").select("user_id, role").in("user_id", ids),
        supabase
          .from("client_contacts")
          .select("user_id, client_id, clients(name)")
          .in("user_id", ids)
          .eq("is_active", true),
      ]);

      const rolesByUser = new Map<string, Enums<"app_role">[]>();
      for (const r of roles ?? []) {
        const arr = rolesByUser.get(r.user_id) ?? [];
        arr.push(r.role as Enums<"app_role">);
        rolesByUser.set(r.user_id, arr);
      }

      const clientByUser = new Map<string, { id: string; name: string | null }>();
      for (const c of (contacts ?? []) as Array<{
        user_id: string;
        client_id: string;
        clients: { name: string | null } | null;
      }>) {
        clientByUser.set(c.user_id, { id: c.client_id, name: c.clients?.name ?? null });
      }

      const rows: UserListRow[] = (profiles ?? []).map((p) => ({
        user_id: p.user_id,
        full_name: p.full_name,
        email: p.email,
        phone: p.phone,
        roles: rolesByUser.get(p.user_id) ?? [],
        client_id: clientByUser.get(p.user_id)?.id ?? null,
        client_name: clientByUser.get(p.user_id)?.name ?? null,
      }));

      if (role !== "all") {
        return rows.filter((r) => r.roles.includes(role as Enums<"app_role">));
      }
      return rows;
    },
  });
}
