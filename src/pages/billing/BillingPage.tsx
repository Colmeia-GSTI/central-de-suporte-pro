import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Barcode, FileText, Wrench, Calculator, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBillingCounters } from "@/hooks/useBillingCounters";
import { BillingInvoicesTab } from "@/components/billing/BillingInvoicesTab";
import { BillingBoletosTab } from "@/components/billing/BillingBoletosTab";
import { BillingNfseTab } from "@/components/billing/BillingNfseTab";
import { BillingServicesTab } from "@/components/billing/BillingServicesTab";
import { BillingTaxCodesTab } from "@/components/billing/BillingTaxCodesTab";
import { BankReconciliationTab } from "@/components/billing/BankReconciliationTab";
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

const BILLING_TABS = [
  { id: "invoices", label: "Faturas", icon: Receipt },
  { id: "boletos", label: "Boletos", icon: Barcode },
  { id: "nfse", label: "NFS-e", icon: FileText },
  { id: "reconciliation", label: "Conciliação", icon: ArrowRightLeft },
  { id: "services", label: "Serviços", icon: Wrench },
  { id: "tax-codes", label: "Códigos Tributários", icon: Calculator },
] as const;

type TabId = (typeof BILLING_TABS)[number]["id"];

export default function BillingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = (searchParams.get("tab") as TabId) || "invoices";
  const { data: counters } = useBillingCounters();
  const { can } = usePermissions();
  
  // Managers can only view (read-only), admin/financial can manage
  const canManage = can("financial", "edit");
  const canManageServices = can("services", "edit");

  // Validate tab access - redirect to invoices if trying to access restricted tab without permission
  const currentTab = (() => {
    if ((rawTab === "services" || rawTab === "tax-codes") && !canManageServices) {
      return "invoices";
    }
    return rawTab;
  })();

  // Sync URL if tab was corrected
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
        return counters.overdueInvoices > 0 ? (
          <TabBadge count={counters.overdueInvoices} variant="danger" />
        ) : null;
      case "boletos":
        return counters.processingBoletos > 0 ? (
          <TabBadge count={counters.processingBoletos} variant="warning" />
        ) : null;
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
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Faturamento</h1>
          <p className="text-muted-foreground">
            Central de gestão financeira e fiscal
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
            {BILLING_TABS.map((tab) => {
              // Services and tax-codes require edit permission
              if ((tab.id === "services" || tab.id === "tax-codes") && !canManageServices) {
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
            <BillingInvoicesTab />
          </TabsContent>

          <TabsContent value="boletos" className="mt-6">
            <BillingBoletosTab />
          </TabsContent>

          <TabsContent value="nfse" className="mt-6">
            <BillingNfseTab />
          </TabsContent>

          <TabsContent value="reconciliation" className="mt-6">
            <BankReconciliationTab />
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
