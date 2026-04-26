import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";

export interface UseUsersFilters {
  /** Future SaaS multi-tenancy: scopes the query to a tenant. Currently unused (single-tenant). */
  tenantId?: string;
  role?: Enums<"app_role"> | "all";
  status?: "all" | "confirmed" | "pending" | "inactive";
  search?: string;
}

export type UserStatus = "confirmed" | "pending" | "inactive";

export interface UserListRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  roles: Enums<"app_role">[];
  client_name: string | null;
  client_id: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  last_sign_in_at: string | null;
  status: UserStatus;
}

interface RawRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  roles: string[] | null;
  client_id: string | null;
  client_name: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  last_sign_in_at: string | null;
}

const STALE_MS = 5 * 60 * 1000;

function deriveStatus(row: RawRow): UserStatus {
  if (row.banned_until && new Date(row.banned_until).getTime() > Date.now()) return "inactive";
  if (!row.email_confirmed_at) return "pending";
  return "confirmed";
}

export function useUsers(filters: UseUsersFilters = {}) {
  const { tenantId, role = "all", status = "all", search = "" } = filters;

  return useQuery({
    queryKey: ["users", tenantId ?? "default", role, status, search],
    staleTime: STALE_MS,
    queryFn: async (): Promise<UserListRow[]> => {
      const { data, error } = await supabase.rpc("list_users_for_admin" as never);
      if (error) throw error;

      const rows: UserListRow[] = ((data ?? []) as unknown as RawRow[]).map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        email: r.email,
        phone: r.phone,
        roles: (r.roles ?? []) as Enums<"app_role">[],
        client_id: r.client_id,
        client_name: r.client_name,
        email_confirmed_at: r.email_confirmed_at,
        banned_until: r.banned_until,
        last_sign_in_at: r.last_sign_in_at,
        status: deriveStatus(r),
      }));

      let filtered = rows;
      if (role !== "all") {
        filtered = filtered.filter((u) => u.roles.includes(role as Enums<"app_role">));
      }
      if (status !== "all") {
        filtered = filtered.filter((u) => u.status === status);
      }
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        filtered = filtered.filter(
          (u) =>
            (u.full_name ?? "").toLowerCase().includes(s) ||
            (u.email ?? "").toLowerCase().includes(s),
        );
      }
      return filtered;
    },
  });
}
