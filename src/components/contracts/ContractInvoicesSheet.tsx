import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, getYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

interface ContractInvoicesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: {
    id: string;
    name: string;
    client_name?: string | null;
  };
}

type Invoice = Pick<
  Tables<"invoices">,
  | "id"
  | "invoice_number"
  | "reference_month"
  | "due_date"
  | "amount"
  | "status"
  | "paid_at"
>;

const statusConfig: Record<string, { label: string; className: string }> = {
  paid: { label: "Quitado", className: "bg-status-success text-white" },
  overdue: { label: "Atrasado", className: "bg-status-danger text-white" },
  pending: { label: "Pendente", className: "bg-status-warning text-white" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
  renegotiated: { label: "Renegociado", className: "bg-muted text-muted-foreground" },
  lost: { label: "Perdido", className: "bg-muted text-muted-foreground" },
};

export function ContractInvoicesSheet({
  open,
  onOpenChange,
  contract,
}: ContractInvoicesSheetProps) {
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["contract-invoices", contract.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, reference_month, due_date, amount, status, paid_at")
        .eq("contract_id", contract.id)
        .not("status", "in", "(cancelled,renegotiated)")
        .order("due_date", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: open,
    staleTime: 60_000,
  });

  // Agrupar por ano baseado no due_date
  const groupedByYear = useMemo(() => {
    const groups: Record<number, Invoice[]> = {};
    for (const inv of invoices) {
      const year = inv.due_date ? getYear(parseISO(inv.due_date)) : 0;
      if (!groups[year]) groups[year] = [];
      groups[year].push(inv);
    }
    // Ordenar anos desc
    return Object.entries(groups)
      .map(([year, items]) => ({ year: Number(year), items }))
      .sort((a, b) => b.year - a.year);
  }, [invoices]);

  // Totais gerais
  const totals = useMemo(() => {
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOverdue = 0;
    let totalPending = 0;
    for (const inv of invoices) {
      totalInvoiced += inv.amount;
      if (inv.status === "paid") totalPaid += inv.amount;
      if (inv.status === "overdue") totalOverdue += inv.amount;
      if (inv.status === "pending") totalPending += inv.amount;
    }
    return { totalInvoiced, totalPaid, totalOverdue, totalPending };
  }, [invoices]);

  const getYearCounts = (items: Invoice[]) => {
    let paid = 0, overdue = 0, pending = 0;
    for (const inv of items) {
      if (inv.status === "paid") paid++;
      else if (inv.status === "overdue") overdue++;
      else if (inv.status === "pending") pending++;
    }
    return { paid, overdue, pending };
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Histórico de Parcelas
          </SheetTitle>
          <SheetDescription>
            {contract.name}
            {contract.client_name && (
              <span className="text-foreground font-medium"> — {contract.client_name}</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Nenhuma fatura encontrada para este contrato.</p>
            </div>
          ) : (
            <>
              {/* Resumo geral */}
              <div className="grid grid-cols-2 gap-3">
                <SummaryCard
                  label="Total Faturado"
                  value={formatCurrencyBRLWithSymbol(totals.totalInvoiced)}
                  icon={<FileText className="h-4 w-4" />}
                  variant="default"
                />
                <SummaryCard
                  label="Total Pago"
                  value={formatCurrencyBRLWithSymbol(totals.totalPaid)}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  variant="success"
                />
                <SummaryCard
                  label="Total Atrasado"
                  value={formatCurrencyBRLWithSymbol(totals.totalOverdue)}
                  icon={<AlertTriangle className="h-4 w-4" />}
                  variant="danger"
                />
                <SummaryCard
                  label="Total Pendente"
                  value={formatCurrencyBRLWithSymbol(totals.totalPending)}
                  icon={<Clock className="h-4 w-4" />}
                  variant="warning"
                />
              </div>

              {/* Agrupamento por ano */}
              <Accordion
                type="multiple"
                defaultValue={groupedByYear.map((g) => String(g.year))}
                className="space-y-2"
              >
                {groupedByYear.map(({ year, items }) => {
                  const counts = getYearCounts(items);
                  return (
                    <AccordionItem
                      key={year}
                      value={String(year)}
                      className="border rounded-lg px-3"
                    >
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-base font-bold">{year}</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {counts.paid > 0 && (
                              <Badge className="bg-status-success text-white text-[10px] px-1.5 py-0">
                                {counts.paid} {counts.paid === 1 ? "paga" : "pagas"}
                              </Badge>
                            )}
                            {counts.overdue > 0 && (
                              <Badge className="bg-status-danger text-white text-[10px] px-1.5 py-0">
                                {counts.overdue} {counts.overdue === 1 ? "vencida" : "vencidas"}
                              </Badge>
                            )}
                            {counts.pending > 0 && (
                              <Badge className="bg-status-warning text-white text-[10px] px-1.5 py-0">
                                {counts.pending} {counts.pending === 1 ? "pendente" : "pendentes"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">#</TableHead>
                              <TableHead>Competência</TableHead>
                              <TableHead>Vencimento</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Valor</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((inv, idx) => {
                              const cfg = statusConfig[inv.status] || statusConfig.pending;
                              return (
                                <TableRow key={inv.id}>
                                  <TableCell className="font-mono text-muted-foreground text-xs">
                                    {inv.invoice_number || items.length - idx}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {inv.reference_month || "—"}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    {inv.due_date
                                      ? format(parseISO(inv.due_date), "dd/MM/yyyy", { locale: ptBR })
                                      : "—"}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={`${cfg.className} text-[10px]`}>
                                      {cfg.label}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-sm">
                                    {formatCurrencyBRLWithSymbol(inv.amount)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  variant,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  variant: "default" | "success" | "danger" | "warning";
}) {
  const variantClasses: Record<string, string> = {
    default: "border-border",
    success: "border-status-success/30 bg-status-success/5",
    danger: "border-status-danger/30 bg-status-danger/5",
    warning: "border-status-warning/30 bg-status-warning/5",
  };

  return (
    <div className={`rounded-lg border p-3 ${variantClasses[variant]}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm font-semibold font-mono">{value}</p>
    </div>
  );
}
