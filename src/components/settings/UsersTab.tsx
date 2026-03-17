import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Search, Shield, Trash2, UserPlus, KeyRound, Loader2, UserCheck, Clock, Building2, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { UserForm } from "./UserForm";
import { UserProfileSheet } from "./UserProfileSheet";
import { TableSkeleton } from "@/components/ui/loading-skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Tables, Enums } from "@/integrations/supabase/types";

type ProfileWithRoles = Tables<"profiles"> & {
  user_roles: { role: Enums<"app_role"> }[];
};

const roleLabels: Record<Enums<"app_role">, string> = {
  admin: "Administrador",
  manager: "Gerente",
  technician: "Técnico",
  financial: "Financeiro",
  client: "Cliente",
  client_master: "Cliente Master",
};

const roleColors: Record<Enums<"app_role">, string> = {
  admin: "bg-priority-critical text-white",
  manager: "bg-priority-high text-white",
  technician: "bg-status-progress text-white",
  financial: "bg-status-warning text-white",
  client: "bg-muted text-muted-foreground",
  client_master: "bg-primary text-primary-foreground",
};

export function UsersTab() {
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<ProfileWithRoles | null>(null);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<ProfileWithRoles | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<ProfileWithRoles | null>(null);
  const [linkClientUser, setLinkClientUser] = useState<ProfileWithRoles | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [editProfileUser, setEditProfileUser] = useState<ProfileWithRoles | null>(null);
  const [clientSearchFilter, setClientSearchFilter] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-with-roles", search],
    queryFn: async () => {
      let profilesQuery = supabase
        .from("profiles")
        .select("id, user_id, full_name, email, phone, avatar_url")
        .order("full_name");

      if (search) {
        profilesQuery = profilesQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;

      const userIds = profiles?.map(p => p.user_id) || [];
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      if (rolesError) throw rolesError;

      return (profiles || []).map(profile => ({
        ...profile,
        user_roles: (roles || []).filter(r => r.user_id === profile.user_id).map(r => ({ role: r.role })),
      })) as ProfileWithRoles[];
    },
  });

  // Fetch email confirmation status for all users
  const { data: confirmationStatus = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["user-confirmation-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("confirm-user-email", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        body: undefined,
      });
      if (error) {
        logger.error("Failed to fetch confirmation status", "Users", { error: error.message });
        return {};
      }
      return data?.data || {};
    },
    staleTime: 1000 * 60 * 2,
  });

  // Fetch clients for linking
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-for-linking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Mutation to confirm a user's email
  const confirmEmailMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("confirm-user-email?action=confirm", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-confirmation-status"] });
      toast({ title: "Usuário ativado com sucesso", description: "O email foi confirmado e o usuário já pode acessar o sistema." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao ativar usuário", description: error.message, variant: "destructive" });
    },
  });

  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Enums<"app_role"> }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast({ title: "Papel adicionado com sucesso" });
      setIsRoleDialogOpen(false);
    },
    onError: (error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Enums<"app_role"> }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", role);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast({ title: "Papel removido com sucesso" });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      queryClient.invalidateQueries({ queryKey: ["user-confirmation-status"] });
      toast({ title: "Usuário excluído com sucesso" });
      setDeleteConfirmUser(null);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir usuário", description: error.message, variant: "destructive" });
    },
  });

  // Link user to client mutation
  const linkClientMutation = useMutation({
    mutationFn: async ({ userId, clientId, userName }: { userId: string; clientId: string; userName: string }) => {
      const { error } = await supabase.from("client_contacts").insert({
        client_id: clientId,
        user_id: userId,
        name: userName,
        is_primary: false,
        is_active: true,
      });
      if (error) throw error;

      // Atribuir role "client" se o usuário não tem nenhuma role
      const { data: existingRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const hasClientRole = existingRoles?.some(r => r.role === "client" || r.role === "client_master");
      const hasStaffRole = existingRoles?.some(r => ["admin", "manager", "technician", "financial"].includes(r.role));

      if (!hasClientRole && !hasStaffRole) {
        const { error: roleError } = await supabase.from("user_roles").insert({ user_id: userId, role: "client" });
        if (roleError) {
          console.error("[LinkClient] Falha ao atribuir role client:", roleError);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast({ title: "Usuário vinculado à empresa com sucesso" });
      setLinkClientUser(null);
      setSelectedClientId("");
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao vincular empresa", description: error.message, variant: "destructive" });
    },
  });

  const handleAddRole = (role: string) => {
    if (selectedUser) {
      addRoleMutation.mutate({ userId: selectedUser.user_id, role: role as Enums<"app_role"> });
    }
  };

  const handleRemoveRole = (userId: string, role: Enums<"app_role">) => {
    removeRoleMutation.mutate({ userId, role });
  };

  const createUserMutation = useMutation({
    mutationFn: async (data: {
      email: string;
      password: string;
      full_name: string;
      phone?: string;
      roles: string[];
    }) => {
      const { data: result, error } = await supabase.functions.invoke("create-user", {
        body: data,
      });
      
      if (error) {
        logger.error("Edge function error", "Users", { error: error.message });
        throw new Error(
          error.message?.includes("non-2xx")
            ? "Erro de comunicação com o servidor. Tente novamente."
            : error.message || "Erro desconhecido ao criar usuário"
        );
      }
      
      if (result?.error) {
        const errorMessage = translateErrorMessage(result.error);
        throw new Error(errorMessage);
      }
      
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
      toast({ title: "Usuário criado com sucesso" });
      setIsCreateUserOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar usuário",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const translateErrorMessage = (error: string): string => {
    const errorMap: Record<string, string> = {
      "User already registered": "Este email já está cadastrado no sistema",
      "Email already exists": "Este email já está em uso",
      "Password should be at least 6 characters": "A senha deve ter pelo menos 6 caracteres",
      "Invalid email": "Email inválido",
      "Missing required fields": "Preencha todos os campos obrigatórios",
      "Only admins can create users": "Apenas administradores podem criar usuários",
      "Unauthorized": "Você não tem permissão para esta ação",
      "No authorization header": "Sessão expirada. Faça login novamente.",
      "Failed to create user profile": "Erro ao criar perfil do usuário. Tente novamente.",
    };
    
    for (const [key, value] of Object.entries(errorMap)) {
      if (error.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    
    return error || "Erro desconhecido";
  };

  const handleCreateUser = (data: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    roles: string[];
  }) => {
    createUserMutation.mutate(data);
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { data, error } = await supabase.functions.invoke("reset-password", {
        body: { user_id: userId, new_password: password },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Senha redefinida com sucesso" });
      setIsResetPasswordOpen(false);
      setResetPasswordUser(null);
      setNewPassword("");
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao redefinir senha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleOpenResetPassword = (user: ProfileWithRoles) => {
    setResetPasswordUser(user);
    setNewPassword("");
    setIsResetPasswordOpen(true);
  };

  const handleResetPassword = () => {
    if (resetPasswordUser && newPassword) {
      resetPasswordMutation.mutate({ userId: resetPasswordUser.user_id, password: newPassword });
    }
  };

  const handleLinkClient = () => {
    if (linkClientUser && selectedClientId) {
      linkClientMutation.mutate({
        userId: linkClientUser.user_id,
        clientId: selectedClientId,
        userName: linkClientUser.full_name || linkClientUser.email || "",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gestão de Usuários</CardTitle>
        <CardDescription>
          Gerencie usuários e seus papéis no sistema
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar usuários..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 text-base"
            />
          </div>
          <PermissionGate module="users" action="create">
            <Button onClick={() => setIsCreateUserOpen(true)} className="w-full sm:w-auto">
              <UserPlus className="mr-2 h-4 w-4" />
              Novo Usuário
            </Button>
          </PermissionGate>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Papéis</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-40 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-6 w-16 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="flex gap-1"><div className="h-6 w-16 bg-muted animate-pulse rounded" /></div></TableCell>
                    <TableCell className="text-right"><div className="h-8 w-28 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const isConfirmed = confirmationStatus[user.user_id] ?? true;
                  return (
                    <TableRow key={user.id}>
                      <TableCell
                        className="font-medium cursor-pointer hover:underline hover:text-primary transition-colors"
                        onClick={() => can("users", "edit") && setEditProfileUser(user)}
                      >
                        {user.full_name}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {isConfirmed ? (
                          <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                            <UserCheck className="mr-1 h-3 w-3" />
                            Ativo
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
                                  <Clock className="mr-1 h-3 w-3" />
                                  Pendente
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Aguardando confirmação de email</TooltipContent>
                            </Tooltip>
                            <PermissionGate module="users" action="edit">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => confirmEmailMutation.mutate(user.user_id)}
                                disabled={confirmEmailMutation.isPending}
                              >
                                {confirmEmailMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <UserCheck className="mr-1 h-3 w-3" />
                                    Ativar
                                  </>
                                )}
                              </Button>
                            </PermissionGate>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.user_roles.map((r, i) => (
                            <Badge
                              key={i}
                              className={`${roleColors[r.role]} ${can("users", "edit") ? "cursor-pointer" : ""}`}
                              onClick={() => can("users", "edit") && handleRemoveRole(user.user_id, r.role)}
                            >
                              {roleLabels[r.role]}
                              {can("users", "edit") && <Trash2 className="ml-1 h-3 w-3" />}
                            </Badge>
                          ))}
                          {user.user_roles.length === 0 && (
                            <span className="text-sm text-muted-foreground">Sem papéis</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <PermissionGate module="users" action="edit">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setEditProfileUser(user)}
                                  aria-label="Editar perfil"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar Perfil</TooltipContent>
                            </Tooltip>
                          </PermissionGate>
                          <PermissionGate module="users" action="edit">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setIsRoleDialogOpen(true);
                                  }}
                                  aria-label="Gerenciar papéis"
                                >
                                  <Shield className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Papéis</TooltipContent>
                            </Tooltip>
                          </PermissionGate>
                          <PermissionGate module="users" action="edit">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleOpenResetPassword(user)}
                                  aria-label="Redefinir senha"
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Senha</TooltipContent>
                            </Tooltip>
                          </PermissionGate>
                          <PermissionGate module="users" action="edit">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setLinkClientUser(user);
                                    setSelectedClientId("");
                                  }}
                                  aria-label="Vincular empresa"
                                >
                                  <Building2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Vincular Empresa</TooltipContent>
                            </Tooltip>
                          </PermissionGate>
                          <PermissionGate module="users" action="delete">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteConfirmUser(user)}
                                  aria-label="Excluir usuário"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Excluir</TooltipContent>
                            </Tooltip>
                          </PermissionGate>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Role Dialog */}
        <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Papel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Adicionar papel para: <strong>{selectedUser?.full_name}</strong>
              </p>
              <Select onValueChange={handleAddRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um papel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="technician">Técnico</SelectItem>
                  <SelectItem value="financial">Financeiro</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                  <SelectItem value="client_master">Cliente Master</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogContent>
        </Dialog>

        <UserForm
          open={isCreateUserOpen}
          onOpenChange={setIsCreateUserOpen}
          onSubmit={handleCreateUser}
          isLoading={createUserMutation.isPending}
        />

        {/* Reset Password Dialog */}
        <Dialog open={isResetPasswordOpen} onOpenChange={setIsResetPasswordOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Redefinir Senha</DialogTitle>
              <DialogDescription>
                Definir nova senha para: <strong>{resetPasswordUser?.full_name}</strong>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResetPasswordOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleResetPassword}
                disabled={newPassword.length < 6 || resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Redefinir Senha
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete User Confirm */}
        <ConfirmDialog
          open={!!deleteConfirmUser}
          onOpenChange={(open) => !open && setDeleteConfirmUser(null)}
          title="Excluir Usuário"
          description={`Tem certeza que deseja excluir o usuário "${deleteConfirmUser?.full_name}"? Esta ação é irreversível e removerá todos os dados associados.`}
          confirmLabel="Excluir"
          variant="destructive"
          onConfirm={() => deleteConfirmUser && deleteUserMutation.mutate(deleteConfirmUser.user_id)}
          isLoading={deleteUserMutation.isPending}
        />

        {/* Link Client Dialog */}
        <Dialog open={!!linkClientUser} onOpenChange={(open) => !open && setLinkClientUser(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Vincular Empresa</DialogTitle>
              <DialogDescription>
                Vincular <strong>{linkClientUser?.full_name}</strong> a uma empresa
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="client-select">Empresa</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkClientUser(null)}>
                Cancelar
              </Button>
              <Button
                onClick={handleLinkClient}
                disabled={!selectedClientId || linkClientMutation.isPending}
              >
                {linkClientMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Vincular
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* User Profile Edit Sheet */}
        <UserProfileSheet
          userId={editProfileUser?.user_id ?? null}
          userRoles={editProfileUser?.user_roles.map(r => r.role)}
          open={!!editProfileUser}
          onOpenChange={(open) => !open && setEditProfileUser(null)}
        />
      </CardContent>
    </Card>
  );
}
