import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Edit, Trash2, Monitor, Server, Laptop, Printer, Wifi, HardDrive, Activity, FileText, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Tables } from "@/integrations/supabase/types";

const assetSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  asset_type: z.enum(["computer", "notebook", "server", "printer", "switch", "router", "software", "license", "other"]),
  serial_number: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(["active", "maintenance", "disposed", "loaned"]).default("active"),
});

type AssetFormData = z.infer<typeof assetSchema>;
type Asset = Pick<Tables<"assets">, "id" | "client_id" | "name" | "asset_type" | "brand" | "model" | "serial_number" | "status" | "location" | "notes" | "purchase_date" | "purchase_value">;
type MonitoredDevice = Pick<Tables<"monitored_devices">, "id" | "name" | "hostname" | "ip_address" | "device_type" | "is_online" | "uptime_percent" | "last_seen_at" | "external_source" | "client_id">;

interface DocDevice {
  id: string;
  client_id: string;
  device_type: string | null;
  name: string | null;
  brand_model: string | null;
  serial_number: string | null;
  os: string | null;
  cpu: string | null;
  ram: string | null;
  disks: string | null;
  ip_local: string | null;
  mac_address: string | null;
  firmware: string | null;
  status: string | null;
  last_seen: string | null;
  primary_user: string | null;
  physical_location: string | null;
  connection_type: string | null;
  trmm_agent_id: string | null;
  unifi_device_id: string | null;
  data_source: string | null;
  notes: string | null;
}

// Unified item after merge
interface UnifiedAssetItem {
  key: string;
  name: string;
  deviceType: string;
  brandModel: string;
  ip: string;
  statusOnline: boolean | null; // null = unknown
  statusLabel: string;
  origin: "trmm" | "unifi" | "checkmk" | "manual" | "doc_only";
  documented: boolean;
  docDevice: DocDevice | null;
  monitoredDevice: MonitoredDevice | null;
  asset: Asset | null;
  possibleDuplicate: boolean;
}

const assetTypeLabels: Record<string, string> = {
  computer: "Computador",
  notebook: "Notebook",
  server: "Servidor",
  printer: "Impressora",
  switch: "Switch",
  router: "Roteador",
  software: "Software",
  license: "Licença",
  other: "Outro",
};

const statusLabels: Record<string, string> = {
  active: "Ativo",
  maintenance: "Manutenção",
  disposed: "Descartado",
  loaned: "Emprestado",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  maintenance: "secondary",
  disposed: "destructive",
  loaned: "outline",
};

function getAssetIcon(type: string) {
  switch (type) {
    case "computer":
    case "workstation":
      return Monitor;
    case "notebook":
      return Laptop;
    case "server":
      return Server;
    case "printer":
      return Printer;
    case "switch":
    case "router":
    case "access_point":
      return Wifi;
    default:
      return HardDrive;
  }
}

interface ClientAssetsListProps {
  clientId: string;
}

