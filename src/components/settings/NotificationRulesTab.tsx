import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Trash2, Bell, Clock, Users } from "lucide-react";
import { toast } from "sonner";

interface NotificationRule {
  id: string;
  client_id: string;
  user_id: string;
  notify_on_critical: boolean;
  notify_on_warning: boolean;
  notify_on_info: boolean;
  notify_email: boolean;
  notify_push: boolean;
  clients?: { name: string };
  profiles?: { full_name: string; email: string };
}

interface EscalationSetting {
  id: string;
  client_id: string | null;
  escalation_minutes: number;
  escalate_to_role: string;
  is_active: boolean;
  clients?: { name: string } | null;
}

export function NotificationRulesTab() {
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [isEscalationDialogOpen, setIsEscalationDialogOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [escalationMinutes, setEscalationMinutes] = useState(30);
  const [escalationRole, setEscalationRole] = useState("manager");
  const [escalationClientId, setEscalationClientId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["staff-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");
      if (error) throw error;
      return data;
    },
  });

  const { data: rules = [], isLoading: loadingRules } = useQuery({
    queryKey: ["notification-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_notification_rules")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Get user profiles for each rule
      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      
      return data.map((rule) => ({
        ...rule,
        profiles: profiles?.find((p) => p.user_id === rule.user_id),
      })) as NotificationRule[];
    },
  });

  const { data: escalationSettings = [], isLoading: loadingEscalation } = useQuery({
    queryKey: ["escalation-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_escalation_settings")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as EscalationSetting[];
    },
  });

  const addRuleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("client_notification_rules")
        .insert({
          client_id: selectedClient,
          user_id: selectedUser,
          notify_on_critical: true,
          notify_on_warning: true,
          notify_on_info: false,
          notify_email: true,
          notify_push: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      setIsRuleDialogOpen(false);
      setSelectedClient("");
      setSelectedUser("");
      toast.success("Regra de notificação criada");
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Erro ao criar regra");
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: boolean }) => {
      const { error } = await supabase
        .from("client_notification_rules")
        .update({ [field]: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_notification_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      toast.success("Regra removida");
    },
  });

  const addEscalationMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("alert_escalation_settings")
        .insert({
          client_id: escalationClientId || null,
          escalation_minutes: escalationMinutes,
          escalate_to_role: escalationRole,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-settings"] });
      setIsEscalationDialogOpen(false);
      setEscalationMinutes(30);
      setEscalationRole("manager");
      setEscalationClientId(null);
      toast.success("Configuração de escalonamento criada");
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error) || "Erro ao criar configuração");
    },
  });

  const toggleEscalationMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("alert_escalation_settings")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-settings"] });
    },
  });

  const deleteEscalationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("alert_escalation_settings")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["escalation-settings"] });
      toast.success("Configuração removida");
    },
  });

  return (
    <div className="space-y-6">
      {/* Notification Rules Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Regras de Notificação por Cliente
              </CardTitle>
              <CardDescription>
                Configure quem recebe alertas de cada cliente
              </CardDescription>
            </div>
            <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Regra
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Regra de Notificação</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    <Select value={selectedClient} onValueChange={setSelectedClient}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um cliente" />
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
                  <div className="space-y-2">
                    <Label>Usuário</Label>
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um usuário" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((user) => (
                          <SelectItem key={user.user_id} value={user.user_id}>
                            {user.full_name} ({user.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => addRuleMutation.mutate()}
                    disabled={!selectedClient || !selectedUser || addRuleMutation.isPending}
                    className="w-full"
                  >
                    Criar Regra
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingRules ? (
            <p className="text-center text-muted-foreground py-4">Carregando...</p>
          ) : rules.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Nenhuma regra configurada. Quando não há regras, todos os técnicos recebem alertas.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="text-center">Crítico</TableHead>
                  <TableHead className="text-center">Aviso</TableHead>
                  <TableHead className="text-center">Info</TableHead>
                  <TableHead className="text-center">Email</TableHead>
                  <TableHead className="text-center">Push</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.clients?.name}</TableCell>
                    <TableCell>{rule.profiles?.full_name || rule.profiles?.email}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.notify_on_critical}
                        onCheckedChange={(checked) =>
                          updateRuleMutation.mutate({
                            id: rule.id,
                            field: "notify_on_critical",
                            value: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.notify_on_warning}
                        onCheckedChange={(checked) =>
                          updateRuleMutation.mutate({
                            id: rule.id,
                            field: "notify_on_warning",
                            value: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.notify_on_info}
                        onCheckedChange={(checked) =>
                          updateRuleMutation.mutate({
                            id: rule.id,
                            field: "notify_on_info",
                            value: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.notify_email}
                        onCheckedChange={(checked) =>
                          updateRuleMutation.mutate({
                            id: rule.id,
                            field: "notify_email",
                            value: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={rule.notify_push}
                        onCheckedChange={(checked) =>
                          updateRuleMutation.mutate({
                            id: rule.id,
                            field: "notify_push",
                            value: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteRuleMutation.mutate(rule.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Escalation Settings Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Configurações de Escalonamento
              </CardTitle>
              <CardDescription>
                Defina quando alertas não reconhecidos devem ser escalados para gerentes
              </CardDescription>
            </div>
            <Dialog open={isEscalationDialogOpen} onOpenChange={setIsEscalationDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Configuração
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova Configuração de Escalonamento</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Cliente (opcional - deixe vazio para padrão global)</Label>
                    <Select
                      value={escalationClientId || "global"}
                      onValueChange={(v) => setEscalationClientId(v === "global" ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Padrão Global" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="global">Padrão Global</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tempo para escalonamento (minutos)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={1440}
                      value={escalationMinutes}
                      onChange={(e) => setEscalationMinutes(parseInt(e.target.value) || 30)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Escalar para</Label>
                    <Select value={escalationRole} onValueChange={setEscalationRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Gerentes</SelectItem>
                        <SelectItem value="admin">Administradores</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => addEscalationMutation.mutate()}
                    disabled={addEscalationMutation.isPending}
                    className="w-full"
                  >
                    Criar Configuração
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loadingEscalation ? (
            <p className="text-center text-muted-foreground py-4">Carregando...</p>
          ) : escalationSettings.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              Nenhuma configuração de escalonamento. Alertas não serão escalados automaticamente.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tempo (min)</TableHead>
                  <TableHead>Escalar Para</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {escalationSettings.map((setting) => (
                  <TableRow key={setting.id}>
                    <TableCell className="font-medium">
                      {setting.clients?.name || "Padrão Global"}
                    </TableCell>
                    <TableCell>{setting.escalation_minutes} min</TableCell>
                    <TableCell className="capitalize">{setting.escalate_to_role}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={setting.is_active}
                        onCheckedChange={(checked) =>
                          toggleEscalationMutation.mutate({
                            id: setting.id,
                            is_active: checked,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteEscalationMutation.mutate(setting.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
