import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, MapPin, Phone, Mail, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCEP, formatPhone, getErrorMessage } from "@/lib/utils";
import {
  useClientBranches,
  type ClientBranch,
  type ClientBranchPayload,
} from "@/hooks/useClientBranches";

const branchSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  is_main: z.boolean().default(false),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2, "UF deve ter 2 caracteres").optional(),
  cep: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notes: z.string().optional(),
});

type BranchFormData = z.infer<typeof branchSchema>;

interface ClientBranchesListProps {
  clientId: string;
}

const EMPTY_FORM: BranchFormData = {
  name: "",
  is_main: false,
  address: "",
  city: "",
  state: "",
  cep: "",
  phone: "",
  email: "",
  notes: "",
};

function toPayload(data: BranchFormData): ClientBranchPayload {
  return {
    name: data.name.trim(),
    is_main: data.is_main,
    address: data.address?.trim() || null,
    city: data.city?.trim() || null,
    state: data.state?.trim().toUpperCase() || null,
    cep: data.cep?.replace(/\D/g, "") || null,
    phone: data.phone?.replace(/\D/g, "") || null,
    email: data.email?.trim() || null,
    notes: data.notes?.trim() || null,
  };
}

function isUniqueViolation(error: unknown, hint: string): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string };
  return e.code === "23505" && `${e.message ?? ""} ${e.details ?? ""}`.includes(hint);
}

export function ClientBranchesList({ clientId }: ClientBranchesListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<ClientBranch | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    branch: ClientBranch | null;
  }>({ open: false, branch: null });
  const { toast } = useToast();
  const { items, isLoading, create, update, remove, isMutating } =
    useClientBranches(clientId);

  const form = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: EMPTY_FORM,
  });

  const handleOpenNew = () => {
    setEditing(null);
    form.reset(EMPTY_FORM);
    setIsFormOpen(true);
  };

  const handleEdit = (branch: ClientBranch) => {
    setEditing(branch);
    form.reset({
      name: branch.name,
      is_main: branch.is_main,
      address: branch.address ?? "",
      city: branch.city ?? "",
      state: branch.state ?? "",
      cep: formatCEP(branch.cep),
      phone: formatPhone(branch.phone),
      email: branch.email ?? "",
      notes: branch.notes ?? "",
    });
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditing(null);
    form.reset(EMPTY_FORM);
  };

  const handleMutationError = (error: unknown) => {
    if (isUniqueViolation(error, "uniq_client_branches_main_per_client")) {
      toast({
        title: "Já existe uma sede",
        description:
          "Já existe uma sede para este cliente. Desmarque a sede atual antes de marcar outra.",
        variant: "destructive",
      });
      return;
    }
    if (isUniqueViolation(error, "uniq_client_branches_name_per_client")) {
      toast({
        title: "Nome duplicado",
        description: "Já existe uma filial com este nome para este cliente.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Erro",
      description: getErrorMessage(error),
      variant: "destructive",
    });
  };

  const onSubmit = async (data: BranchFormData) => {
    const payload = toPayload(data);
    try {
      if (editing) {
        await update({ id: editing.id, ...payload });
        toast({ title: "Filial atualizada" });
      } else {
        await create(payload);
        toast({ title: "Filial adicionada" });
      }
      handleClose();
    } catch (error) {
      handleMutationError(error);
    }
  };

  const handleDeleteRequest = (branch: ClientBranch) => {
    if (branch.is_main && items.length > 1) {
      toast({
        title: "Não é possível excluir a Sede",
        description:
          "Marque outra filial como Sede antes de excluir esta.",
        variant: "destructive",
      });
      return;
    }
    setDeleteConfirm({ open: true, branch });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.branch) return;
    try {
      await remove(deleteConfirm.branch.id);
      toast({ title: "Filial excluída" });
      setDeleteConfirm({ open: false, branch: null });
    } catch (error) {
      handleMutationError(error);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Filiais</CardTitle>
          <CardDescription>
            Unidades operacionais deste cliente
          </CardDescription>
        </div>
        <Dialog
          open={isFormOpen}
          onOpenChange={(open) => (open ? setIsFormOpen(true) : handleClose())}
        >
          <PermissionGate module="clients" action="edit">
            <DialogTrigger asChild>
              <Button onClick={handleOpenNew}>
                <Plus className="mr-2 h-4 w-4" />
                Nova Filial
              </Button>
            </DialogTrigger>
          </PermissionGate>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar Filial" : "Nova Filial"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ex: Sede, Filial Centro, Loja Norte"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_main"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Filial principal (Sede)</FormLabel>
                        <FormDescription>
                          Apenas uma filial pode ser marcada como Sede por cliente.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="cep"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CEP</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="00000-000"
                            {...field}
                            onChange={(e) =>
                              field.onChange(formatCEP(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel>Cidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Cidade" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>UF</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="UF"
                            maxLength={2}
                            {...field}
                            onChange={(e) =>
                              field.onChange(e.target.value.toUpperCase())
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Endereço</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Rua, número, complemento, bairro"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="(00) 00000-0000"
                            {...field}
                            onChange={(e) =>
                              field.onChange(formatPhone(e.target.value))
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input placeholder="filial@exemplo.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Observações</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Informações adicionais sobre a filial"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isMutating}>
                    {isMutating ? "Salvando..." : "Salvar"}
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
        ) : items.length === 0 ? (
          <div className="text-center py-8">
            <MapPin className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-2 text-muted-foreground">
              Nenhuma filial cadastrada
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{branch.name}</span>
                      {branch.is_main && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Star className="h-3 w-3" />
                          Sede
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {branch.address || "—"}
                  </TableCell>
                  <TableCell>
                    {branch.city || branch.state
                      ? `${branch.city ?? "—"}/${branch.state ?? "—"}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {branch.phone && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {formatPhone(branch.phone)}
                        </div>
                      )}
                      {branch.email && (
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {branch.email}
                        </div>
                      )}
                      {!branch.phone && !branch.email && "—"}
                    </div>
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <PermissionGate module="clients" action="edit">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(branch)}
                          aria-label={`Editar filial ${branch.name}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                      <PermissionGate module="clients" action="delete">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteRequest(branch)}
                          aria-label={`Excluir filial ${branch.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </PermissionGate>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) =>
          setDeleteConfirm({ ...deleteConfirm, open })
        }
        title={`Excluir filial '${deleteConfirm.branch?.name ?? ""}'?`}
        description="Esta ação não pode ser desfeita. Itens vinculados a esta filial passarão a não ter filial associada."
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={isMutating}
      />
    </Card>
  );
}
