import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { toast } from "sonner";
import { formatPhone } from "@/lib/utils";
import { Plus, Users, Pencil, Key, Trash2, UserCheck, UserX, Clock, MessageCircle, Bell, BellOff, Loader2 } from "lucide-react";
import { ResetPasswordDialog } from "@/components/auth/ResetPasswordDialog";

// Convite (criação): só nome, email e papel. Senha NUNCA é definida aqui —
// o usuário cria a própria senha via link /setup-account (fluxo de convite).
const inviteSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email é obrigatório para enviar o convite"),
  role: z.enum(["client", "client_master"]).default("client"),
});
type InviteFormData = z.infer<typeof inviteSchema>;

// Edição: apenas dados do contato (client_contacts). Não toca em auth.
const editSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  notifyWhatsapp: z.boolean().default(true),
  role: z.string().optional(),
  isPrimary: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
type EditFormData = z.infer<typeof editSchema>;

interface ClientUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  notify_whatsapp: boolean;
  role: string | null;
  is_primary: boolean;
  is_active: boolean;
  user_id: string | null;
}

interface ClientUsersListProps {
  clientId: string;
}

export function ClientUsersList({ clientId }: ClientUsersListProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<ClientUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const inviteForm = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: "", email: "", role: "client" },
  });

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "", email: "", phone: "", whatsapp: "",
      notifyWhatsapp: true, role: "", isPrimary: false, isActive: true,
    },
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ["client-users", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("id, name, email, phone, whatsapp, notify_whatsapp, role, is_primary, is_active, user_id")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("name");
      if (error) throw error;
      return data as ClientUser[];
    },
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteFormData) => {
      const { data: result, error } = await supabase.functions.invoke("invite-user", {
        body: { email: data.email, full_name: data.name, role: data.role, client_id: clientId },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
      queryClient.invalidateQueries({ queryKey: ["pending-invites-count"] });
      toast.success("Convite enviado", { description: "O usuário receberá um email para criar a própria senha." });
      setInviteOpen(false);
      inviteForm.reset({ name: "", email: "", role: "client" });
    },
    onError: (error: Error) =>
      toast.error("Erro ao enviar convite", { description: error.message }),
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: EditFormData }) => {
      const { error } = await supabase
        .from("client_contacts")
        .update({
          name: data.name,
          email: data.email || null,
          phone: data.phone?.replace(/\D/g, "") || null,
          whatsapp: data.whatsapp?.replace(/\D/g, "") || null,
          notify_whatsapp: data.notifyWhatsapp ?? true,
          role: data.role || null,
          is_primary: data.isPrimary,
          is_active: data.isActive,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
      toast.success("Usuário atualizado com sucesso!");
      setEditingUser(null);
    },
    onError: (error: Error) =>
      toast.error("Erro ao atualizar usuário", { description: error.message }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: contact, error: fetchError } = await supabase
        .from("client_contacts")
        .select("id, user_id")
        .eq("id", id)
        .single();
      if (fetchError) throw fetchError;

      // Se tem user_id, remove o usuário auth primeiro (cascateia para profiles e user_roles)
      if (contact.user_id) {
        const { data: deleteResult, error: fnError } = await supabase.functions.invoke("delete-user", {
          body: { user_id: contact.user_id },
        });
        if (fnError) throw fnError;
        if (deleteResult?.error) throw new Error(deleteResult.error);
      }

      const { error } = await supabase.from("client_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
      toast.success("Usuário removido com sucesso!");
      setDeleteConfirm(null);
    },
    onError: (error: Error) =>
      toast.error("Erro ao remover usuário", { description: error.message }),
  });

  const handleEdit = (user: ClientUser) => {
    setEditingUser(user);
    editForm.reset({
      name: user.name,
      email: user.email || "",
      phone: formatPhone(user.phone),
      whatsapp: formatPhone(user.whatsapp),
      notifyWhatsapp: user.notify_whatsapp ?? true,
      role: user.role || "",
      isPrimary: user.is_primary,
      isActive: user.is_active,
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Usuários
          </CardTitle>
          <CardDescription>
            Usuários que podem acessar o portal e abrir chamados
          </CardDescription>
        </div>
        <PermissionGate module="clients" action="edit">
          <Button onClick={() => setInviteOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Convidar Usuário
          </Button>
        </PermissionGate>
      </CardHeader>
      <CardContent>
        {users && users.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Cargo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[120px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {user.name}
                      {user.is_primary && <Badge variant="secondary" className="text-xs">Principal</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{user.email || "-"}</TableCell>
                  <TableCell>{user.role || "-"}</TableCell>
                  <TableCell>
                    {user.user_id ? (
                      user.is_active ? (
                        <Badge variant="default" className="gap-1">
                          <UserCheck className="h-3 w-3" />
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <UserX className="h-3 w-3" />
                          Inativo
                        </Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Convite pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <PermissionGate module="clients" action="edit">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(user)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {user.user_id && (
                          <Button variant="ghost" size="icon" onClick={() => setResetPasswordUser(user)} title="Alterar senha">
                            <Key className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirm(user.id)}
                          title="Remover"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </PermissionGate>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum usuário cadastrado</p>
            <p className="text-sm">Convide usuários para que possam acessar o portal do cliente</p>
          </div>
        )}

        {/* Dialog de CONVITE (criação) — usuário cria a própria senha via link */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Convidar Usuário</DialogTitle>
              <DialogDescription>
                O usuário recebe um email para criar a própria senha e ativar o acesso ao portal.
              </DialogDescription>
            </DialogHeader>
            <Form {...inviteForm}>
              <form onSubmit={inviteForm.handleSubmit((d) => inviteMutation.mutate(d))} className="space-y-4">
                <FormField
                  control={inviteForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome completo *</FormLabel>
                      <FormControl><Input placeholder="João da Silva" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={inviteForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl><Input type="email" placeholder="email@empresa.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={inviteForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Papel *</FormLabel>
                      <FormControl>
                        <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                          <label className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer hover:bg-muted/30">
                            <RadioGroupItem value="client" className="mt-0.5" />
                            <div className="text-sm">
                              <div className="font-medium">Cliente comum</div>
                              <div className="text-xs text-muted-foreground">Abre e acompanha apenas os próprios chamados</div>
                            </div>
                          </label>
                          <label className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer hover:bg-muted/30">
                            <RadioGroupItem value="client_master" className="mt-0.5" />
                            <div className="text-sm">
                              <div className="font-medium">Cliente master</div>
                              <div className="text-xs text-muted-foreground">Vê todos os chamados, contratos e faturas da empresa</div>
                            </div>
                          </label>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar convite
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Dialog de EDIÇÃO — somente dados do contato */}
        <Dialog open={!!editingUser} onOpenChange={(o) => { if (!o) setEditingUser(null); }}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Editar Usuário</DialogTitle>
              <DialogDescription>Atualize as informações do usuário</DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form
                onSubmit={editForm.handleSubmit((data) => editingUser && updateUserMutation.mutate({ id: editingUser.id, data }))}
                className="flex flex-col flex-1 overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome *</FormLabel>
                        <FormControl><Input placeholder="Nome completo" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl><Input type="email" placeholder="email@exemplo.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                          <Input placeholder="(00) 00000-0000" {...field} onChange={(e) => field.onChange(formatPhone(e.target.value))} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cargo</FormLabel>
                        <FormControl><Input placeholder="Ex: Gerente de TI" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="whatsapp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-green-500" />
                          WhatsApp para Notificações
                        </FormLabel>
                        <FormControl>
                          <Input placeholder="(00) 00000-0000" {...field} onChange={(e) => field.onChange(formatPhone(e.target.value))} />
                        </FormControl>
                        <FormDescription>Receberá atualizações sobre seus chamados</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="notifyWhatsapp"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                        <FormLabel className="font-normal flex items-center gap-1">
                          {field.value ? <Bell className="h-3 w-3 text-green-500" /> : <BellOff className="h-3 w-3 text-muted-foreground" />}
                          Receber notificações por WhatsApp
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-wrap gap-4">
                    <FormField
                      control={editForm.control}
                      name="isPrimary"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <FormLabel className="font-normal">Usuário principal</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                          <FormLabel className="font-normal">Ativo</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
                <DialogFooter className="flex-shrink-0 pt-4 border-t mt-4">
                  <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Cancelar</Button>
                  <Button type="submit" disabled={updateUserMutation.isPending}>
                    {updateUserMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Reset de senha (componente compartilhado) — usa o auth user_id, não o contact.id */}
        <ResetPasswordDialog
          open={!!resetPasswordUser}
          onOpenChange={(open) => { if (!open) setResetPasswordUser(null); }}
          userId={resetPasswordUser?.user_id ?? null}
          userName={resetPasswordUser?.name}
          userEmail={resetPasswordUser?.email ?? undefined}
        />

        {/* Confirmação de exclusão */}
        <ConfirmDialog
          open={!!deleteConfirm}
          onOpenChange={() => setDeleteConfirm(null)}
          title="Remover usuário?"
          description="Esta ação não pode ser desfeita. O usuário perderá acesso ao portal."
          onConfirm={() => deleteConfirm && deleteUserMutation.mutate(deleteConfirm)}
          confirmLabel="Remover"
          variant="destructive"
        />
      </CardContent>
    </Card>
  );
}