export function ClientAssetsList({ clientId }: ClientAssetsListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; asset: Asset | null }>({
    open: false,
    asset: null,
  });
  const [selectedItem, setSelectedItem] = useState<UnifiedAssetItem | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: "",
      asset_type: "computer",
      serial_number: "",
      brand: "",
      model: "",
      location: "",
      status: "active",
    },
  });

  // Fetch assets
  const { data: assets = [], isLoading: isLoadingAssets } = useQuery({
    queryKey: ["client-assets", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("id, client_id, name, asset_type, brand, model, serial_number, status, location, notes, purchase_date, purchase_value")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch monitored devices
  const { data: monitoredDevices = [], isLoading: isLoadingDevices } = useQuery({
    queryKey: ["client-monitored-devices", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monitored_devices")
        .select("id, name, hostname, ip_address, device_type, is_online, uptime_percent, last_seen_at, external_source, client_id")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch doc_devices
  const { data: docDevices = [], isLoading: isLoadingDoc } = useQuery({
    queryKey: ["client-doc-devices", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doc_devices")
        .select("id, client_id, device_type, name, brand_model, serial_number, os, cpu, ram, disks, ip_local, mac_address, firmware, status, last_seen, primary_user, physical_location, connection_type, trmm_agent_id, unifi_device_id, data_source, notes")
        .eq("client_id", clientId)
        .order("name");
      if (error) throw error;
      return data as DocDevice[];
    },
  });

  const isLoading = isLoadingAssets || isLoadingDevices || isLoadingDoc;

  // Merge logic
  const unifiedItems = useMemo(() => {
    const items: UnifiedAssetItem[] = [];
    const usedMonitoredIds = new Set<string>();
    const usedDocIds = new Set<string>();
    const docHostnames = new Set(docDevices.map(d => d.name?.toLowerCase()).filter(Boolean));

    // 1. Match doc_devices with monitored_devices via trmm_agent_id / unifi_device_id
    for (const doc of docDevices) {
      let matched: MonitoredDevice | null = null;

      if (doc.trmm_agent_id) {
        matched = monitoredDevices.find(m => m.id && (m as Record<string, unknown>).external_source === "tactical_rmm" && m.hostname?.toLowerCase() === doc.name?.toLowerCase()) || null;
        // Also try matching by name since external_id mapping may differ
        if (!matched) {
          matched = monitoredDevices.find(m => (m as Record<string, unknown>).external_source === "tactical_rmm" && m.name?.toLowerCase() === doc.name?.toLowerCase()) || null;
        }
      }
      if (!matched && doc.unifi_device_id) {
        matched = monitoredDevices.find(m => (m as Record<string, unknown>).external_source === "unifi" && m.name?.toLowerCase() === doc.name?.toLowerCase()) || null;
      }
      // Generic fallback: match by hostname/name
      if (!matched) {
        matched = monitoredDevices.find(m => !usedMonitoredIds.has(m.id) && m.hostname?.toLowerCase() === doc.name?.toLowerCase()) || null;
      }
      if (!matched) {
        matched = monitoredDevices.find(m => !usedMonitoredIds.has(m.id) && m.name?.toLowerCase() === doc.name?.toLowerCase()) || null;
      }

      if (matched) usedMonitoredIds.add(matched.id);
      usedDocIds.add(doc.id);

      const origin = doc.data_source === "unifi" ? "unifi" as const
        : doc.data_source === "tactical_rmm" ? "trmm" as const
        : "doc_only" as const;

      items.push({
        key: `doc-${doc.id}`,
        name: doc.name || "Sem nome",
        deviceType: doc.device_type || "other",
        brandModel: doc.brand_model || "",
        ip: doc.ip_local || matched?.ip_address || "",
        statusOnline: matched ? matched.is_online : null,
        statusLabel: matched ? (matched.is_online ? "Online" : "Offline") : "Desconhecido",
        origin: matched ? (matched.external_source === "unifi" ? "unifi" : matched.external_source === "checkmk" ? "checkmk" : "trmm") : origin,
        documented: true,
        docDevice: doc,
        monitoredDevice: matched,
        asset: null,
        possibleDuplicate: false,
      });
    }

    // 2. Monitored devices NOT matched to doc_devices
    for (const m of monitoredDevices) {
      if (usedMonitoredIds.has(m.id)) continue;

      items.push({
        key: `mon-${m.id}`,
        name: m.name || m.hostname || "Sem nome",
        deviceType: m.device_type || "other",
        brandModel: "",
        ip: m.ip_address || "",
        statusOnline: m.is_online,
        statusLabel: m.is_online ? "Online" : "Offline",
        origin: m.external_source === "unifi" ? "unifi" : m.external_source === "checkmk" ? "checkmk" : "trmm",
        documented: false,
        docDevice: null,
        monitoredDevice: m,
        asset: null,
        possibleDuplicate: false,
      });
    }

    // 3. Manual assets
    for (const a of assets) {
      const isDuplicate = docHostnames.has(a.name?.toLowerCase());
      items.push({
        key: `asset-${a.id}`,
        name: a.name,
        deviceType: a.asset_type,
        brandModel: [a.brand, a.model].filter(Boolean).join(" "),
        ip: "",
        statusOnline: null,
        statusLabel: statusLabels[a.status] || a.status,
        origin: "manual",
        documented: false,
        docDevice: null,
        monitoredDevice: null,
        asset: a,
        possibleDuplicate: isDuplicate,
      });
    }

    return items;
  }, [assets, monitoredDevices, docDevices]);

  const saveMutation = useMutation({
    mutationFn: async (data: AssetFormData) => {
      const payload = {
        client_id: clientId,
        name: data.name,
        asset_type: data.asset_type,
        serial_number: data.serial_number || null,
        brand: data.brand || null,
        model: data.model || null,
        location: data.location || null,
        status: data.status,
      };

      if (editingAsset) {
        const { error } = await supabase
          .from("assets")
          .update(payload)
          .eq("id", editingAsset.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("assets").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-assets", clientId] });
      toast({ title: editingAsset ? "Ativo atualizado" : "Ativo adicionado" });
      handleCloseForm();
    },
    onError: (error: unknown) => {
      toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-assets", clientId] });
      toast({ title: "Ativo excluído" });
      setDeleteConfirm({ open: false, asset: null });
    },
    onError: () => {
      toast({ title: "Erro ao excluir ativo", variant: "destructive" });
    },
  });

  const handleEdit = (asset: Asset) => {
    setEditingAsset(asset);
    form.reset({
      name: asset.name,
      asset_type: asset.asset_type,
      serial_number: asset.serial_number || "",
      brand: asset.brand || "",
      model: asset.model || "",
      location: asset.location || "",
      status: asset.status,
    });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingAsset(null);
    form.reset();
  };

  const onSubmit = (data: AssetFormData) => {
    saveMutation.mutate(data);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Ativos</CardTitle>
          <CardDescription>
            Equipamentos e dispositivos monitorados deste cliente
          </CardDescription>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <PermissionGate module="inventory" action="create">
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingAsset(null); form.reset(); }}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Ativo
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingAsset ? "Editar Ativo" : "Novo Ativo"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome do ativo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="asset_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o tipo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(assetTypeLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione o status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(statusLabels).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="brand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Marca</FormLabel>
                        <FormControl>
                          <Input placeholder="Dell, HP, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modelo</FormLabel>
                        <FormControl>
                          <Input placeholder="Modelo do equipamento" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="serial_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Série</FormLabel>
                        <FormControl>
                          <Input placeholder="S/N" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Localização</FormLabel>
                        <FormControl>
                          <Input placeholder="Sala, andar, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={handleCloseForm}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : unifiedItems.length === 0 ? (
          <div className="text-center py-8">
            <Monitor className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">Nenhum ativo cadastrado</p>
          </div>
        ) : (
          <TooltipProvider>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ativo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Marca / Modelo</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Documentado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unifiedItems.map((item) => {
                  const Icon = getAssetIcon(item.deviceType);
                  const isManual = item.origin === "manual";

                  return (
                    <TableRow
                      key={item.key}
                      className={item.docDevice ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => item.docDevice && setSelectedItem(item)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{item.name}</span>
                          {item.possibleDuplicate && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              </TooltipTrigger>
                              <TooltipContent>Possível duplicata com dispositivo documentado</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {assetTypeLabels[item.deviceType] || item.deviceType || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.brandModel || "-"}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {item.ip || "-"}
                      </TableCell>
                      <TableCell>
                        {item.statusOnline === true ? (
                          <Badge className="bg-status-success text-white">Online</Badge>
                        ) : item.statusOnline === false ? (
                          <Badge className="bg-destructive text-destructive-foreground">Offline</Badge>
                        ) : isManual ? (
                          <Badge variant={statusVariants[item.asset?.status || "active"]}>
                            {item.statusLabel}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Desconhecido</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <OriginBadge origin={item.origin} />
                      </TableCell>
                      <TableCell>
                        {item.documented ? (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <FileText className="h-3 w-3 mr-1" />
                            Sim
                          </Badge>
                        ) : item.origin === "manual" ? (
                          <Badge variant="outline" className="text-xs">
                            Manual
                          </Badge>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                Não
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>Este dispositivo não está na Documentação</TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isManual && item.asset && (
                          <div className="flex items-center justify-end gap-2">
                            <PermissionGate module="inventory" action="edit">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); handleEdit(item.asset!); }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate module="inventory" action="delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm({ open: true, asset: item.asset! });
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>
        )}
      </CardContent>

      {/* Detail sheet for doc_devices */}
      <Sheet open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedItem?.docDevice && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {selectedItem.docDevice.name}
                </SheetTitle>
              </SheetHeader>
              <DocDeviceDetails doc={selectedItem.docDevice} monitored={selectedItem.monitoredDevice} />
            </>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Excluir Ativo"
        description={`Tem certeza que deseja excluir o ativo "${deleteConfirm.asset?.name}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => deleteConfirm.asset && deleteMutation.mutate(deleteConfirm.asset.id)}
        isLoading={deleteMutation.isPending}
      />
    </Card>
  );
}

// --- Sub-components ---

function OriginBadge({ origin }: { origin: UnifiedAssetItem["origin"] }) {
  switch (origin) {
    case "unifi":
      return (
        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
          <Wifi className="h-3 w-3 mr-1" />UniFi
        </Badge>
      );
    case "checkmk":
      return (
        <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <Activity className="h-3 w-3 mr-1" />CheckMK
        </Badge>
      );
    case "trmm":
      return (
        <Badge variant="default" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          <Monitor className="h-3 w-3 mr-1" />Tactical RMM
        </Badge>
      );
    case "manual":
      return <Badge variant="outline" className="text-xs">Manual</Badge>;
    case "doc_only":
      return (
        <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <FileText className="h-3 w-3 mr-1" />Documentação
        </Badge>
      );
  }
}

function DocDeviceDetails({ doc, monitored }: { doc: DocDevice; monitored: MonitoredDevice | null }) {
  const fields = [
    { label: "Tipo", value: doc.device_type },
    { label: "Marca/Modelo", value: doc.brand_model },
    { label: "Nº Série", value: doc.serial_number },
    { label: "Sistema Operacional", value: doc.os },
    { label: "CPU", value: doc.cpu },
    { label: "RAM", value: doc.ram },
    { label: "Discos", value: doc.disks },
    { label: "IP Local", value: doc.ip_local },
    { label: "MAC", value: doc.mac_address },
    { label: "Firmware", value: doc.firmware },
    { label: "Usuário Principal", value: doc.primary_user },
    { label: "Localização Física", value: doc.physical_location },
    { label: "Tipo de Conexão", value: doc.connection_type },
    { label: "Fonte", value: doc.data_source },
    { label: "Notas", value: doc.notes },
  ];

  return (
    <div className="mt-4 space-y-4">
      {monitored && (
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Status em Tempo Real</p>
          <div className="flex items-center gap-2">
            <Badge className={monitored.is_online ? "bg-status-success text-white" : "bg-destructive text-destructive-foreground"}>
              {monitored.is_online ? "Online" : "Offline"}
            </Badge>
            {monitored.last_seen_at && (
              <span className="text-xs text-muted-foreground">
                Visto: {new Date(monitored.last_seen_at).toLocaleString("pt-BR")}
              </span>
            )}
          </div>
          {monitored.uptime_percent != null && (
            <p className="text-xs text-muted-foreground">Uptime: {monitored.uptime_percent}%</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {fields.map(({ label, value }) =>
          value ? (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-right max-w-[60%] break-words">{value}</span>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
