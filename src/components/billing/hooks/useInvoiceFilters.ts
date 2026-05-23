/**
 * Hook que isola o estado de filtros + paginação do BillingInvoicesTab.
 *
 * **Por que existe:** reduz a densidade do componente principal (que tinha 22
 * useState) centralizando os 6 estados de filtros/paginação + handlers + a
 * derivação de fromISO/toISO. Comportamento idêntico ao código original.
 *
 * **Inicialização via URL** (`?status=`, `?pm=`) é preservada — usado por
 * deep-links das abas deprecated (A Receber / Boletos / Erros).
 */
import { useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfMonth, endOfMonth, subDays } from "date-fns";

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

export function useInvoiceFilters() {
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

  return {
    search, setSearch,
    statusFilter, setStatusFilter,
    paymentMethodFilter, setPaymentMethodFilter,
    periodPreset,
    dateRange,
    currentPage, setCurrentPage,
    fromISO, toISO,
    handlePresetChange,
    handleCustomDateChange,
  };
}
