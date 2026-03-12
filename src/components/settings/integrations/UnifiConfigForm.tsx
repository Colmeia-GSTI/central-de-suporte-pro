import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Wifi, Plus, Trash2, RefreshCw, CheckCircle2, XCircle,
  Clock, Globe, Cloud, AlertTriangle, Loader2, Eye, EyeOff,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ControllerForm {
  name: string;
  client_id: string;
  connection_method: "direct" | "cloud";
  url: string;
  username: string;
  password: string;
  ddns_hostname: string;
  cloud_api_key: string;
  cloud_host_id: string;
  sync_interval_hours: number;
}

const EMPTY_FORM: ControllerForm = {
  name: "",
  client_id: "",
  connection_method: "direct",
  url: "",
  username: "",
  password: "",
  ddns_hostname: "",
  cloud_api_key: "",
  cloud_host_id: "",
  sync_interval_hours: 6,
};

export function UnifiConfigForm() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ControllerForm>({ ...EMPTY_FORM });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; hosts?: any[]; sites?: any[] } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);

  // Fetch controllers
  const { data: controllers, isLoading } = useQuery({
    queryKey: ["unifi-controllers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unifi_controllers")
        .select("id, name, client_id, connection_method, url, ddns_hostname, cloud_host_id, is_active, sync_interval_hours, last_sync_at, last_error, created_at, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch clients for selector
  const { data: clients } = useQuery({
    queryKey: ["clients-list-simple"],
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

  // Save controller
  const saveMutation = useMutation({
    mutationFn: async (data: ControllerForm) => {
      const payload: Record<string, unknown> = {
        name: data.name,
        client_id: data.client_id,
        connection_method: data.connection_method,
        sync_interval_hours: data.sync_interval_hours,
        is_active: true,
      };

      if (data.connection_method === "direct") {
        payload.url = data.url;
        payload.username = data.username;
        payload.password_encrypted = data.password;
        payload.ddns_hostname = data.ddns_hostname || null;
      } else {
        payload.cloud_api_key_encrypted = data.cloud_api_key;
        payload.cloud_host_id = data.cloud_host_id || null;
      }

      const { error } = await supabase.from("unifi_controllers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Controller cadastrado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["unifi-controllers"] });
      setShowForm(false);
      setForm({ ...EMPTY_FORM });
      setTestResult(null);
    },
    onError: (err: Error) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  // Delete controller
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("unifi_controllers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Controller removido");
      queryClient.invalidateQueries({ queryKey: ["unifi-controllers"] });
    },
    onError: (err: Error) => {
      toast.error(`Erro ao remover: ${err.message}`);
    },
  });

  // Toggle active
  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("unifi_controllers").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unifi-controllers"] });
    },
  });

  // Test connection
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("unifi-sync", {
        body: {
          action: "test",
          connection_method: form.connection_method,
          url: form.url,
          username: form.username,
          password: form.password,
          cloud_api_key: form.cloud_api_key,
        },
      });

      if (error) throw error;
      if (data.error) {
        setTestResult({ success: false, message: data.error });
        toast.error(data.error);
      } else {
        setTestResult({
          success: true,
          message: data.message,
          hosts: data.hosts,
          sites: data.sites,
        });
        toast.success(data.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      setTestResult({ success: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  }

  // Manual sync
  async function handleSync(controllerId: string) {
    setSyncing(controllerId);
    try {
      const { data, error } = await supabase.functions.invoke("unifi-sync", {
        body: { action: "sync", controller_id: controllerId },
      });
      if (error) throw error;
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`Sincronização concluída: ${data.total_devices || 0} devices, ${data.total_alerts || 0} alertas`);
        queryClient.invalidateQueries({ queryKey: ["unifi-controllers"] });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao sincronizar";
      toast.error(msg);
    } finally {
      setSyncing(null);
    }
  }

  const canSave = form.name && form.client_id && (
    (form.connection_method === "direct" && form.url && form.username && form.password) ||
    (form.connection_method === "cloud" && form.cloud_api_key)
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>UniFi</CardTitle>
              <CardDescription>Integração com Ubiquiti UniFi Dream Machine</CardDescription>
            </div>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Adicionar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Form */}
        {showForm && (
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ctrl-name">Nome do Controller</Label>
                  <Input
                    id="ctrl-name"
                    placeholder="UDM Pro - Cliente XYZ"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ctrl-client">Cliente</Label>
                  <Select value={form.client_id} onValueChange={(v) => setForm({ ...form, client_id: v })}>
                    <SelectTrigger id="ctrl-client"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {clients?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Connection method */}
              <div className="space-y-3">
                <Label>Método de Conexão</Label>
                <RadioGroup
                  value={form.connection_method}
                  onValueChange={(v) => setForm({ ...form, connection_method: v as "direct" | "cloud" })}
                  className="grid grid-cols-2 gap-3"
                >
                  <Label
                    htmlFor="method-direct"
                    className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${form.connection_method === "direct" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <RadioGroupItem value="direct" id="method-direct" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4" />
                        <span className="font-medium">IP Direto</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Conexão local via IP fixo ou DDNS. Suporta alarmes e topologia LLDP.
                      </p>
                    </div>
                  </Label>
                  <Label
                    htmlFor="method-cloud"
                    className={`flex items-center gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${form.connection_method === "cloud" ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  >
                    <RadioGroupItem value="cloud" id="method-cloud" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4" />
                        <span className="font-medium">UniFi Portal</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Via API Key do Site Manager. Sem alarmes nem topologia.
                      </p>
                    </div>
                  </Label>
                </RadioGroup>
              </div>

              {/* Direct fields */}
              {form.connection_method === "direct" && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ctrl-url">URL do UDM</Label>
                      <Input
                        id="ctrl-url"
                        placeholder="https://192.168.1.1 ou https://meusite.ddns.net"
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ctrl-ddns">Hostname DDNS (opcional)</Label>
                      <Input
                        id="ctrl-ddns"
                        placeholder="cliente.ddns.net"
                        value={form.ddns_hostname}
                        onChange={(e) => setForm({ ...form, ddns_hostname: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ctrl-user">Usuário</Label>
                      <Input
                        id="ctrl-user"
                        placeholder="admin-readonly"
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ctrl-pass">Senha</Label>
                      <div className="relative">
                        <Input
                          id="ctrl-pass"
                          type={showPassword ? "text" : "password"}
                          value={form.password}
                          onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    <p className="font-medium mb-1">💡 Clientes sem IP fixo?</p>
                    <p>Configure DDNS no UDM: Settings → Internet → WAN → Dynamic DNS.
                      Use o hostname (ex: <code>cliente.ddns.net</code>) como URL.</p>
                  </div>
                </div>
              )}

              {/* Cloud fields */}
              {form.connection_method === "cloud" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ctrl-apikey">API Key do Site Manager</Label>
                    <div className="relative">
                      <Input
                        id="ctrl-apikey"
                        type={showPassword ? "text" : "password"}
                        placeholder="Gere em unifi.ui.com → Settings → API Keys"
                        value={form.cloud_api_key}
                        onChange={(e) => setForm({ ...form, cloud_api_key: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Ocultar chave" : "Mostrar chave"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {testResult?.hosts && testResult.hosts.length > 0 && (
                    <div className="space-y-2">
                      <Label>Selecionar Host</Label>
                      <Select
                        value={form.cloud_host_id}
                        onValueChange={(v) => setForm({ ...form, cloud_host_id: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione o host..." /></SelectTrigger>
                        <SelectContent>
                          {testResult.hosts.map((h) => (
                            <SelectItem key={h.id} value={h.id}>
                              {h.name} ({h.model})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-start gap-2 rounded-lg bg-accent/50 p-3 text-xs">
                    <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                    <p>A conexão via Portal UniFi não suporta coleta de alarmes nem topologia LLDP. Para monitoramento completo, use conexão direta.</p>
                  </div>
                </div>
              )}

              <Separator />

              {/* Sync interval */}
              <div className="space-y-2">
                <Label>Frequência de Sincronização</Label>
                <RadioGroup
                  value={form.sync_interval_hours.toString()}
                  onValueChange={(v) => setForm({ ...form, sync_interval_hours: parseInt(v) })}
                  className="flex gap-4"
                >
                  {[3, 6, 12].map((h) => (
                    <Label key={h} htmlFor={`interval-${h}`} className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value={h.toString()} id={`interval-${h}`} />
                      <span>{h}h</span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Test result */}
              {testResult && (
                <div className={`rounded-lg p-3 text-sm flex items-center gap-2 ${testResult.success ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                  {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {testResult.message}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); setTestResult(null); }}>
                  Cancelar
                </Button>
                <Button variant="secondary" onClick={handleTest} disabled={testing}>
                  {testing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wifi className="h-4 w-4 mr-1" />}
                  Testar Conexão
                </Button>
                <Button onClick={() => saveMutation.mutate(form)} disabled={!canSave || saveMutation.isPending}>
                  {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Controllers list */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : controllers && controllers.length > 0 ? (
          <div className="space-y-3">
            {controllers.map((ctrl) => {
              const clientName = (ctrl as any).clients?.name || "—";
              return (
                <div key={ctrl.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-primary" />
                      <span className="font-medium">{ctrl.name}</span>
                      <Badge variant={ctrl.connection_method === "direct" ? "default" : "secondary"} className="text-xs">
                        {ctrl.connection_method === "direct" ? "IP Direto" : "Cloud"}
                      </Badge>
                      {ctrl.last_error && (
                        <Badge variant="destructive" className="text-xs">Erro</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch
                        checked={ctrl.is_active}
                        onCheckedChange={(v) => toggleMutation.mutate({ id: ctrl.id, is_active: v })}
                        aria-label="Ativar/Desativar"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSync(ctrl.id)}
                        disabled={syncing === ctrl.id || !ctrl.is_active}
                        aria-label="Sincronizar agora"
                      >
                        {syncing === ctrl.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Remover controller">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover controller?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação removerá o controller "{ctrl.name}", seus sites e topologia associados. Devices já sincronizados serão mantidos.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(ctrl.id)}>
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Cliente: {clientName}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> A cada {ctrl.sync_interval_hours}h
                    </span>
                    {ctrl.last_sync_at && (
                      <span>
                        Último sync: {formatDistanceToNow(new Date(ctrl.last_sync_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                    {ctrl.url && <span>{ctrl.url}</span>}
                  </div>

                  {ctrl.last_error && (
                    <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{ctrl.last_error}</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Wifi className="h-10 w-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum controller UniFi cadastrado</p>
            <p className="text-xs text-muted-foreground">Clique em "Adicionar" para conectar um UDM</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
