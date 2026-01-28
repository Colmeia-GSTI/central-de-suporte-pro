import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, Wrench, Edit, Trash2, Calculator, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ServiceForm } from "@/components/services/ServiceForm";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrencyBRLWithSymbol } from "@/lib/currency";

interface Service {
  id: string;
  name: string;
  description: string | null;
  base_value: number;
  multiplier: number;
  nfse_service_code: string | null;
  nfse_cnae: string | null;
  tax_iss: number | null;
  tax_pis: number | null;
  tax_cofins: number | null;
  tax_csll: number | null;
  tax_irrf: number | null;
  tax_inss: number | null;
  trib_municipio_recolhimento: string | null;
  ind_inc_fisc: boolean | null;
  c_nat_rend: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function BillingServicesTab() {
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; service: Service | null }>({
    open: false,
    service: null,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["services", search],
    queryFn: async () => {
      let query = supabase
        .from("services")
        .select("id, name, description, base_value, multiplier, nfse_service_code, nfse_cnae, tax_iss, tax_pis, tax_cofins, tax_csll, tax_irrf, tax_inss, trib_municipio_recolhimento, ind_inc_fisc, c_nat_rend, is_active, created_at, updated_at")
        .order("name");

      if (search) {
        query = query.ilike("name", `%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Service[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("services")
        .update({ is_active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({ title: "Serviço desativado com sucesso" });
      setDeleteConfirm({ open: false, service: null });
    },
    onError: () => {
      toast({ title: "Erro ao desativar serviço", variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("services")
        .update({ is_active: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services"] });
      toast({ title: "Serviço reativado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao reativar serviço", variant: "destructive" });
    },
  });

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingService(null);
  };

  const handleDeleteClick = (service: Service) => {
    setDeleteConfirm({ open: true, service });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.service) {
      deleteMutation.mutate(deleteConfirm.service.id);
    }
  };

  const calculateFinalValue = (baseValue: number, multiplier: number) => {
    return baseValue * multiplier;
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar serviços..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <PermissionGate module="services" action="create">
            <DialogTrigger asChild>
              <Button onClick={() => setEditingService(null)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Serviço
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingService ? "Editar Serviço" : "Novo Serviço"}
              </DialogTitle>
            </DialogHeader>
            <ServiceForm
              service={editingService}
              onSuccess={handleCloseForm}
              onCancel={handleCloseForm}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Valor Base</TableHead>
              <TableHead>Multiplicador</TableHead>
              <TableHead>Valor Final</TableHead>
              <TableHead>Código NFS-e</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Skeleton className="h-8 w-8" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : services.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Wrench className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">
                    Nenhum serviço encontrado
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              services.map((service) => (
                <TableRow key={service.id} className={!service.is_active ? "opacity-50" : ""}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{service.name}</p>
                      {service.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {service.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">
                    {formatCurrencyBRLWithSymbol(service.base_value)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Calculator className="h-3 w-3 text-muted-foreground" />
                      <span>{service.multiplier}x</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono font-semibold text-primary">
                    {formatCurrencyBRLWithSymbol(
                      calculateFinalValue(service.base_value, service.multiplier)
                    )}
                  </TableCell>
                  <TableCell>
                    {service.nfse_service_code ? (
                      <Badge variant="outline">{service.nfse_service_code}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={service.is_active ? "default" : "secondary"}
                      className={service.is_active ? "bg-status-success" : ""}
                    >
                      {service.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <PermissionGate module="services" action="edit">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(service)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                      <PermissionGate module="services" action="delete">
                        {service.is_active ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(service)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => reactivateMutation.mutate(service.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </PermissionGate>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Desativar Serviço"
        description={`Tem certeza que deseja desativar o serviço "${deleteConfirm.service?.name}"? O serviço não estará mais disponível para novos contratos.`}
        confirmLabel="Desativar"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
