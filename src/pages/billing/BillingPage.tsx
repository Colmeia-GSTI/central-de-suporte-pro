import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, FileText, Wrench, Calculator, ArrowRightLeft, Scale, Activity, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBillingCounters } from "@/hooks/useBillingCounters";
import { BillingInvoicesTab } from "@/components/billing/BillingInvoicesTab";
import { BillingNfseTab } from "@/components/billing/BillingNfseTab";
import { BillingServicesTab } from "@/components/billing/BillingServicesTab";
import { BillingTaxCodesTab } from "@/components/billing/BillingTaxCodesTab";
import { BankReconciliationTab } from "@/components/billing/BankReconciliationTab";
import { FiscalReportTab } from "@/components/billing/FiscalReportTab";
import { IntegrationHealthDashboard } from "@/components/billing/IntegrationHealthDashboard";
import { BillingBankAccountsTab } from "@/components/billing/BillingBankAccountsTab";
import { usePermissions } from "@/hooks/usePermissions";

interface TabBadgeProps {
  count: number;
  variant: "danger" | "warning" | "info";
}

function TabBadge({ count, variant }: TabBadgeProps) {
  if (count === 0) return null;

  const colors = {
    danger: "bg-destructive text-destructive-foreground",
    warning: "bg-status-warning text-white",
    info: "bg-blue-500 text-white",
  };

  return (
    <span
      className={cn(
        "ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium min-w-[20px]",
        colors[variant]
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Tabs Boletos / A Receber / Erros foram removidas na Fase 3.C.3 — funcionalidades
// consolidadas em "Faturas" via filtros. URLs antigas (?tab=boletos|receivable|errors)
// continuam funcionando via redirect em useEffect abaixo.
const BILLING_TABS = [
  { id: "invoices", label: "Faturas", icon: Receipt },
  { id: "nfse", label: "NFS-e", icon: FileText },
  { id: "reconciliation", label: "Conciliação", icon: ArrowRightLeft },
  { id: "fiscal", label: "Fiscal", icon: Scale },
  { id: "health", label: "Saúde", icon: Activity },
  { id: "accounts", label: "Contas", icon: Landmark },
  { id: "services", label: "Serviços", icon: Wrench },
  { id: "tax-codes", label: "Códigos Tributários", icon: Calculator },
] as const;

type TabId = (typeof BILLING_TABS)[number]["id"];

export default function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = (searchParams.get("tab") as TabId) || "invoices";
  const { data: counters } = useBillingCounters();
  const { can } = usePermissions();

  // Auto-open invoice creation when navigating with ?action=new
  const [shouldOpenNewInvoice, setShouldOpenNewInvoice] = useState(false);
  const handleAutoOpenConsumed = useCallback(() => setShouldOpenNewInvoice(false), []);
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setShouldOpenNewInvoice(true);
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  const canManage = can("financial", "edit");
  const canManageServices = can("services", "edit");

  // Redirect de tabs deprecated → invoices com filtros aplicados.
  // Implementado na Fase 3.C.2 como compat layer. Tabs antigas continuam
  // existindo (3.C.3 vai removê-las efetivamente), mas qualquer link salvo
  // ou clique vai para a tab unificada com os filtros corretos.
  // Mapping:
  //   ?tab=boletos     → ?tab=invoices&pm=boleto
  //   ?tab=receivable  → ?tab=invoices&status=pending
  //   ?tab=errors      → ?tab=invoices&status=with_errors
  useEffect(() => {
    const DEPRECATED_TAB_REDIRECTS: Record<string, { status?: string; pm?: string }> = {
      boletos: { pm: "boleto" },
      receivable: { status: "pending" },
      errors: { status: "with_errors" },
    };
    const redirect = DEPRECATED_TAB_REDIRECTS[rawTab];
    if (redirect) {
      searchParams.delete("tab"); // tab default = invoices
      if (redirect.status) searchParams.set("status", redirect.status);
      if (redirect.pm) searchParams.set("pm", redirect.pm);
      setSearchParams(searchParams, { replace: true });
    }
  }, [rawTab, searchParams, setSearchParams]);

  const currentTab = (() => {
    if ((rawTab === "services" || rawTab === "tax-codes") && !canManageServices) {
      return "invoices";
    }
    if (rawTab === "accounts" && !canManage) {
      return "invoices";
    }
    return rawTab;
  })();

  useEffect(() => {
    if (rawTab !== currentTab) {
      if (currentTab === "invoices") {
        searchParams.delete("tab");
      } else {
        searchParams.set("tab", currentTab);
      }
      setSearchParams(searchParams, { replace: true });
    }
  }, [rawTab, currentTab, searchParams, setSearchParams]);

  const handleTabChange = (value: string) => {
    if (value === "invoices") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const getTabBadge = (tabId: TabId) => {
    if (!counters) return null;

    switch (tabId) {
      case "invoices":
        // Soma vencidas + com erros — coisas que precisam atenção do operador.
        // Antes da Fase 3.C, errors era tab separada com badge próprio.
        // Agora é filtro within Faturas, então o badge consolidado mostra ambos.
        {
          const total = counters.overdueInvoices + counters.errorCount;
          return total > 0 ? <TabBadge count={total} variant="danger" /> : null;
        }
      case "nfse":
        return counters.pendingNfse > 0 ? (
          <TabBadge count={counters.pendingNfse} variant="info" />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-3 md:space-y-6">
        <div>
          <h1 className="text-xl md:text-3xl font-bold tracking-tight">Faturamento</h1>
          <p className="text-muted-foreground hidden md:block">
            Central de gestão financeira e fiscal
          </p>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-3 md:space-y-6">
          <TabsList className="flex w-full overflow-x-auto no-scrollbar md:inline-grid md:grid-cols-8 md:w-auto">
            {BILLING_TABS.map((tab) => {
              if ((tab.id === "services" || tab.id === "tax-codes") && !canManageServices) {
                return null;
              }
              if (tab.id === "accounts" && !canManage) {
                return null;
              }
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-2"
                >
                  <tab.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  {getTabBadge(tab.id)}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="invoices" className="mt-6">
            <BillingInvoicesTab 
              autoOpenNew={shouldOpenNewInvoice} 
              onAutoOpenConsumed={handleAutoOpenConsumed} 
            />
          </TabsContent>

          <TabsContent value="nfse" className="mt-6">
            <BillingNfseTab />
          </TabsContent>

          <TabsContent value="reconciliation" className="mt-6">
            <BankReconciliationTab />
          </TabsContent>

          <TabsContent value="fiscal" className="mt-6">
            <FiscalReportTab />
          </TabsContent>

          <TabsContent value="health" className="mt-6">
            <IntegrationHealthDashboard />
          </TabsContent>

          <TabsContent value="accounts" className="mt-6">
            <BillingBankAccountsTab />
          </TabsContent>

          <TabsContent value="services" className="mt-6">
            <BillingServicesTab />
          </TabsContent>

          <TabsContent value="tax-codes" className="mt-6">
            <BillingTaxCodesTab />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
