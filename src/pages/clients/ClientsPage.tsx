import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Search, Building2, Edit, Trash2, Phone, Mail, MessageCircle, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ClientForm } from "@/components/clients/ClientForm";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { useIsTechnicianOnly } from "@/hooks/useIsTechnicianOnly";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients"> & {
  trade_name?: string | null;
  whatsapp?: string | null;
  whatsapp_validated?: boolean | null;
  whatsapp_validated_at?: string | null;
};

const PAGE_SIZE = 25;

export default function ClientsPage() {
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; client: Client | null }>({
    open: false,
    client: null,
  });
  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open creation form when navigating with ?action=new
  useEffect(() => {
    if (searchParams.get("action") === "new") {
      setIsFormOpen(true);
      searchParams.delete("action");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  
  // Check if user is technician only (no admin/manager/financial roles)
  const isTechnicianOnly = useIsTechnicianOnly();
  
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", debouncedSearch, cursor],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("id, name, nickname, trade_name, document, email, phone, whatsapp, whatsapp_validated, city, state, is_active", { count: "exact" })
        .order("name")
        .limit(PAGE_SIZE + 1);

      if (cursor) {
        query = query.gt("name", cursor);
      }

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%,document.ilike.%${debouncedSearch}%,nickname.ilike.%${debouncedSearch}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      
      const hasNextPage = data && data.length > PAGE_SIZE;
      const clients = hasNextPage ? data.slice(0, PAGE_SIZE) : data || [];
      const nextCursor = hasNextPage && clients.length > 0 ? clients[clients.length - 1].name : null;
      
      return { 
        clients: clients as Client[], 
        total: count || 0,
        hasNextPage,
        nextCursor
      };
    },
  });
  
  const clients = data?.clients || [];
  const hasNextPage = data?.hasNextPage || false;
  const hasPreviousPage = previousCursors.length > 0;
  
  // Reset pagination when search changes
  useEffect(() => {
    setCursor(null);
    setPreviousCursors([]);
  }, [debouncedSearch]);

  const handleNextPage = () => {
    if (data?.nextCursor) {
      setPreviousCursors([...previousCursors, cursor || ""]);
      setCursor(data.nextCursor);
    }
  };

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
      const newCursors = [...previousCursors];
      const previousCursor = newCursors.pop();
      setPreviousCursors(newCursors);
      setCursor(previousCursor === "" ? null : previousCursor || null);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["clients-select"] });
      toast({ title: "Cliente excluído com sucesso" });
      setDeleteConfirm({ open: false, client: null });
    },
    onError: () => {
      toast({ title: "Erro ao excluir cliente", variant: "destructive" });
    },
  });

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingClient(null);
  };

  const handleDeleteClick = (client: Client) => {
    setDeleteConfirm({ open: true, client });
  };

  const handleConfirmDelete = () => {
    if (deleteConfirm.client) {
      deleteMutation.mutate(deleteConfirm.client.id);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
            <p className="text-muted-foreground">
              Gerencie sua base de clientes
            </p>
          </div>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <PermissionGate module="clients" action="create">
              <DialogTrigger asChild>
                <Button onClick={() => setEditingClient(null)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Cliente
                </Button>
              </DialogTrigger>
            </PermissionGate>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingClient ? "Editar Cliente" : "Novo Cliente"}
                </DialogTitle>
              </DialogHeader>
              <ClientForm
                client={editingClient}
                onSuccess={handleCloseForm}
                onCancel={handleCloseForm}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar clientes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="space-y-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></TableCell>
                    <TableCell><div className="space-y-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-28" /></div></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell className="text-right"><div className="flex justify-end gap-2"><Skeleton className="h-8 w-8" /><Skeleton className="h-8 w-8" /></div></TableCell>
                  </TableRow>
                ))
              ) : clients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Building2 className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-2 text-muted-foreground">
                      Nenhum cliente encontrado
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                clients.map((client) => (
                  <TableRow 
                    key={client.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/clients/${client.id}`)}
                  >
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{client.name}</p>
                          {(client as any).nickname && (
                            <Badge variant="outline" className="text-xs font-normal">
                              {(client as any).nickname}
                            </Badge>
                          )}
                        </div>
                        {client.trade_name && (
                          <p className="text-sm text-muted-foreground">
                            {client.trade_name}
                          </p>
                        )}
                        {/* Hide document (CPF/CNPJ) from technicians */}
                        {!isTechnicianOnly && client.document && !client.trade_name && (
                          <p className="text-sm text-muted-foreground">
                            {client.document}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {client.email && (
                          <div className="flex items-center gap-1 text-sm">
                            <Mail className="h-3 w-3" />
                            {client.email}
                          </div>
                        )}
                        {client.phone && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {formatPhone(client.phone)}
                          </div>
                        )}
                        {client.whatsapp && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 text-sm">
                                  <MessageCircle className={`h-3 w-3 ${client.whatsapp_validated ? 'text-green-500' : 'text-muted-foreground'}`} />
                                  <span className={client.whatsapp_validated ? 'text-green-600' : 'text-muted-foreground'}>
                                    {formatPhone(client.whatsapp)}
                                  </span>
                                  {client.whatsapp_validated && (
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {client.whatsapp_validated ? (
                                  <p className="text-xs">
                                    WhatsApp verificado
                                    {client.whatsapp_validated_at && (
                                      <> em {new Date(client.whatsapp_validated_at).toLocaleDateString('pt-BR')}</>
                                    )}
                                  </p>
                                ) : (
                                  <p className="text-xs">WhatsApp não verificado</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {client.city && client.state ? (
                        <span className="text-sm">
                          {client.city}, {client.state}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={client.is_active ? "default" : "secondary"}>
                        {client.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <PermissionGate module="clients" action="edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleEdit(client); }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </PermissionGate>
                        <PermissionGate module="clients" action="delete">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(client); }}
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
          
          {/* Pagination */}
          {(hasNextPage || hasPreviousPage) && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {clients.length} clientes carregados {data?.total ? `de ${data.total} total` : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!hasPreviousPage}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!hasNextPage}
                >
                  Próximo
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Excluir Cliente"
        description={`Tem certeza que deseja excluir o cliente "${deleteConfirm.client?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </AppLayout>
  );
}
