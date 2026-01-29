import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Tags, Shield, Sliders, Plug, History, Link2, Bell, MessageSquare, BarChart3, Building2, Layers, KeyRound, Tag } from "lucide-react";
import { UsersTab } from "@/components/settings/UsersTab";
import { CategoriesTab } from "@/components/settings/CategoriesTab";
import { TagsTab } from "@/components/settings/TagsTab";
import { SLATab } from "@/components/settings/SLATab";
import { SystemTab } from "@/components/settings/SystemTab";
import { IntegrationsTab } from "@/components/settings/IntegrationsTab";
import { AuditLogsTab } from "@/components/settings/AuditLogsTab";
import { ClientMappingsTab } from "@/components/settings/ClientMappingsTab";
import { NotificationRulesTab } from "@/components/settings/NotificationRulesTab";
import { MessageLogsTab } from "@/components/settings/MessageLogsTab";
import { MessageMetricsDashboard } from "@/components/settings/MessageMetricsDashboard";
import { DepartmentsTab } from "@/components/settings/DepartmentsTab";
import { RolePermissionsTab } from "@/components/settings/RolePermissionsTab";
import CompanyTab from "@/components/settings/CompanyTab";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { can } = usePermissions();
  const { roles } = useAuth();
  
  const isAdmin = roles.includes("admin");
  const canManage = can("settings", "manage");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground">
            Gerencie usuários, papéis e configurações do sistema
          </p>
        </div>

        <Tabs defaultValue={canManage ? "users" : "categories"} className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1">
            {canManage && (
              <TabsTrigger value="users" className="gap-2">
                <Users className="h-4 w-4" />
                Usuários
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="permissions" className="gap-2">
                <KeyRound className="h-4 w-4" />
                Permissões
              </TabsTrigger>
            )}
            <TabsTrigger value="categories" className="gap-2">
              <Tags className="h-4 w-4" />
              Categorias
            </TabsTrigger>
            <TabsTrigger value="tags" className="gap-2">
              <Tag className="h-4 w-4" />
              Tags
            </TabsTrigger>
            <TabsTrigger value="sla" className="gap-2">
              <Shield className="h-4 w-4" />
              SLA
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="company" className="gap-2">
                <Building2 className="h-4 w-4" />
                Empresa
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="departments" className="gap-2">
                <Layers className="h-4 w-4" />
                Departamentos
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="integrations" className="gap-2">
                <Plug className="h-4 w-4" />
                Integrações
              </TabsTrigger>
            )}
            <TabsTrigger value="mappings" className="gap-2">
              <Link2 className="h-4 w-4" />
              Mapeamentos
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Regras
            </TabsTrigger>
            <TabsTrigger value="message-logs" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Histórico
            </TabsTrigger>
            <TabsTrigger value="message-metrics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Métricas
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="audit" className="gap-2">
                <History className="h-4 w-4" />
                Auditoria
              </TabsTrigger>
            )}
            {canManage && (
              <TabsTrigger value="system" className="gap-2">
                <Sliders className="h-4 w-4" />
                Sistema
              </TabsTrigger>
            )}
          </TabsList>

          {canManage && (
            <TabsContent value="users">
              <UsersTab />
            </TabsContent>
          )}

          {canManage && (
            <TabsContent value="permissions">
              <RolePermissionsTab />
            </TabsContent>
          )}

          <TabsContent value="categories">
            <CategoriesTab />
          </TabsContent>

          <TabsContent value="tags">
            <TagsTab />
          </TabsContent>

          <TabsContent value="sla">
            <SLATab />
          </TabsContent>

          {canManage && (
            <TabsContent value="company">
              <CompanyTab />
            </TabsContent>
          )}

          {canManage && (
            <TabsContent value="departments">
              <DepartmentsTab />
            </TabsContent>
          )}

          {canManage && (
            <TabsContent value="integrations">
              <IntegrationsTab />
            </TabsContent>
          )}

          <TabsContent value="mappings">
            <ClientMappingsTab />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationRulesTab />
          </TabsContent>

          <TabsContent value="message-logs">
            <MessageLogsTab />
          </TabsContent>

          <TabsContent value="message-metrics">
            <MessageMetricsDashboard />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="audit">
              <AuditLogsTab />
            </TabsContent>
          )}

          {canManage && (
            <TabsContent value="system">
              <SystemTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}
