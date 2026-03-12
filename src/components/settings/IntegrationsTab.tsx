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
import { Building2, Activity, MessageSquare, Settings2, LayoutDashboard, FileText, Calendar, Mail, Wifi } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { UnifiConfigForm } from "./integrations/UnifiConfigForm";

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
        {/* Horizontally scrollable tabs for mobile */}
        <ScrollArea className="w-full" type="scroll">
          <TabsList className="inline-flex w-max gap-1 p-1">
            <TabsTrigger value="status" className="flex items-center gap-2 min-w-max">
              <LayoutDashboard className="h-4 w-4" />
              Status
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2 min-w-max">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="comunicacao" className="flex items-center gap-2 min-w-max">
              <Calendar className="h-4 w-4" />
              Calendário
            </TabsTrigger>
            <TabsTrigger value="mensagens" className="flex items-center gap-2 min-w-max">
              <MessageSquare className="h-4 w-4" />
              Mensagens
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="flex items-center gap-2 min-w-max">
              <Building2 className="h-4 w-4" />
              Financeiro
            </TabsTrigger>
            <TabsTrigger value="monitoramento" className="flex items-center gap-2 min-w-max">
              <Activity className="h-4 w-4" />
              Monitor
            </TabsTrigger>
            <TabsTrigger value="rede" className="flex items-center gap-2 min-w-max">
              <Wifi className="h-4 w-4" />
              Rede
            </TabsTrigger>
            <TabsTrigger value="automacao" className="flex items-center gap-2 min-w-max">
              <Settings2 className="h-4 w-4" />
              Automação
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2 min-w-max">
              <FileText className="h-4 w-4" />
              Logs
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

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

        <TabsContent value="rede" className="space-y-4 mt-4">
          <UnifiConfigForm />
        </TabsContent>

        <TabsContent value="automacao" className="space-y-4 mt-4">
          <NoContactCheckConfigForm />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4 mt-4">
          <LogsViewerTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
