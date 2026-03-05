import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GoogleCalendarConfigForm } from "./integrations/GoogleCalendarConfigForm";
import { BancoInterConfigForm } from "./integrations/BancoInterConfigForm";
import { AsaasConfigForm } from "./integrations/AsaasConfigForm";
import { CheckMkConfigForm } from "./integrations/CheckMkConfigForm";
import { TacticalRmmConfigForm } from "./integrations/TacticalRmmConfigForm";
import { EvolutionApiConfigForm } from "./integrations/EvolutionApiConfigForm";
import { TelegramConfigForm } from "./integrations/TelegramConfigForm";
import { NoContactCheckConfigForm } from "./integrations/NoContactCheckConfigForm";
import { ResendConfigForm } from "./integrations/ResendConfigForm";
import { IntegrationStatusPanel } from "./integrations/IntegrationStatusPanel";
import { LogsViewerTab } from "./LogsViewerTab";
import { Building2, Activity, MessageSquare, Settings2, LayoutDashboard, FileText, Calendar, Mail } from "lucide-react";

export function IntegrationsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Integrações</h3>
        <p className="text-sm text-muted-foreground">
          Configure as integrações externas do sistema
        </p>
      </div>

      <Tabs defaultValue="status" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="status" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Status
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email
          </TabsTrigger>
          <TabsTrigger value="comunicacao" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Calendário
          </TabsTrigger>
          <TabsTrigger value="mensagens" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Mensagens
          </TabsTrigger>
          <TabsTrigger value="financeiro" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Financeiro
          </TabsTrigger>
          <TabsTrigger value="monitoramento" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Monitoramento
          </TabsTrigger>
          <TabsTrigger value="automacao" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Automação
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-4 mt-4">
          <IntegrationStatusPanel />
        </TabsContent>

        <TabsContent value="email" className="space-y-4 mt-4">
          <ResendConfigForm />
        </TabsContent>

        <TabsContent value="comunicacao" className="space-y-4 mt-4">
          <GoogleCalendarConfigForm />
        </TabsContent>

        <TabsContent value="mensagens" className="space-y-4 mt-4">
          <EvolutionApiConfigForm />
          <TelegramConfigForm />
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-4 mt-4">
          <BancoInterConfigForm />
          <AsaasConfigForm />
        </TabsContent>

        <TabsContent value="monitoramento" className="space-y-4 mt-4">
          <CheckMkConfigForm />
          <TacticalRmmConfigForm />
        </TabsContent>

        <TabsContent value="automacao" className="space-y-4 mt-4">
          <NoContactCheckConfigForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
