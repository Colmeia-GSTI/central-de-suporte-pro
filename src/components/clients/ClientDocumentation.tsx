import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2, Server, Wifi, Monitor, Network, Camera, Key,
  Package, Globe, Lock, Users, Shield, Handshake, ClipboardList,
  Construction,
} from "lucide-react";

interface ClientDocumentationProps {
  clientId: string;
}

const sections = [
  { id: "1", title: "Dados gerais do cliente", badge: "campos fixos", icon: Building2, counter: "campos fixos" },
  { id: "2", title: "Infraestrutura", badge: "misto", icon: Server, counter: "—" },
  { id: "3", title: "Internet, conectividade e telefonia", badge: "misto", icon: Wifi, counter: "—" },
  { id: "4", title: "Estações e servidores", badge: "tabela", icon: Monitor, counter: "0 dispositivos" },
  { id: "5", title: "Dispositivos de rede", badge: "tabela", icon: Network, counter: "0 dispositivos" },
  { id: "6", title: "CFTV — Câmeras e NVR", badge: "tabela", icon: Camera, counter: "0 dispositivos" },
  { id: "7", title: "Licenças", badge: "tabela", icon: Key, counter: "0 licenças" },
  { id: "8", title: "Softwares e ERPs", badge: "tabela", icon: Package, counter: "0 softwares" },
  { id: "9", title: "Domínios e DNS", badge: "tabela", icon: Globe, counter: "0 domínios" },
  { id: "10", title: "Credenciais de acesso", badge: "tabela", icon: Lock, counter: "0 credenciais" },
  { id: "11", title: "Contatos e horários de suporte", badge: "misto", icon: Users, counter: "—" },
  { id: "12", title: "Segurança e políticas de rede", badge: "misto", icon: Shield, counter: "—" },
  { id: "13", title: "Prestadores externos", badge: "tabela", icon: Handshake, counter: "0 prestadores" },
  { id: "14", title: "Rotinas e procedimentos", badge: "tabela", icon: ClipboardList, counter: "0 rotinas" },
] as const;

export function ClientDocumentation({ clientId }: ClientDocumentationProps) {
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
                  <span className="ml-auto mr-3 text-xs text-muted-foreground shrink-0">
                    {section.counter}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-10">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <Construction className="h-8 w-8" />
                    <p className="text-sm">[Seção {section.id} em construção]</p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
