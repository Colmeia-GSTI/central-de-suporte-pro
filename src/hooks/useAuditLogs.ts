import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AuditLogFilters {
  tables?: string[];
  actions?: string[];
  userId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
}

export interface AuditLogRecord {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  old_data: unknown;
  new_data: unknown;
  created_at: string;
  total_count: number;
}

export function useAuditLogs(filters: AuditLogFilters) {
  return useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: async () => {
      const offset = (filters.page - 1) * filters.pageSize;
      const { data, error } = await supabase.rpc("list_audit_logs_with_user", {
        p_tables: filters.tables && filters.tables.length ? filters.tables : undefined,
        p_actions: filters.actions && filters.actions.length ? filters.actions : undefined,
        p_user_id: filters.userId || undefined,
        p_search: filters.search?.trim() || undefined,
        p_date_from: filters.dateFrom || undefined,
        // Bug #2: incluir o dia inteiro de "Até" (era exclusivo de 00:00:00 daquele dia).
        p_date_to: filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : undefined,
        p_limit: filters.pageSize,
        p_offset: offset,
      });

      if (error) {
        console.error("[useAuditLogs] RPC error:", error);
        throw error;
      }

      const rows = (data ?? []) as AuditLogRecord[];
      const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
      return { rows, total };
    },
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}
