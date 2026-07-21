/**
 * Hook centralizado para buscar invoices com filtros parametrizados.
 *
 * **Por que:** antes deste hook, `from("invoices")` aparecia 30+ vezes em 17
 * componentes diferentes, cada um com sua própria queryKey, próprio SELECT,
 * próprio ordering — resultando em race conditions, cache desincronizado e
 * mudanças que precisavam ser feitas em N lugares.
 *
 * **Como usar:**
 *
 * ```tsx
 * // Caso 1: lista geral com filtros (BillingInvoicesTab)
 * const { data, isLoading } = useInvoices({
 *   status: "all",
 *   dateRange: { from: "2026-01-01", to: "2026-12-31" },
 * });
 *
 * // Caso 2: só boletos
 * const { data } = useInvoices({ paymentMethod: "boleto", limit: 100 });
 *
 * // Caso 3: invoices com erro (qualquer subprocesso)
 * const { data } = useInvoices({ withErrors: true });
 *
 * // Caso 4: invoices de um contrato
 * const { data } = useInvoices({ contractId });
 *
 * // Caso 5: invoices de um cliente
 * const { data } = useInvoices({ clientId });
 * ```
 *
 * **queryKey** é construído determinísticamente dos filtros, então:
 * - Mesmas filtros = mesmo cache compartilhado entre componentes
 * - Mutations invalidam corretamente via prefixo `["invoices", ...]`
 *
 * **Fields** controla colunas retornadas:
 * - `"summary"` (default): id, invoice_number, amount, due_date, status, boleto_url, clients(name)
 * - `"full"`: todas as colunas + clients + contract — para detalhe
 * - `"errors"`: campos de erro (boleto/nfse/email) — para BillingErrorsPanel
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Enums } from "@/integrations/supabase/types";

// ─────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────

export type Invoice = Tables<"invoices">;

export interface InvoiceWithClient extends Invoice {
  clients: { name: string } | null;
}

export type InvoiceStatusFilter = Enums<"invoice_status"> | "all" | "with_errors";

export interface UseInvoicesFilters {
  /** Status de invoice. "all" não filtra. "with_errors" usa OR composto */
  status?: InvoiceStatusFilter;
  /** Range de due_date no formato ISO YYYY-MM-DD */
  dateRange?: { from: string; to: string };
  /** Filtra por método de pagamento (boleto, pix, transferencia) */
  paymentMethod?: string;
  /** Apenas invoices com qualquer subprocesso em erro */
  withErrors?: boolean;
  /** ID do contrato (apenas invoices deste contrato) */
  contractId?: string;
  /** ID do cliente (apenas invoices deste cliente) */
  clientId?: string;
  /** Limita o número de resultados (default 500) */
  limit?: number;
  /** Conjunto de campos retornados */
  fields?: "summary" | "full" | "errors";
  /** Override do enabled (default: true) */
  enabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// QUERY HOOKS
// ─────────────────────────────────────────────────────────────────────

const FIELDS_SUMMARY = "id, invoice_number, amount, due_date, status, boleto_url, boleto_barcode, payment_method, billing_provider, clients(name)";
const FIELDS_FULL = "*, clients(name), contract_id, billing_provider";
const FIELDS_ERRORS =
  "id, invoice_number, amount, due_date, status, boleto_status, boleto_error_msg, billing_provider, contract_id, clients(name), nfse_status, nfse_error_msg, email_status, email_error_msg";

/**
 * Hook flexível para listar invoices. Retorna dados, loading, e refetch.
 * Compartilha cache entre componentes que usam os mesmos filtros.
 */
export function useInvoices(filters: UseInvoicesFilters = {}) {
  const {
    status = "all",
    dateRange,
    paymentMethod,
    withErrors,
    contractId,
    clientId,
    limit = 500,
    fields = "summary",
    enabled = true,
  } = filters;

  // queryKey determinístico — mesmos filtros = mesma chave = cache compartilhado
  const queryKey = [
    "invoices",
    { status, dateRange, paymentMethod, withErrors, contractId, clientId, limit, fields },
  ] as const;

  return useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      const selectClause =
        fields === "errors" ? FIELDS_ERRORS : fields === "full" ? FIELDS_FULL : FIELDS_SUMMARY;

      let query = supabase
        .from("invoices")
        .select(selectClause)
        .order("due_date", { ascending: false })
        .limit(limit);

      if (dateRange) {
        query = query.gte("due_date", dateRange.from).lte("due_date", dateRange.to);
      }

      if (paymentMethod) {
        query = query.eq("payment_method", paymentMethod);
      }

      if (contractId) {
        query = query.eq("contract_id", contractId);
      }

      if (clientId) {
        query = query.eq("client_id", clientId);
      }

      // Filtro por status — mutuamente exclusivo com withErrors
      if (withErrors || status === "with_errors") {
        // Inclui:
        //   1. Erro explícito em qualquer subprocesso (boleto/nfse/email)
        //   2. Deveria ter boleto mas não tem (payment_method=boleto + status pending/overdue
        //      + tem provider configurado + boleto_barcode null)
        // Lógica preserva o filtro complexo que existia em BillingErrorsPanel
        query = query.or(
          "boleto_status.eq.erro,nfse_status.eq.erro,email_status.eq.erro,and(payment_method.eq.boleto,boleto_barcode.is.null,status.in.(pending,overdue),billing_provider.not.is.null)"
        );
      } else if (status !== "all") {
        query = query.eq("status", status as Enums<"invoice_status">);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as InvoiceWithClient[];
    },
  });
}
