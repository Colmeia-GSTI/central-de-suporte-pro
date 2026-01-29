import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Cpu, HardDrive, MemoryStick, Monitor, Clock, Info } from "lucide-react";
import { MetricGauge } from "./MetricGauge";
import { Badge } from "@/components/ui/badge";

interface ServiceData {
  os?: string;
  os_version?: string;
  platform?: string;
  cpu_model?: string;
  cpu_cores?: number;
  ram_total_gb?: number;
  boot_time?: string;
  agent_version?: string;
  metrics?: {
    cpu_avg_percent?: number;
    ram_avg_percent?: number;
    disk_avg_percent?: number;
    last_updated_at?: string;
  };
  services?: {
    ok?: number;
    warn?: number;
    crit?: number;
    unknown?: number;
  };
  last_check_at?: string;
}

interface DeviceDetailsPanelProps {
  serviceData?: ServiceData | null;
  needsReboot?: boolean;
  externalSource?: string;
}

export function DeviceDetailsPanel({ 
  serviceData, 
  needsReboot,
  externalSource 
}: DeviceDetailsPanelProps) {
  if (!serviceData || Object.keys(serviceData).length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Sem dados detalhados disponíveis</p>
        <p className="text-xs">Os dados serão preenchidos na próxima sincronização</p>
      </div>
    );
  }

  const hasMetrics = serviceData.metrics && (
    serviceData.metrics.cpu_avg_percent !== undefined ||
    serviceData.metrics.ram_avg_percent !== undefined ||
    serviceData.metrics.disk_avg_percent !== undefined
  );

  const hasServices = serviceData.services && (
    serviceData.services.ok !== undefined ||
    serviceData.services.warn !== undefined ||
    serviceData.services.crit !== undefined
  );

  const hasHardware = serviceData.cpu_model || serviceData.ram_total_gb;
  const hasOS = serviceData.os;

  return (
    <div className="p-4 space-y-4">
      {/* Operating System */}
      {hasOS && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Monitor className="h-4 w-4" />
            Sistema Operacional
          </div>
          <p className="text-sm">
            {serviceData.os}
            {serviceData.os_version && ` (${serviceData.os_version})`}
            {serviceData.platform && (
              <Badge variant="outline" className="ml-2 text-xs">
                {serviceData.platform}
              </Badge>
            )}
          </p>
        </div>
      )}

      {/* Hardware */}
      {hasHardware && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Cpu className="h-4 w-4" />
            Hardware
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {serviceData.cpu_model && (
              <span>
                <strong>CPU:</strong> {serviceData.cpu_model}
                {serviceData.cpu_cores && ` (${serviceData.cpu_cores} núcleos)`}
              </span>
            )}
            {serviceData.ram_total_gb && (
              <span>
                <strong>RAM:</strong> {serviceData.ram_total_gb} GB
              </span>
            )}
          </div>
        </div>
      )}

      {/* Metrics (from RMM) */}
      {hasMetrics && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              Métricas (Média últimas leituras)
            </div>
            {serviceData.metrics?.last_updated_at && (
              <span className="text-xs text-muted-foreground">
                Atualizado: {formatDistanceToNow(new Date(serviceData.metrics.last_updated_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </span>
            )}
          </div>
          <div className="flex gap-4">
            {serviceData.metrics?.cpu_avg_percent !== undefined && (
              <MetricGauge label="CPU" value={serviceData.metrics.cpu_avg_percent} />
            )}
            {serviceData.metrics?.ram_avg_percent !== undefined && (
              <MetricGauge label="RAM" value={serviceData.metrics.ram_avg_percent} />
            )}
            {serviceData.metrics?.disk_avg_percent !== undefined && (
              <MetricGauge label="Disco" value={serviceData.metrics.disk_avg_percent} />
            )}
          </div>
        </div>
      )}

      {/* Services (from CheckMK) */}
      {hasServices && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MemoryStick className="h-4 w-4" />
            Serviços Monitorados
          </div>
          <div className="flex gap-2">
            {serviceData.services?.ok !== undefined && serviceData.services.ok > 0 && (
              <Badge className="bg-status-success text-white">
                {serviceData.services.ok} OK
              </Badge>
            )}
            {serviceData.services?.warn !== undefined && serviceData.services.warn > 0 && (
              <Badge className="bg-status-warning text-white">
                {serviceData.services.warn} WARN
              </Badge>
            )}
            {serviceData.services?.crit !== undefined && serviceData.services.crit > 0 && (
              <Badge className="bg-status-danger text-white">
                {serviceData.services.crit} CRIT
              </Badge>
            )}
            {serviceData.services?.unknown !== undefined && serviceData.services.unknown > 0 && (
              <Badge variant="secondary">
                {serviceData.services.unknown} UNKNOWN
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Agent Info */}
      {(serviceData.agent_version || serviceData.boot_time || needsReboot !== undefined) && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Clock className="h-4 w-4" />
            Informações do Agente
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {serviceData.agent_version && (
              <span><strong>Versão:</strong> {serviceData.agent_version}</span>
            )}
            {serviceData.boot_time && (
              <span>
                <strong>Último boot:</strong>{" "}
                {new Date(serviceData.boot_time).toLocaleString("pt-BR")}
              </span>
            )}
            {needsReboot && (
              <Badge variant="destructive" className="text-xs">
                Reboot pendente
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
