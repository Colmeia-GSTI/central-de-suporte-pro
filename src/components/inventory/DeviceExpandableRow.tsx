import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRight,
  Laptop,
  Server,
  Printer,
  Wifi,
  Camera,
  Network,
  Globe,
  Shield,
  Battery,
  HardDrive,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DeviceDetailsPanel } from "./DeviceDetailsPanel";

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

interface DeviceExpandableRowProps {
  id: string;
  name: string;
  ipAddress?: string | null;
  hostname?: string | null;
  isOnline: boolean;
  needsReboot?: boolean;
  deviceType?: string | null;
  externalSource?: string | null;
  serviceData?: ServiceData | null;
  showClient?: boolean;
  clientName?: string | null;
}

const deviceTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  computer: Laptop,
  notebook: Laptop,
  server: Server,
  printer: Printer,
  access_point: Wifi,
  camera: Camera,
  switch: Network,
  router: Globe,
  firewall: Shield,
  ups: Battery,
  other: HardDrive,
};

const deviceTypeColors: Record<string, string> = {
  computer: "text-blue-500",
  notebook: "text-blue-500",
  server: "text-purple-500",
  printer: "text-gray-500",
  access_point: "text-green-500",
  camera: "text-orange-500",
  switch: "text-blue-700",
  router: "text-green-600",
  firewall: "text-red-500",
  ups: "text-yellow-500",
  other: "text-muted-foreground",
};

export function DeviceExpandableRow({
  id,
  name,
  ipAddress,
  hostname,
  isOnline,
  needsReboot,
  deviceType,
  externalSource,
  serviceData,
  showClient,
  clientName,
}: DeviceExpandableRowProps) {
  const [isOpen, setIsOpen] = useState(false);

  const type = deviceType || "other";
  const Icon = deviceTypeIcons[type] || HardDrive;
  const iconColor = deviceTypeColors[type] || "text-muted-foreground";

  const hasDetails = serviceData && Object.keys(serviceData).length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} asChild>
      <>
        <TableRow className={cn("group", isOpen && "bg-muted/30")}>
          <TableCell className="w-[40px]">
            <CollapsibleTrigger asChild>
              <button className="p-1 hover:bg-muted rounded transition-colors">
                <ChevronRight
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    isOpen && "rotate-90"
                  )}
                />
              </button>
            </CollapsibleTrigger>
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4", iconColor)} />
              <div>
                <span className="font-medium">{name}</span>
                {hostname && hostname !== name && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({hostname})
                  </span>
                )}
              </div>
            </div>
          </TableCell>
          <TableCell className="font-mono text-sm text-muted-foreground">
            {ipAddress || "-"}
          </TableCell>
          <TableCell>
            {needsReboot !== undefined ? (
              <Badge variant={needsReboot ? "destructive" : "outline"} className="text-xs">
                {needsReboot ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Sim
                  </>
                ) : (
                  "Não"
                )}
              </Badge>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell>
            <Badge
              className={cn(
                "text-white",
                isOnline ? "bg-status-success" : "bg-status-danger"
              )}
            >
              {isOnline ? (
                <>
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Online
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-1" />
                  Offline
                </>
              )}
            </Badge>
          </TableCell>
          {showClient && (
            <TableCell className="text-sm">{clientName || "-"}</TableCell>
          )}
          <TableCell className="text-xs text-muted-foreground">
            {externalSource === "tactical_rmm" && "Tactical RMM"}
            {externalSource === "checkmk" && "CheckMK"}
            {!externalSource && "Manual"}
          </TableCell>
        </TableRow>

        <CollapsibleContent asChild>
          <TableRow className="bg-muted/20 hover:bg-muted/30">
            <TableCell colSpan={showClient ? 7 : 6} className="p-0">
              <DeviceDetailsPanel
                serviceData={serviceData}
                needsReboot={needsReboot}
                externalSource={externalSource || undefined}
              />
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}
