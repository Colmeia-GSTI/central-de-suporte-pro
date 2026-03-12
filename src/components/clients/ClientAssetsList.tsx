import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Plus, Edit, Trash2, Monitor, Server, Laptop, Printer, Wifi, HardDrive, ExternalLink, Activity } from "lucide-react";
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
// Optimized: only fields fetched from database
type Asset = Pick<Tables<"assets">, "id" | "client_id" | "name" | "asset_type" | "brand" | "model" | "serial_number" | "status" | "location" | "notes" | "purchase_date" | "purchase_value">;
type MonitoredDevice = Pick<Tables<"monitored_devices">, "id" | "name" | "hostname" | "ip_address" | "device_type" | "is_online" | "uptime_percent" | "last_seen_at" | "external_source" | "client_id">;

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
      return Monitor;
    case "notebook":
      return Laptop;
    case "server":
      return Server;
    case "printer":
      return Printer;
    case "switch":
    case "router":
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

  // Fetch assets from assets table
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

  // Fetch monitored devices (RMM, UniFi, Uptime Kuma, etc.)
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

  const isLoading = isLoadingAssets || isLoadingDevices;

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

  // Combine both lists
  const allItems = [
    ...assets.map((a) => ({ ...a, source: "manual" as const })),
    ...monitoredDevices.map((d) => ({ ...d, source: "monitored" as const })),
  ];

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
        ) : allItems.length === 0 ? (
          <div className="text-center py-8">
            <Monitor className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">Nenhum ativo cadastrado</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ativo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Detalhes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allItems.map((item) => {
                const isRmm = item.source === "monitored";
                const Icon = isRmm
                  ? (item as MonitoredDevice).device_type
                    ? getAssetIcon((item as MonitoredDevice).device_type!)
                    : Monitor
                  : getAssetIcon((item as Asset).asset_type);

                return (
                  <TableRow key={`${item.source}-${item.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isRmm
                        ? (item as MonitoredDevice).device_type || "-"
                        : assetTypeLabels[(item as Asset).asset_type]}
                    </TableCell>
                    <TableCell>
                      {isRmm ? (
                        <div className="text-sm text-muted-foreground">
                          {(item as MonitoredDevice).hostname && (
                            <div>Host: {(item as MonitoredDevice).hostname}</div>
                          )}
                          {(item as MonitoredDevice).ip_address && (
                            <div>IP: {(item as MonitoredDevice).ip_address}</div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {[(item as Asset).brand, (item as Asset).model]
                            .filter(Boolean)
                            .join(" ")}
                          {(item as Asset).serial_number && (
                            <div>S/N: {(item as Asset).serial_number}</div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {isRmm ? (
                        <Badge className={(item as MonitoredDevice).is_online ? "bg-status-success text-white" : "bg-destructive text-destructive-foreground"}>
                          {(item as MonitoredDevice).is_online ? "Online" : "Offline"}
                        </Badge>
                      ) : (
                        <Badge variant={statusVariants[(item as Asset).status]}>
                          {statusLabels[(item as Asset).status]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isRmm ? (
                        (item as MonitoredDevice).external_source === "uptime_kuma" ? (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            <Activity className="h-3 w-3 mr-1" />
                            Uptime Kuma
                          </Badge>
                        ) : (item as MonitoredDevice).external_source === "unifi" ? (
                          <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            <Wifi className="h-3 w-3 mr-1" />
                            UniFi
                          </Badge>
                        ) : (
                          <Badge variant="default" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            <Monitor className="h-3 w-3 mr-1" />
                            Tactical RMM
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Manual
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!isRmm && (
                        <div className="flex items-center justify-end gap-2">
                          <PermissionGate module="inventory" action="edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(item as Asset)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </PermissionGate>
                          <PermissionGate module="inventory" action="delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setDeleteConfirm({ open: true, asset: item as Asset })
                              }
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
        )}
      </CardContent>

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
