import { lazy, Suspense, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Users, Tags, Shield, Sliders, Plug, History, Link2, Bell,
  MessageSquare, BarChart3, Building2, Layers, KeyRound, Tag,
  Mail, Menu, LucideIcon,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

// Lazy-loaded tab content
const UsersTab = lazy(() => import("@/components/settings/UsersTab").then(m => ({ default: m.UsersTab })));
const CategoriesTab = lazy(() => import("@/components/settings/CategoriesTab").then(m => ({ default: m.CategoriesTab })));
const TagsTab = lazy(() => import("@/components/settings/TagsTab").then(m => ({ default: m.TagsTab })));
const SLATab = lazy(() => import("@/components/settings/SLATab").then(m => ({ default: m.SLATab })));
const SystemTab = lazy(() => import("@/components/settings/SystemTab").then(m => ({ default: m.SystemTab })));
const IntegrationsTab = lazy(() => import("@/components/settings/IntegrationsTab").then(m => ({ default: m.IntegrationsTab })));
const AuditLogsTab = lazy(() => import("@/components/settings/AuditLogsTab").then(m => ({ default: m.AuditLogsTab })));
const ClientMappingsTab = lazy(() => import("@/components/settings/ClientMappingsTab").then(m => ({ default: m.ClientMappingsTab })));
const NotificationRulesTab = lazy(() => import("@/components/settings/NotificationRulesTab").then(m => ({ default: m.NotificationRulesTab })));
const MessageLogsTab = lazy(() => import("@/components/settings/MessageLogsTab").then(m => ({ default: m.MessageLogsTab })));
const MessageMetricsDashboard = lazy(() => import("@/components/settings/MessageMetricsDashboard").then(m => ({ default: m.MessageMetricsDashboard })));
const DepartmentsTab = lazy(() => import("@/components/settings/DepartmentsTab").then(m => ({ default: m.DepartmentsTab })));
const RolePermissionsTab = lazy(() => import("@/components/settings/RolePermissionsTab").then(m => ({ default: m.RolePermissionsTab })));
const CompanyTab = lazy(() => import("@/components/settings/CompanyTab"));
const EmailTemplatesTab = lazy(() => import("@/components/settings/EmailTemplatesTab").then(m => ({ default: m.EmailTemplatesTab })));

interface SettingsMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  category: string;
  requiresManage?: boolean;
  requiresAdmin?: boolean;
}

const SETTINGS_MENU: SettingsMenuItem[] = [
  // Gestão
  { id: "users", label: "Usuários", icon: Users, category: "Gestão", requiresManage: true },
  { id: "permissions", label: "Permissões", icon: KeyRound, category: "Gestão", requiresManage: true },
  { id: "departments", label: "Departamentos", icon: Layers, category: "Gestão", requiresManage: true },
  // Operações
  { id: "categories", label: "Categorias", icon: Tags, category: "Operações" },
  { id: "tags", label: "Tags", icon: Tag, category: "Operações" },
  { id: "sla", label: "SLA", icon: Shield, category: "Operações" },
  { id: "mappings", label: "Mapeamentos", icon: Link2, category: "Operações" },
  // Empresa
  { id: "company", label: "Dados", icon: Building2, category: "Empresa", requiresManage: true },
  { id: "integrations", label: "Integrações", icon: Plug, category: "Empresa", requiresManage: true },
  { id: "system", label: "Sistema", icon: Sliders, category: "Empresa", requiresManage: true },
  { id: "audit", label: "Auditoria", icon: History, category: "Empresa", requiresAdmin: true },
  // Comunicação
  { id: "notifications", label: "Regras", icon: Bell, category: "Comunicação" },
  { id: "email-templates", label: "Templates", icon: Mail, category: "Comunicação", requiresManage: true },
  { id: "message-logs", label: "Histórico", icon: MessageSquare, category: "Comunicação" },
  { id: "message-metrics", label: "Métricas", icon: BarChart3, category: "Comunicação" },
];

function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="space-y-3 mt-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { can } = usePermissions();
  const { roles } = useAuth();
  const isMobile = useIsMobile();

  const isAdmin = roles.includes("admin");
  const canManage = can("settings", "manage");
  const departmentsEnabled = useFeatureFlag("departments_enabled");

  const defaultTab = canManage ? "users" : "categories";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const filteredMenu = SETTINGS_MENU.filter((item) => {
    if (item.requiresAdmin && !isAdmin) return false;
    if (item.requiresManage && !canManage) return false;
    if (item.id === "departments" && !departmentsEnabled) return false;
    return true;
  });

  const categories = [...new Set(filteredMenu.map((m) => m.category))];

  const handleSelectTab = useCallback((id: string) => {
    setActiveTab(id);
    setMobileMenuOpen(false);
  }, []);

  const renderNavContent = () => (
    <nav className="space-y-4 py-2">
      {categories.map((cat) => (
        <div key={cat}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-1">
            {cat}
          </p>
          <div className="space-y-0.5">
            {filteredMenu
              .filter((m) => m.category === cat)
              .map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSelectTab(item.id)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                      "min-h-[44px] touch-manipulation select-none",
                      "active:scale-[0.98] transition-transform",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </nav>
  );

  const renderContent = () => {
    const contentMap: Record<string, React.ReactNode> = {
      users: <UsersTab />,
      permissions: <RolePermissionsTab />,
      departments: <DepartmentsTab />,
      categories: <CategoriesTab />,
      tags: <TagsTab />,
      sla: <SLATab />,
      mappings: <ClientMappingsTab />,
      company: <CompanyTab />,
      integrations: <IntegrationsTab />,
      system: <SystemTab />,
      audit: <AuditLogsTab />,
      notifications: <NotificationRulesTab />,
      "email-templates": <EmailTemplatesTab />,
      "message-logs": <MessageLogsTab />,
      "message-metrics": <MessageMetricsDashboard />,
    };

    return (
      <Suspense fallback={<SettingsLoadingSkeleton />}>
        {contentMap[activeTab] || <SettingsLoadingSkeleton />}
      </Suspense>
    );
  };

  const activeLabel = filteredMenu.find((m) => m.id === activeTab)?.label || "Configurações";

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Configurações</h1>
            <p className="text-sm text-muted-foreground">
              Gerencie usuários, papéis e configurações do sistema
            </p>
          </div>
        </div>

        <div className="flex gap-6 min-w-0">
          {/* Desktop sidebar nav */}
          <aside className="hidden md:block w-56 shrink-0">
            <div className="sticky top-20">
              <ScrollArea className="h-[calc(100dvh-10rem)]">
                {renderNavContent()}
              </ScrollArea>
            </div>
          </aside>

          {/* Mobile nav trigger + sheet */}
          {isMobile && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="md:hidden h-11 px-4 gap-2 rounded-full bg-background border-border shadow-sm"
                >
                  <Menu className="h-4 w-4" />
                  {activeLabel}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[70dvh] rounded-t-2xl">
                <ScrollArea className="h-full pr-2">
                  {renderNavContent()}
                </ScrollArea>
              </SheetContent>
            </Sheet>
          )}

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {renderContent()}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
