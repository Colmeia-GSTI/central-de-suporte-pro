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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { useToast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/utils";
import { Plus, Users, Pencil, Key, Trash2, UserCheck, UserX, Eye, EyeOff, MessageCircle, Bell, BellOff } from "lucide-react";

const userSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  username: z.string().min(3, "Username deve ter pelo menos 3 caracteres")
    .regex(/^[a-zA-Z0-9._-]+$/, "Username pode conter apenas letras, números, pontos, hífens e underlines"),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  notifyWhatsapp: z.boolean().default(true),
  role: z.string().optional(),
  isPrimary: z.boolean().default(false),
  isActive: z.boolean().default(true),
  isClientMaster: z.boolean().default(false),
});

type UserFormData = z.infer<typeof userSchema>;

interface ClientUser {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  notify_whatsapp: boolean;
  role: string | null;
  is_primary: boolean;
  is_active: boolean;
  user_id: string | null;
  client_id: string;
  created_at: string;
}

interface ClientUsersListProps {
  clientId: string;
}

export function ClientUsersList({ clientId }: ClientUsersListProps) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<ClientUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: "",
      username: "",
      password: "",
      email: "",
      phone: "",
      whatsapp: "",
      notifyWhatsapp: true,
      role: "",
      isPrimary: false,
      isActive: true,
      isClientMaster: false,
    },
  });

  const { data: users, isLoading } = useQuery({
    queryKey: ["client-users", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("id, name, username, email, phone, whatsapp, notify_whatsapp, role, is_primary, is_active, user_id")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false })
        .order("name");

      if (error) throw error;
      return data as ClientUser[];
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const { data: result, error } = await supabase.functions.invoke("create-client-user", {
        body: {
          clientId,
          name: data.name,
          username: data.username,
          password: data.password,
          email: data.email || undefined,
          phone: data.phone || undefined,
          role: data.role || undefined,
          isPrimary: data.isPrimary,
          isClientMaster: data.isClientMaster,
        },
      });

      if (error) throw error;
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
      toast({ title: "Usuário criado com sucesso!" });
      handleCloseForm();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao criar usuário", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserFormData> }) => {
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
      toast({ title: "Usuário atualizado com sucesso!" });
      handleCloseForm();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao atualizar usuário", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_contacts")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-users", clientId] });
      toast({ title: "Usuário removido com sucesso!" });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao remover usuário", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke("reset-password", {
        body: { userId, newPassword: password },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Senha alterada com sucesso!" });
      setResetPasswordUser(null);
      setNewPassword("");
    },
    onError: (error: Error) => {
      toast({ 
        title: "Erro ao alterar senha", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleEdit = (user: ClientUser) => {
    setEditingUser(user);
    form.reset({
      name: user.name,
      username: user.username || "",
      password: "", // Não preencher senha ao editar
      email: user.email || "",
      phone: formatPhone(user.phone),
      whatsapp: formatPhone(user.whatsapp),
      notifyWhatsapp: user.notify_whatsapp ?? true,
      role: user.role || "",
      isPrimary: user.is_primary,
      isActive: user.is_active,
    });
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingUser(null);
    form.reset();
  };

  const onSubmit = (data: UserFormData) => {
    if (editingUser) {
      updateUserMutation.mutate({ id: editingUser.id, data });
    } else {
      if (!data.password) {
        form.setError("password", { message: "Senha é obrigatória para novos usuários" });
        return;
      }
      createUserMutation.mutate({ ...data, username: data.username.toLowerCase() });
    }
  };

  const handleResetPassword = () => {
    if (!resetPasswordUser?.user_id || !newPassword) return;
    
    if (newPassword.length < 6) {
      toast({ 
        title: "Senha muito curta", 
        description: "A senha deve ter pelo menos 6 caracteres",
        variant: "destructive" 
      });
      return;
    }

    resetPasswordMutation.mutate({ 
      userId: resetPasswordUser.user_id, 
      password: newPassword 
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
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
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
          <Button onClick={() => setIsFormOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Novo Usuário
          </Button>
        </PermissionGate>
      </CardHeader>
      <CardContent>
        {users && users.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Username</TableHead>
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
                      {user.is_primary && (
                        <Badge variant="secondary" className="text-xs">Principal</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {user.username || "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.email || "-"}
                  </TableCell>
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
                      <Badge variant="outline" className="text-muted-foreground">
                        Sem acesso
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <PermissionGate module="clients" action="edit">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(user)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {user.user_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setResetPasswordUser(user)}
                            title="Alterar senha"
                          >
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
            <p className="text-sm">Adicione usuários para que possam acessar o portal do cliente</p>
          </div>
        )}

        {/* Dialog de criação/edição */}
        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>
                {editingUser ? "Editar Usuário" : "Novo Usuário"}
              </DialogTitle>
              <DialogDescription>
                {editingUser 
                  ? "Atualize as informações do usuário" 
                  : "Crie um usuário que poderá acessar o portal do cliente"
                }
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome completo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!editingUser && (
                  <>
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="usuario.login" 
                              {...field} 
                              onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                            />
                          </FormControl>
                          <FormDescription>
                            Usado para fazer login no portal
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Senha *</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type={showPassword ? "text" : "password"}
                                placeholder="Mínimo 6 caracteres" 
                                {...field} 
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="email@exemplo.com (opcional)" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Opcional. Se não informado, será gerado automaticamente.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                          onChange={(e) => field.onChange(formatPhone(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cargo</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Gerente de TI" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="whatsapp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-green-500" />
                        WhatsApp para Notificações
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="(00) 00000-0000" 
                          {...field}
                          onChange={(e) => field.onChange(formatPhone(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Receberá atualizações sobre seus chamados
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notifyWhatsapp"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal flex items-center gap-1">
                        {field.value ? (
                          <Bell className="h-3 w-3 text-green-500" />
                        ) : (
                          <BellOff className="h-3 w-3 text-muted-foreground" />
                        )}
                        Receber notificações por WhatsApp
                      </FormLabel>
                    </FormItem>
                  )}
                />

                <div className="flex flex-wrap gap-4">
                  <FormField
                    control={form.control}
                    name="isPrimary"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          Usuário principal
                        </FormLabel>
                      </FormItem>
                    )}
                  />

                  {!editingUser && (
                    <FormField
                      control={form.control}
                      name="isClientMaster"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Administrador
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  )}

                  {editingUser && (
                    <FormField
                      control={form.control}
                      name="isActive"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-2 space-y-0">
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Ativo
                          </FormLabel>
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                  {!editingUser && form.watch("isClientMaster") && (
                    <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                      ⚡ Administradores podem ver todos os chamados da empresa, não apenas os próprios.
                    </p>
                  )}
                </div>

                <DialogFooter className="flex-shrink-0 pt-4 border-t mt-4">
                  <Button type="button" variant="outline" onClick={handleCloseForm}>
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createUserMutation.isPending || updateUserMutation.isPending}
                  >
                    {createUserMutation.isPending || updateUserMutation.isPending 
                      ? "Salvando..." 
                      : editingUser ? "Salvar" : "Criar Usuário"
                    }
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Dialog de reset de senha */}
        <Dialog open={!!resetPasswordUser} onOpenChange={() => setResetPasswordUser(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Alterar Senha</DialogTitle>
              <DialogDescription>
                Defina uma nova senha para {resetPasswordUser?.name}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Nova Senha</label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Mínimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => {
                  setResetPasswordUser(null);
                  setNewPassword("");
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleResetPassword}
                disabled={resetPasswordMutation.isPending || !newPassword}
              >
                {resetPasswordMutation.isPending ? "Alterando..." : "Alterar Senha"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
