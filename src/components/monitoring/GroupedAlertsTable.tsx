import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "@/lib/logger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Building2,
  Server,
  Ticket,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Enums } from "@/integrations/supabase/types";

type AlertWithDevice = {
  id: string;
  level: Enums<"alert_level">;
  title: string;
  message: string | null;
  created_at: string;
  monitored_devices: {
    name: string;
    hostname: string | null;
    ip_address: string | null;
    client_id: string | null;
    clients: { name: string } | null;
  } | null;
};

type GroupBy = "none" | "client" | "device";

interface GroupedAlertsTableProps {
  alerts: AlertWithDevice[];
  isLoading: boolean;
  selectedAlerts: string[];
  setSelectedAlerts: (alerts: string[]) => void;
  onAcknowledge: (alertId: string) => void;
  groupBy: GroupBy;
}

const alertLevelColors: Record<Enums<"alert_level">, string> = {
  critical: "bg-priority-critical text-white",
  warning: "bg-priority-high text-white",
  info: "bg-status-progress text-white",
};

const alertLevelLabels: Record<Enums<"alert_level">, string> = {
  critical: "Crítico",
  warning: "Aviso",
  info: "Info",
};

const EXPANDED_GROUPS_KEY = "monitoring_expandedGroups";

interface GroupedAlerts {
  key: string;
  name: string;
  clientId: string | null;
  alerts: AlertWithDevice[];
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

export function GroupedAlertsTable({
  alerts,
  isLoading,
  selectedAlerts,
  setSelectedAlerts,
  onAcknowledge,
  groupBy,
}: GroupedAlertsTableProps) {
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_GROUPS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return new Set(parsed);
        }
      }
    } catch (e) {
      logger.error("Error loading expandedGroups from localStorage", "Monitoring", { error: String(e) });
    }
    return new Set();
  });

  const groupedAlerts = useMemo(() => {
    if (groupBy === "none") return null;

    const groups = new Map<string, GroupedAlerts>();

    alerts.forEach((alert) => {
      let key: string;
      let name: string;
      let clientId: string | null = null;

      if (groupBy === "client") {
        clientId = alert.monitored_devices?.client_id || null;
        key = clientId || "sem-cliente";
        name = alert.monitored_devices?.clients?.name || "Sem Cliente";
      } else {
        key = alert.monitored_devices?.name || alert.monitored_devices?.hostname || "sem-dispositivo";
        name = alert.monitored_devices?.name || alert.monitored_devices?.hostname || "Sem Dispositivo";
        clientId = alert.monitored_devices?.client_id || null;
      }

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          name,
          clientId,
          alerts: [],
          criticalCount: 0,
          warningCount: 0,
          infoCount: 0,
        });
      }

      const group = groups.get(key)!;
      group.alerts.push(alert);

      if (alert.level === "critical") group.criticalCount++;
      else if (alert.level === "warning") group.warningCount++;
      else group.infoCount++;
    });

    return Array.from(groups.values()).sort((a, b) => {
      // Sort by critical count first, then warning, then info
      if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount;
      if (a.warningCount !== b.warningCount) return b.warningCount - a.warningCount;
      return b.infoCount - a.infoCount;
    });
  }, [alerts, groupBy]);

  // Persist expanded groups to localStorage
  useEffect(() => {
    localStorage.setItem(
      EXPANDED_GROUPS_KEY,
      JSON.stringify(Array.from(expandedGroups))
    );
  }, [expandedGroups]);

  // Clean up stale group keys when grouping changes
  useEffect(() => {
    if (groupedAlerts && groupedAlerts.length > 0) {
      const validKeys = new Set(groupedAlerts.map((g) => g.key));
      const filteredExpanded = new Set(
        Array.from(expandedGroups).filter((key) => validKeys.has(key))
      );
      if (filteredExpanded.size !== expandedGroups.size) {
        setExpandedGroups(filteredExpanded);
      }
    }
  }, [groupedAlerts]);

  const toggleGroup = (key: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleGroupSelection = (group: GroupedAlerts, checked: boolean) => {
    const groupAlertIds = group.alerts.map((a) => a.id);
    if (checked) {
      setSelectedAlerts([...new Set([...selectedAlerts, ...groupAlertIds])]);
    } else {
      setSelectedAlerts(selectedAlerts.filter((id) => !groupAlertIds.includes(id)));
    }
  };

  const isGroupFullySelected = (group: GroupedAlerts) => {
    return group.alerts.every((a) => selectedAlerts.includes(a.id));
  };

  const isGroupPartiallySelected = (group: GroupedAlerts) => {
    const selectedInGroup = group.alerts.filter((a) => selectedAlerts.includes(a.id)).length;
    return selectedInGroup > 0 && selectedInGroup < group.alerts.length;
  };

  const renderAlertRow = (alert: AlertWithDevice, showDevice = true) => (
    <TableRow key={alert.id} className="bg-muted/30">
      <TableCell className="pl-12">
        <Checkbox
          checked={selectedAlerts.includes(alert.id)}
          onCheckedChange={(checked) => {
            if (checked) {
              setSelectedAlerts([...selectedAlerts, alert.id]);
            } else {
              setSelectedAlerts(selectedAlerts.filter((id) => id !== alert.id));
            }
          }}
        />
      </TableCell>
      <TableCell>
        <Badge className={alertLevelColors[alert.level]}>
          {alertLevelLabels[alert.level]}
        </Badge>
      </TableCell>
      <TableCell>
        <div>
          <p className="font-medium">{alert.title}</p>
          {alert.message && (
            <p className="text-sm text-muted-foreground line-clamp-1">
              {alert.message}
            </p>
          )}
        </div>
      </TableCell>
      {showDevice && (
        <TableCell>{alert.monitored_devices?.name || "-"}</TableCell>
      )}
      <TableCell className="text-sm text-muted-foreground">
        {formatDistanceToNow(new Date(alert.created_at), {
          addSuffix: true,
          locale: ptBR,
        })}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const deviceName =
                alert.monitored_devices?.name ||
                alert.monitored_devices?.hostname ||
                "Dispositivo";
              const clientName = alert.monitored_devices?.clients?.name || "";
              const levelLabel = alertLevelLabels[alert.level];

              const params = new URLSearchParams({
                action: "new",
                title: `[Alerta ${levelLabel}] ${alert.title}`,
                description: [
                  `**Alerta de Monitoramento**`,
                  ``,
                  `**Nível:** ${levelLabel}`,
                  `**Título:** ${alert.title}`,
                  `**Mensagem:** ${alert.message || "N/A"}`,
                  ``,
                  `**Dispositivo:** ${deviceName}`,
                  `**IP:** ${alert.monitored_devices?.ip_address || "N/A"}`,
                  `**Cliente:** ${clientName}`,
                  `**Data do alerta:** ${new Date(alert.created_at).toLocaleString("pt-BR")}`,
                ].join("\n"),
              });

              if (alert.monitored_devices?.client_id) {
                params.set("client_id", alert.monitored_devices.client_id);
              }

              navigate(`/tickets?${params.toString()}`);
            }}
          >
            <Ticket className="h-4 w-4 mr-1" />
            Ticket
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onAcknowledge(alert.id)}
          >
            Reconhecer
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card">
        <Table>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                Carregando...
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <Table>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                <CheckCircle2 className="mx-auto h-12 w-12 text-status-success/50" />
                <p className="mt-2 text-muted-foreground">
                  Nenhum alerta ativo
                </p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  // Ungrouped view
  if (groupBy === "none" || !groupedAlerts) {
    return (
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={selectedAlerts.length === alerts.length && alerts.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedAlerts(alerts.map((a) => a.id));
                    } else {
                      setSelectedAlerts([]);
                    }
                  }}
                />
              </TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>Alerta</TableHead>
              <TableHead>Dispositivo</TableHead>
              <TableHead>Criado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {alerts.map((alert) => (
              <TableRow key={alert.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedAlerts.includes(alert.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedAlerts([...selectedAlerts, alert.id]);
                      } else {
                        setSelectedAlerts(selectedAlerts.filter((id) => id !== alert.id));
                      }
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Badge className={alertLevelColors[alert.level]}>
                    {alertLevelLabels[alert.level]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{alert.title}</p>
                    {alert.message && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {alert.message}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>{alert.monitored_devices?.name || "-"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(alert.created_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const deviceName =
                          alert.monitored_devices?.name ||
                          alert.monitored_devices?.hostname ||
                          "Dispositivo";
                        const clientName = alert.monitored_devices?.clients?.name || "";
                        const levelLabel = alertLevelLabels[alert.level];

                        const params = new URLSearchParams({
                          action: "new",
                          title: `[Alerta ${levelLabel}] ${alert.title}`,
                          description: [
                            `**Alerta de Monitoramento**`,
                            ``,
                            `**Nível:** ${levelLabel}`,
                            `**Título:** ${alert.title}`,
                            `**Mensagem:** ${alert.message || "N/A"}`,
                            ``,
                            `**Dispositivo:** ${deviceName}`,
                            `**IP:** ${alert.monitored_devices?.ip_address || "N/A"}`,
                            `**Cliente:** ${clientName}`,
                            `**Data do alerta:** ${new Date(alert.created_at).toLocaleString("pt-BR")}`,
                          ].join("\n"),
                        });

                        if (alert.monitored_devices?.client_id) {
                          params.set("client_id", alert.monitored_devices.client_id);
                        }

                        navigate(`/tickets?${params.toString()}`);
                      }}
                    >
                      <Ticket className="h-4 w-4 mr-1" />
                      Ticket
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAcknowledge(alert.id)}
                    >
                      Reconhecer
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Grouped view
  return (
    <div className="space-y-2">
      {groupedAlerts.map((group) => {
        const isExpanded = expandedGroups.has(group.key);
        const isFullySelected = isGroupFullySelected(group);
        const isPartiallySelected = isGroupPartiallySelected(group);

        return (
          <Collapsible
            key={group.key}
            open={isExpanded}
            onOpenChange={() => toggleGroup(group.key)}
          >
            <div className="rounded-lg border bg-card overflow-hidden">
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={isFullySelected}
                    ref={(ref) => {
                      if (ref) {
                        (ref as HTMLButtonElement & { indeterminate: boolean }).indeterminate =
                          isPartiallySelected;
                      }
                    }}
                    onCheckedChange={(checked) => {
                      toggleGroupSelection(group, !!checked);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}

                  {groupBy === "client" ? (
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Server className="h-4 w-4 text-muted-foreground" />
                  )}

                  <span className="font-medium flex-1">{group.name}</span>

                  <div className="flex items-center gap-2">
                    {group.criticalCount > 0 && (
                      <Badge className="bg-priority-critical text-white">
                        {group.criticalCount} crítico{group.criticalCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                    {group.warningCount > 0 && (
                      <Badge className="bg-priority-high text-white">
                        {group.warningCount} aviso{group.warningCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                    {group.infoCount > 0 && (
                      <Badge className="bg-status-progress text-white">
                        {group.infoCount} info
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {group.alerts.length} alerta{group.alerts.length > 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] pl-12"></TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>Alerta</TableHead>
                      {groupBy === "client" && <TableHead>Dispositivo</TableHead>}
                      <TableHead>Criado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.alerts.map((alert) => renderAlertRow(alert, groupBy === "client"))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}
