import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Search, Monitor, Key, Shield, Edit, Trash2, LayoutDashboard } from "lucide-react";
import { InventoryOverview } from "@/components/inventory/InventoryOverview";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { AssetForm } from "@/components/inventory/AssetForm";
import { LicenseForm } from "@/components/inventory/LicenseForm";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables, Enums } from "@/integrations/supabase/types";

type AssetWithClient = Tables<"assets"> & {
  clients: { name: string } | null;
};

// Use safe view type - license_key is masked
type LicenseWithClientSafe = {
  id: string;
  client_id: string;
  name: string;
  vendor: string | null;
  total_licenses: number;
  used_licenses: number;
  purchase_date: string | null;
  expire_date: string | null;
  purchase_value: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  license_key_masked: string | null;
  clients: { name: string } | null;
};

const assetStatusLabels: Record<Enums<"asset_status">, string> = {
  active: "Ativo",
  maintenance: "Manutenção",
  disposed: "Descartado",
  loaned: "Emprestado",
};

const assetStatusColors: Record<Enums<"asset_status">, string> = {
  active: "bg-status-success text-white",
  maintenance: "bg-status-warning text-white",
  disposed: "bg-muted text-muted-foreground",
  loaned: "bg-status-progress text-white",
};

const assetTypeLabels: Record<Enums<"asset_type">, string> = {
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

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open creation form when navigating with ?action=new
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsAssetFormOpen(true);
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [isLicenseFormOpen, setIsLicenseFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetWithClient | null>(null);
  const [editingLicense, setEditingLicense] = useState<LicenseWithClientSafe | null>(null);
  const [deleteAssetConfirm, setDeleteAssetConfirm] = useState<{ open: boolean; asset: AssetWithClient | null }>({
    open: false,
    asset: null,
  });
  const [deleteLicenseConfirm, setDeleteLicenseConfirm] = useState<{ open: boolean; license: LicenseWithClientSafe | null }>({
    open: false,
    license: null,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const debouncedSearch = useDebounce(search, 300);

  const { data: assets = [], isLoading: loadingAssets } = useQuery({
    queryKey: ["assets", debouncedSearch],
    queryFn: async () => {
      let query = supabase
        .from("assets")
        .select("*, clients(name)")
        .order("name");

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,serial_number.ilike.%${debouncedSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AssetWithClient[];
    },
  });

  // Use safe view to mask license keys - protects sensitive data
  const { data: licenses = [], isLoading: loadingLicenses } = useQuery({
    queryKey: ["licenses", debouncedSearch],
    queryFn: async () => {
      // Query the safe view which masks license_key
      const { data: licensesData, error: licensesError } = await supabase
        .from("software_licenses_safe")
        .select("id, name, vendor, license_key, expire_date, max_activations, current_activations, client_id, status")
        .order("name");

      if (licensesError) throw licensesError;
      
      // Get client names for these licenses
      const clientIds = [...new Set(licensesData.map(l => l.client_id).filter(Boolean))];
      
      let clientsMap: Record<string, { name: string }> = {};
      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from("clients")
          .select("id, name")
          .in("id", clientIds);
        
        if (clientsData) {
          clientsMap = Object.fromEntries(
            clientsData.map(c => [c.id, { name: c.name }])
          );
        }
      }
      
      // Combine licenses with client names
      let results: LicenseWithClientSafe[] = licensesData.map(l => ({
        ...l,
        clients: clientsMap[l.client_id] || null,
      }));
      
      if (debouncedSearch) {
        const searchLower = debouncedSearch.toLowerCase();
        results = results.filter(l => 
          l.name.toLowerCase().includes(searchLower) ||
          (l.vendor && l.vendor.toLowerCase().includes(searchLower))
        );
      }
      
      return results;
    },
  });

  const deleteAssetMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("assets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Ativo excluído com sucesso" });
      setDeleteAssetConfirm({ open: false, asset: null });
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir ativo", description: error.message, variant: "destructive" });
    },
  });

  const deleteLicenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("software_licenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["licenses"] });
      toast({ title: "Licença excluída com sucesso" });
      setDeleteLicenseConfirm({ open: false, license: null });
    },
    onError: (error) => {
      toast({ title: "Erro ao excluir licença", description: error.message, variant: "destructive" });
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Inventário</h1>
            <p className="text-muted-foreground">
              Gerencie ativos e licenças de software
            </p>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="overview" className="gap-2">
                <LayoutDashboard className="h-4 w-4" />
                Visão Geral
              </TabsTrigger>
              <TabsTrigger value="assets" className="gap-2">
                <Monitor className="h-4 w-4" />
                Ativos
              </TabsTrigger>
              <TabsTrigger value="licenses" className="gap-2">
                <Key className="h-4 w-4" />
                Licenças
              </TabsTrigger>
              <TabsTrigger value="warranties" className="gap-2">
                <Shield className="h-4 w-4" />
                Garantias
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <TabsContent value="overview">
            <InventoryOverview />
          </TabsContent>

          <TabsContent value="assets" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={isAssetFormOpen} onOpenChange={setIsAssetFormOpen}>
                <PermissionGate module="inventory" action="create">
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingAsset(null)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Ativo
                    </Button>
                  </DialogTrigger>
                </PermissionGate>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingAsset ? "Editar Ativo" : "Novo Ativo"}
                    </DialogTitle>
                  </DialogHeader>
                  <AssetForm
                    asset={editingAsset}
                    onSuccess={() => setIsAssetFormOpen(false)}
                    onCancel={() => setIsAssetFormOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ativo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Nº Série</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingAssets ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="space-y-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-20" /></div></TableCell>
                        <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell className="text-right"><div className="flex justify-end gap-2"><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /></div></TableCell>
                      </TableRow>
                    ))
                  ) : assets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Monitor className="mx-auto h-12 w-12 text-muted-foreground/50" />
                        <p className="mt-2 text-muted-foreground">Nenhum ativo encontrado</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    assets.map((asset) => (
                      <TableRow key={asset.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{asset.name}</p>
                            {asset.brand && (
                              <p className="text-sm text-muted-foreground">
                                {asset.brand} {asset.model}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{assetTypeLabels[asset.asset_type]}</Badge>
                        </TableCell>
                        <TableCell>{asset.clients?.name || "-"}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {asset.serial_number || "-"}
                        </TableCell>
                        <TableCell>
                          <Badge className={assetStatusColors[asset.status]}>
                            {assetStatusLabels[asset.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <PermissionGate module="inventory" action="edit">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingAsset(asset);
                                  setIsAssetFormOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate module="inventory" action="delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteAssetConfirm({ open: true, asset })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="licenses" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={isLicenseFormOpen} onOpenChange={setIsLicenseFormOpen}>
                <PermissionGate module="inventory" action="create">
                  <DialogTrigger asChild>
                    <Button onClick={() => setEditingLicense(null)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Nova Licença
                    </Button>
                  </DialogTrigger>
                </PermissionGate>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingLicense ? "Editar Licença" : "Nova Licença"}
                    </DialogTitle>
                  </DialogHeader>
                  <LicenseForm
                    license={editingLicense}
                    onSuccess={() => setIsLicenseFormOpen(false)}
                    onCancel={() => setIsLicenseFormOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>

            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Software</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Licenças</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLicenses ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell className="text-right"><div className="flex justify-end gap-2"><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /></div></TableCell>
                      </TableRow>
                    ))
                  ) : licenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Key className="mx-auto h-12 w-12 text-muted-foreground/50" />
                        <p className="mt-2 text-muted-foreground">Nenhuma licença encontrada</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    licenses.map((license) => (
                      <TableRow key={license.id}>
                        <TableCell className="font-medium">{license.name}</TableCell>
                        <TableCell>{license.vendor || "-"}</TableCell>
                        <TableCell>{license.clients?.name || "-"}</TableCell>
                        <TableCell>
                          <span className="font-medium">{license.used_licenses}</span>
                          <span className="text-muted-foreground">/{license.total_licenses}</span>
                        </TableCell>
                        <TableCell>
                          {license.expire_date ? (
                            <span className={new Date(license.expire_date) < new Date() ? "text-destructive" : ""}>
                              {format(new Date(license.expire_date), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <PermissionGate module="inventory" action="edit">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setEditingLicense(license);
                                  setIsLicenseFormOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                            <PermissionGate module="inventory" action="delete">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteLicenseConfirm({ open: true, license })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </PermissionGate>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="warranties">
            <div className="rounded-lg border bg-card p-8 text-center">
              <Shield className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <p className="mt-2 text-muted-foreground">
                Garantias são gerenciadas através dos ativos
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Asset Confirmation Dialog */}
      <ConfirmDialog
        open={deleteAssetConfirm.open}
        onOpenChange={(open) => setDeleteAssetConfirm({ ...deleteAssetConfirm, open })}
        title="Excluir Ativo"
        description={`Tem certeza que deseja excluir o ativo "${deleteAssetConfirm.asset?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => deleteAssetConfirm.asset && deleteAssetMutation.mutate(deleteAssetConfirm.asset.id)}
        isLoading={deleteAssetMutation.isPending}
      />

      {/* Delete License Confirmation Dialog */}
      <ConfirmDialog
        open={deleteLicenseConfirm.open}
        onOpenChange={(open) => setDeleteLicenseConfirm({ ...deleteLicenseConfirm, open })}
        title="Excluir Licença"
        description={`Tem certeza que deseja excluir a licença "${deleteLicenseConfirm.license?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={() => deleteLicenseConfirm.license && deleteLicenseMutation.mutate(deleteLicenseConfirm.license.id)}
        isLoading={deleteLicenseMutation.isPending}
      />
    </AppLayout>
  );
}
