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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Calculator, Edit, Power, PowerOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ServiceCodeForm } from "@/components/nfse/ServiceCodeForm";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Skeleton } from "@/components/ui/skeleton";
import type { Tables } from "@/integrations/supabase/types";

type NfseServiceCode = Tables<"nfse_service_codes">;

export function BillingTaxCodesTab() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<NfseServiceCode | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["nfse-service-codes", search, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from("nfse_service_codes")
        .select("id, codigo_tributacao, descricao, aliquota_sugerida, categoria, cnae_principal, item_lista, subitem_lista, ativo, created_at")
        .order("codigo_tributacao");

      if (search) {
        query = query.or(`codigo_tributacao.ilike.%${search}%,descricao.ilike.%${search}%`);
      }

      if (categoryFilter && categoryFilter !== "all") {
        query = query.eq("categoria", categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as NfseServiceCode[];
    },
  });

  // Get unique categories
  const { data: categories = [] } = useQuery({
    queryKey: ["nfse-service-code-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfse_service_codes")
        .select("categoria")
        .not("categoria", "is", null);

      if (error) throw error;
      const uniqueCategories = [...new Set(data.map(d => d.categoria))].filter(Boolean);
      return uniqueCategories as string[];
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("nfse_service_codes")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["nfse-service-codes"] });
      toast({ title: variables.ativo ? "Código ativado" : "Código desativado" });
    },
    onError: () => {
      toast({ title: "Erro ao atualizar código", variant: "destructive" });
    },
  });

  const handleEdit = (code: NfseServiceCode) => {
    setEditingCode(code);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingCode(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por código ou descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <PermissionGate module="financial" action="create">
            <DialogTrigger asChild>
              <Button onClick={() => setEditingCode(null)}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Código
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {editingCode ? "Editar Código Tributário" : "Novo Código Tributário"}
              </DialogTitle>
            </DialogHeader>
            <ServiceCodeForm
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
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Item LC 116</TableHead>
              <TableHead>CNAE</TableHead>
              <TableHead>Alíquota</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : codes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Calculator className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">
                    Nenhum código tributário encontrado
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              codes.map((code) => (
                <TableRow key={code.id} className={!code.ativo ? "opacity-50" : ""}>
                  <TableCell className="font-mono font-medium">
                    {code.codigo_tributacao}
                  </TableCell>
                  <TableCell>
                    <p className="max-w-xs truncate" title={code.descricao}>
                      {code.descricao}
                    </p>
                  </TableCell>
                  <TableCell>
                    {code.item_lista && code.subitem_lista
                      ? `${code.item_lista}.${code.subitem_lista}`
                      : code.item_lista || "-"}
                  </TableCell>
                  <TableCell className="font-mono">
                    {code.cnae_principal || "-"}
                  </TableCell>
                  <TableCell>
                    {code.aliquota_sugerida
                      ? `${code.aliquota_sugerida.toFixed(2)}%`
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {code.categoria ? (
                      <Badge variant="outline">{code.categoria}</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={code.ativo ? "default" : "secondary"}
                      className={code.ativo ? "bg-status-success" : ""}
                    >
                      {code.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <PermissionGate module="financial" action="edit">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(code)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                      <PermissionGate module="financial" action="edit">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              id: code.id,
                              ativo: !code.ativo,
                            })
                          }
                        >
                          {code.ativo ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
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
    </div>
  );
}
