import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2, Server, Wifi, Monitor, Network, Camera, Key,
  Package, Globe, Lock, Users, Shield, Handshake, ClipboardList,
  Construction, Key as KeyIcon,
} from "lucide-react";
import { DocSectionClientInfo } from "./documentation/DocSectionClientInfo";
import { DocSectionInfrastructure } from "./documentation/DocSectionInfrastructure";
import { DocSectionTelephony } from "./documentation/DocSectionTelephony";
import { DocSectionSupportHours } from "./documentation/DocSectionSupportHours";
import { DocTableWorkstations } from "./documentation/DocTableWorkstations";
import { DocTableNetworkDevices } from "./documentation/DocTableNetworkDevices";
import { DocTableCftv } from "./documentation/DocTableCftv";
import { DocTableSoftwareErp } from "./documentation/DocTableSoftwareErp";
import { DocTableDomains } from "./documentation/DocTableDomains";
import { DocTableCredentials } from "./documentation/DocTableCredentials";
import { DocTableExternalProviders } from "./documentation/DocTableExternalProviders";
import { DocTableRoutines } from "./documentation/DocTableRoutines";
import { DocTableLicenses } from "./documentation/DocTableLicenses";
import { DocSectionSecurity } from "./documentation/DocSectionSecurity";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;

interface ClientDocumentationProps {
  clientId: string;
  client?: Client;
}

const sections = [
  { id: "1", title: "Dados gerais do cliente", badge: "campos fixos", icon: Building2 },
  { id: "2", title: "Infraestrutura", badge: "misto", icon: Server },
  { id: "3", title: "Internet, conectividade e telefonia", badge: "misto", icon: Wifi },
  { id: "4", title: "Estações e servidores", badge: "tabela", icon: Monitor },
  { id: "5", title: "Dispositivos de rede", badge: "tabela", icon: Network },
  { id: "6", title: "CFTV — Câmeras e NVR", badge: "tabela", icon: Camera },
  { id: "7", title: "Licenças", badge: "tabela", icon: KeyIcon },
  { id: "8", title: "Softwares e ERPs", badge: "tabela", icon: Package },
  { id: "9", title: "Domínios e DNS", badge: "tabela", icon: Globe },
  { id: "10", title: "Credenciais de acesso", badge: "tabela", icon: Lock },
  { id: "11", title: "Contatos e horários de suporte", badge: "misto", icon: Users },
  { id: "12", title: "Segurança e políticas de rede", badge: "misto", icon: Shield },
  { id: "13", title: "Prestadores externos", badge: "tabela", icon: Handshake },
  { id: "14", title: "Rotinas e procedimentos", badge: "tabela", icon: ClipboardList },
] as const;

function renderSectionContent(sectionId: string, clientId: string, client?: Client) {
  switch (sectionId) {
    case "1": return client ? <DocSectionClientInfo client={client} clientId={clientId} /> : null;
    case "2": return <DocSectionInfrastructure clientId={clientId} />;
    case "3": return <DocSectionTelephony clientId={clientId} />;
    case "4": return <DocTableWorkstations clientId={clientId} />;
    case "5": return <DocTableNetworkDevices clientId={clientId} />;
    case "6": return <DocTableCftv clientId={clientId} />;
    case "7": return <DocTableLicenses clientId={clientId} />;
    case "8": return <DocTableSoftwareErp clientId={clientId} />;
    case "9": return <DocTableDomains clientId={clientId} />;
    case "10": return <DocTableCredentials clientId={clientId} />;
    case "11": return <DocSectionSupportHours clientId={clientId} />;
    case "12": return <DocSectionSecurity clientId={clientId} />;
    case "13": return <DocTableExternalProviders clientId={clientId} />;
    case "14": return <DocTableRoutines clientId={clientId} />;
    default:
      return (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Construction className="h-8 w-8" />
          <p className="text-sm">[Seção {sectionId} em construção]</p>
        </div>
      );
  }
}

export function ClientDocumentation({ clientId, client }: ClientDocumentationProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentação Técnica</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Accordion type="single" defaultValue="section-1" collapsible className="w-full">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <AccordionItem key={section.id} value={`section-${section.id}`} className="border-b-0">
                <AccordionTrigger className="hover:no-underline hover:bg-muted/30 px-4 py-3 rounded-none data-[state=open]:bg-muted/40">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-primary/70 font-mono text-xs shrink-0 w-5 text-right">
                      {section.id.padStart(2, "0")}
                    </span>
                    <span className="font-medium text-sm truncate">{section.title}</span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider shrink-0 font-normal">
                      {section.badge}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-6">
                  {renderSectionContent(section.id, clientId, client)}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
