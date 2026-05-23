/**
 * Hook que isola toda a lógica de filtros + paginação do BillingInvoicesTab.
 *
 * **Por que existe:** o componente principal tinha 22 useState, sendo 6 só de
 * filtros/paginação + a derivação de filtered/paginated invoices. Esse hook
 * centraliza essa fatia para reduzir densidade do componente — comportamento
 * idêntico ao código original.
 *
 * **Inicialização via URL** (`?status=`, `?pm=`) é preservada — usado por
 * deep-links das abas deprecated (A Receber / Boletos / Erros).
 */
import { useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";
import type { InvoiceWithClient } from "@/hooks/useInvoices";

export const ITEMS_PER_PAGE = 15;

export type PeriodPreset = "month" | "30" | "60" | "90" | "custom";

export const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "month", label: "Mês Atual" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
];

export type PaymentMethodFilter = "all" | "boleto" | "pix" | "transferencia";

function getDateRangeForPreset(preset: PeriodPreset): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "30":
      return { from: subDays(now, 30), to: now };
    case "60":
      return { from: subDays(now, 60), to: now };
    case "90":
      return { from: subDays(now, 90), to: now };
    case "custom":
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

export function useInvoiceFilters(invoices: InvoiceWithClient[]) {
  const [searchParams] = useSearchParams();

  const initialStatus = searchParams.get("status") || "all";
  const initialPm = searchParams.get("pm") || "all";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethodFilter>(
    (["boleto", "pix", "transferencia"].includes(initialPm) ? initialPm : "all") as PaymentMethodFilter
  );
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("month");
  const [dateRange, setDateRange] = useState(() => getDateRangeForPreset("month"));
  const [currentPage, setCurrentPage] = useState(1);

  const fromISO = format(dateRange.from, "yyyy-MM-dd");
  const toISO = format(dateRange.to, "yyyy-MM-dd");

  const handlePresetChange = useCallback((preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset !== "custom") {
      setDateRange(getDateRangeForPreset(preset));
    }
    setCurrentPage(1);
  }, []);

  const handleCustomDateChange = useCallback((field: "from" | "to", date: Date | undefined) => {
    if (!date) return;
    setDateRange((prev) => ({ ...prev, [field]: date }));
    setPeriodPreset("custom");
    setCurrentPage(1);
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!search.trim()) return invoices;
    const term = search.toLowerCase().trim();
    return invoices.filter((inv) => {
      const clientName = inv.clients?.name?.toLowerCase() || "";
      const invoiceNum = String(inv.invoice_number);
      return clientName.includes(term) || invoiceNum.includes(term);
    });
  }, [invoices, search]);

  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredInvoices.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredInvoices, currentPage]);

  const totalPages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);

  return {
    // state
    search, setSearch,
    statusFilter, setStatusFilter,
    paymentMethodFilter, setPaymentMethodFilter,
    periodPreset,
    dateRange,
    currentPage, setCurrentPage,
    // derived
    fromISO, toISO,
    filteredInvoices,
    paginatedInvoices,
    totalPages,
    // handlers
    handlePresetChange,
    handleCustomDateChange,
  };
}
