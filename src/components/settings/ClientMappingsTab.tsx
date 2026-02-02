import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Link2, Loader2, Plus, Trash2, RefreshCw, Monitor, Play, Zap, Save, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Client {
  id: string;
  name: string;
}

interface ExternalClient {
  id: string;
  name: string;
}

interface ClientMapping {
  id: string;
  client_id: string;
  external_source: string;
  external_id: string;
  external_name: string | null;
  created_at: string;
  client?: {
    name: string;
  };
}

// Normalize string for comparison (remove accents, special chars, lowercase)
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .substring(0, 10);
}

// Suggest match based on name similarity
function suggestMatch(systemName: string, externalClients: ExternalClient[]): ExternalClient | undefined {
  const normalizedSystem = normalizeString(systemName);
  
  return externalClients.find(ec => {
    const normalizedExternal = normalizeString(ec.name);
    return normalizedExternal.includes(normalizedSystem) ||
           normalizedSystem.includes(normalizedExternal);
  });
}

// Cache helpers
const CACHE_KEY = "external_clients_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

interface CacheEntry {
  data: ExternalClient[];
  timestamp: number;
}

interface CacheData {
  tactical_rmm?: CacheEntry;
  checkmk?: CacheEntry;
}

function loadCacheFromStorage(): { tactical_rmm: ExternalClient[]; checkmk: ExternalClient[] } {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return { tactical_rmm: [], checkmk: [] };
    
    const parsed: CacheData = JSON.parse(cached);
    const now = Date.now();
    
    return {
      tactical_rmm: parsed.tactical_rmm && (now - parsed.tactical_rmm.timestamp < CACHE_TTL_MS) 
        ? parsed.tactical_rmm.data 
        : [],
      checkmk: parsed.checkmk && (now - parsed.checkmk.timestamp < CACHE_TTL_MS) 
        ? parsed.checkmk.data 
        : [],
    };
  } catch {
    return { tactical_rmm: [], checkmk: [] };
  }
}

function saveCacheToStorage(source: "tactical_rmm" | "checkmk", data: ExternalClient[]) {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    const existing: CacheData = cached ? JSON.parse(cached) : {};
    
    existing[source] = {
      data,
      timestamp: Date.now(),
    };
    
    localStorage.setItem(CACHE_KEY, JSON.stringify(existing));
  } catch {
    // Storage quota exceeded or unavailable - silently ignore
  }
}

export function ClientMappingsTab() {
  const navigate = useNavigate();
  const [mappings, setMappings] = useState<ClientMapping[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [deviceCounts, setDeviceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkMappings, setBulkMappings] = useState<Record<string, string>>({});
  const [savingBulk, setSavingBulk] = useState(false);
  
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [selectedExternalClient, setSelectedExternalClient] = useState<string>("");
  const [selectedSource, setSelectedSource] = useState<string>("tactical_rmm");

  // Cache de clientes externos por fonte - inicializa do localStorage
  const [externalClientsCache, setExternalClientsCache] = useState<{
    tactical_rmm: ExternalClient[];
    checkmk: ExternalClient[];
  }>(() => loadCacheFromStorage());

  const [loadingExternal, setLoadingExternal] = useState({
    tactical_rmm: false,
    checkmk: false,
  });

  // Clientes externos derivados da fonte selecionada
  const externalClients = (selectedSource === "tactical_rmm" || selectedSource === "checkmk") 
    ? externalClientsCache[selectedSource] || [] 
    : [];
  const isLoadingExternal = (selectedSource === "tactical_rmm" || selectedSource === "checkmk")
    ? loadingExternal[selectedSource] || false
    : false;

  // Memoized set of mapped external IDs for current source
  const mappedExternalIds = useMemo(() => {
    return new Set(
      mappings
        .filter(m => m.external_source === selectedSource)
        .map(m => m.external_id)
    );
  }, [mappings, selectedSource]);

  // Clients that don't have a mapping for current source
  const unmappedClients = useMemo(() => {
    return clients.filter(c => 
      !mappings.some(m => m.client_id === c.id && m.external_source === selectedSource)
    );
  }, [clients, mappings, selectedSource]);

  // Buscar clientes de uma fonte e salvar no cache
  const fetchAndCacheSource = async (source: "tactical_rmm" | "checkmk") => {
    const functionName = source === "tactical_rmm" ? "tactical-rmm-sync" : "checkmk-sync";
    
    setLoadingExternal(prev => ({ ...prev, [source]: true }));
    try {
      const { data } = await supabase.functions.invoke(functionName, {
        body: { action: source === "checkmk" ? "list_folders" : "list_clients" },
      });
      if (data?.clients) {
        setExternalClientsCache(prev => ({ ...prev, [source]: data.clients }));
        saveCacheToStorage(source, data.clients);
      }
    } catch {
      // Source not configured - silently ignore
    } finally {
      setLoadingExternal(prev => ({ ...prev, [source]: false }));
    }
  };

  // Pré-carregar clientes externos de ambas as fontes ao montar
  // Se já temos cache válido, apenas atualiza em background sem loading
  const preloadExternalClients = async () => {
    const cachedData = loadCacheFromStorage();
    
    // Se não tem cache, mostra loading. Se tem, atualiza silenciosamente.
    if (cachedData.tactical_rmm.length === 0) {
      await fetchAndCacheSource("tactical_rmm");
    } else {
      fetchAndCacheSource("tactical_rmm");
    }
    
    if (cachedData.checkmk.length === 0) {
      await fetchAndCacheSource("checkmk");
    } else {
      fetchAndCacheSource("checkmk");
    }
  };

  useEffect(() => {
    loadData();
    preloadExternalClients();
  }, []);

  // Pre-fill bulk mappings with suggestions when external clients are loaded
  useEffect(() => {
    if (bulkMode && externalClients.length > 0) {
      const suggestions: Record<string, string> = {};
      unmappedClients.forEach(client => {
        const suggestion = suggestMatch(client.name, externalClients);
        if (suggestion && !mappedExternalIds.has(suggestion.id)) {
          // Check if this external client is not already suggested for another system client
          const alreadySuggested = Object.values(suggestions).includes(suggestion.id);
          if (!alreadySuggested) {
            suggestions[client.id] = suggestion.id;
          }
        }
      });
      setBulkMappings(suggestions);
    }
  }, [bulkMode, externalClients, unmappedClients, mappedExternalIds]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load mappings
      const { data: mappingsData } = await supabase
        .from("client_external_mappings")
        .select("*, client:clients(name)")
        .order("created_at", { ascending: false });

      // Load internal clients
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      // Load device counts per client
      const { data: devicesData } = await supabase
        .from("monitored_devices")
        .select("client_id")
        .not("client_id", "is", null);

      const counts: Record<string, number> = {};
      (devicesData || []).forEach((d: any) => {
        counts[d.client_id] = (counts[d.client_id] || 0) + 1;
      });

      setMappings(mappingsData || []);
      setClients(clientsData || []);
      setDeviceCounts(counts);
    } catch {
      // Error loading data - will show empty state
    } finally {
      setLoading(false);
    }
  };

  // Atualizar clientes de uma fonte específica (com feedback visual)
  const refreshExternalClients = async (source: string) => {
    const sourceKey = source as "tactical_rmm" | "checkmk";
    setLoadingExternal(prev => ({ ...prev, [source]: true }));
    try {
      const functionName = source === "tactical_rmm" 
        ? "tactical-rmm-sync" 
        : "checkmk-sync";

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { action: source === "checkmk" ? "list_folders" : "list_clients" },
      });

      if (error || data?.error) {
        toast.error(data?.error || "Erro ao buscar clientes externos");
        return;
      }

      setExternalClientsCache(prev => ({ ...prev, [source]: data.clients || [] }));
      saveCacheToStorage(sourceKey, data.clients || []);
      toast.success(`${data.clients?.length || 0} clientes carregados`);
    } catch (error: any) {
      toast.error("Erro: " + error.message);
    } finally {
      setLoadingExternal(prev => ({ ...prev, [source]: false }));
    }
  };

  const handleSync = async () => {
    if (mappings.length === 0) {
      toast.error("Nenhum mapeamento configurado");
      return;
    }

    setSyncing(true);
    try {
      // Sync both sources
      const results = await Promise.allSettled([
        supabase.functions.invoke("tactical-rmm-sync", { body: { action: "sync" } }),
        supabase.functions.invoke("checkmk-sync", { body: { action: "sync" } }),
      ]);

      let totalCreated = 0;
      let totalSynced = 0;
      let totalUnmapped = 0;
      const errors: string[] = [];

      results.forEach((result, idx) => {
        const source = idx === 0 ? "Tactical RMM" : "CheckMK";
        if (result.status === "fulfilled" && result.value.data) {
          const d = result.value.data;
        if (d.error) {
            // Integration might not be configured - not an error
          } else {
            totalCreated += d.created || 0;
            totalSynced += d.synced || 0;
            totalUnmapped += d.unmapped || 0;
          }
        } else if (result.status === "rejected") {
          errors.push(source);
        }
      });

      if (totalCreated > 0 || totalSynced > 0) {
        toast.success(`Sincronizado! ${totalCreated} criados, ${totalSynced} atualizados${totalUnmapped > 0 ? `, ${totalUnmapped} sem mapeamento` : ""}`);
      } else if (errors.length > 0) {
        toast.error(`Erro ao sincronizar: ${errors.join(", ")}`);
      } else {
        toast.info("Nenhum dispositivo para sincronizar");
      }

      // Reload device counts
      loadData();
    } catch (error: any) {
      toast.error("Erro na sincronização: " + error.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleAddMapping = async () => {
    if (!selectedClient || !selectedExternalClient) {
      toast.error("Selecione ambos os clientes");
      return;
    }

    setSaving(true);
    try {
      const externalClient = externalClients.find(c => c.id === selectedExternalClient);
      
      const { error } = await supabase
        .from("client_external_mappings")
        .insert({
          client_id: selectedClient,
          external_source: selectedSource,
          external_id: selectedExternalClient,
          external_name: externalClient?.name || null,
        });

      if (error) {
        if (error.code === "23505") {
          toast.error("Este cliente externo já está mapeado");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Mapeamento criado! Sincronizando dispositivos...");
      setDialogOpen(false);
      setSelectedClient("");
      setSelectedExternalClient("");
      
      // Sincronizar automaticamente após criar mapeamento
      const functionName = selectedSource === "tactical_rmm" 
        ? "tactical-rmm-sync" 
        : "checkmk-sync";
      
      const { data: syncData } = await supabase.functions.invoke(functionName, {
        body: { action: "sync" },
      });
      
      if (syncData?.created || syncData?.synced) {
        toast.success(`${syncData.created || 0} dispositivos vinculados, ${syncData.synced || 0} atualizados`);
      }
      
      loadData();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBulk = async () => {
    const toSave = Object.entries(bulkMappings).filter(([_, extId]) => extId);
    if (toSave.length === 0) {
      toast.error("Nenhum mapeamento selecionado");
      return;
    }

    setSavingBulk(true);
    try {
      const insertData = toSave.map(([clientId, externalId]) => ({
        client_id: clientId,
        external_source: selectedSource,
        external_id: externalId,
        external_name: externalClients.find(e => e.id === externalId)?.name || null,
      }));

      const { error } = await supabase
        .from("client_external_mappings")
        .insert(insertData);

      if (error) throw error;

      toast.success(`${insertData.length} mapeamentos criados! Sincronizando...`);
      
      // Sincronizar automaticamente após criar mapeamentos em massa
      const functionName = selectedSource === "tactical_rmm" 
        ? "tactical-rmm-sync" 
        : "checkmk-sync";
      
      const { data: syncData } = await supabase.functions.invoke(functionName, {
        body: { action: "sync" },
      });
      
      if (syncData?.created || syncData?.synced) {
        toast.success(`${syncData.created || 0} dispositivos vinculados, ${syncData.synced || 0} atualizados`);
      }
      
      setDialogOpen(false);
      setBulkMode(false);
      setBulkMappings({});
      loadData();
    } catch (error: any) {
      toast.error("Erro ao salvar: " + error.message);
    } finally {
      setSavingBulk(false);
    }
  };

  const handleDeleteMapping = async (id: string) => {
    try {
      const { error } = await supabase
        .from("client_external_mappings")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Mapeamento removido");
      loadData();
    } catch (error: any) {
      toast.error("Erro ao remover: " + error.message);
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "tactical_rmm":
        return "Tactical RMM";
      case "checkmk":
        return "CheckMK";
      default:
        return source;
    }
  };

  const getSourceBadgeVariant = (source: string): "default" | "secondary" => {
    return source === "tactical_rmm" ? "default" : "secondary";
  };

  const pendingCount = externalClients.length > 0 
    ? externalClients.filter(e => !mappedExternalIds.has(e.id)).length 
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Mapeamento de Clientes
                <div className="flex gap-2">
                  <Badge variant="outline">
                    {mappings.length} mapeados
                  </Badge>
                  {pendingCount > 0 && (
                    <Badge variant="secondary">
                      {pendingCount} pendentes
                    </Badge>
                  )}
                </div>
              </CardTitle>
              <CardDescription>
                Vincule clientes do sistema com clientes externos (Tactical RMM, CheckMK)
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleSync} 
              disabled={syncing || mappings.length === 0}
              title="Sincronizar dispositivos"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">Sincronizar</span>
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setBulkMode(false);
                setBulkMappings({});
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" onClick={() => setBulkMode(true)}>
                  <Zap className="h-4 w-4 mr-2" />
                  Modo Rápido
                </Button>
              </DialogTrigger>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => setBulkMode(false)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo
                </Button>
              </DialogTrigger>
              
              {bulkMode ? (
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Mapeamento Rápido</DialogTitle>
                    <DialogDescription>
                      Vincule vários clientes de uma vez. Sugestões automáticas destacadas em amarelo.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-4 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <label className="text-sm font-medium">Sistema Externo</label>
                        <Select value={selectedSource} onValueChange={(v) => {
                          setSelectedSource(v);
                          setBulkMappings({});
                        }}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="tactical_rmm">
                              Tactical RMM
                              {loadingExternal.tactical_rmm && <Loader2 className="h-3 w-3 animate-spin ml-2 inline" />}
                              {!loadingExternal.tactical_rmm && externalClientsCache.tactical_rmm.length > 0 && (
                                <span className="text-muted-foreground ml-1">({externalClientsCache.tactical_rmm.length})</span>
                              )}
                            </SelectItem>
                            <SelectItem value="uptime_kuma">
                              Uptime Kuma
                              {loadingExternal.uptime_kuma && <Loader2 className="h-3 w-3 animate-spin ml-2 inline" />}
                              {!loadingExternal.uptime_kuma && externalClientsCache.uptime_kuma.length > 0 && (
                                <span className="text-muted-foreground ml-1">({externalClientsCache.uptime_kuma.length})</span>
                              )}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => refreshExternalClients(selectedSource)} 
                        disabled={isLoadingExternal}
                        className="mt-6"
                        title="Atualizar lista"
                      >
                        {isLoadingExternal ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    {isLoadingExternal ? (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                        Carregando clientes do {getSourceLabel(selectedSource)}...
                      </div>
                    ) : externalClients.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                        Nenhum cliente encontrado no {getSourceLabel(selectedSource)}
                      </div>
                    ) : unmappedClients.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Todos os clientes já estão mapeados para {getSourceLabel(selectedSource)}
                      </div>
                    ) : (
                      <>
                        <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                          {unmappedClients.map(client => {
                            const selectedValue = bulkMappings[client.id] || "";
                            const suggestion = suggestMatch(client.name, externalClients);
                            const isSuggested = selectedValue && suggestion?.id === selectedValue;
                            
                            return (
                              <div key={client.id} className="flex items-center gap-4 p-3">
                                <div className="flex-1 font-medium truncate" title={client.name}>
                                  {client.name}
                                </div>
                                <div className="flex-1">
                                  <Select 
                                    value={selectedValue} 
                                    onValueChange={(v) => setBulkMappings(prev => ({
                                      ...prev, 
                                      [client.id]: v === "none" ? "" : v
                                    }))}
                                  >
                                    <SelectTrigger className={isSuggested ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20" : ""}>
                                      <SelectValue placeholder="Selecionar..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="none">Nenhum</SelectItem>
                                      {externalClients.map(ec => {
                                        const alreadyMapped = mappedExternalIds.has(ec.id);
                                        const isCurrentSuggestion = suggestion?.id === ec.id;
                                        return (
                                          <SelectItem 
                                            key={ec.id} 
                                            value={ec.id}
                                            disabled={alreadyMapped}
                                            className={alreadyMapped ? "opacity-50" : ""}
                                          >
                                            {ec.name} {isCurrentSuggestion && "(sugerido)"} {alreadyMapped && "(já mapeado)"}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t">
                          <span className="text-sm text-muted-foreground">
                            {Object.values(bulkMappings).filter(Boolean).length} selecionados de {unmappedClients.length}
                          </span>
                          <Button 
                            onClick={handleSaveBulk} 
                            disabled={savingBulk || Object.values(bulkMappings).filter(Boolean).length === 0}
                          >
                            {savingBulk ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            Salvar Mapeamentos
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </DialogContent>
              ) : (
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Criar Mapeamento</DialogTitle>
                    <DialogDescription>
                      Vincule um cliente do sistema com um cliente externo
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Sistema Externo</label>
                      <Select value={selectedSource} onValueChange={(v) => {
                        setSelectedSource(v);
                        setSelectedExternalClient("");
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tactical_rmm">
                            Tactical RMM
                            {loadingExternal.tactical_rmm && <Loader2 className="h-3 w-3 animate-spin ml-2 inline" />}
                            {!loadingExternal.tactical_rmm && externalClientsCache.tactical_rmm.length > 0 && (
                              <span className="text-muted-foreground ml-1">({externalClientsCache.tactical_rmm.length})</span>
                            )}
                          </SelectItem>
                          <SelectItem value="uptime_kuma">
                            Uptime Kuma
                            {loadingExternal.uptime_kuma && <Loader2 className="h-3 w-3 animate-spin ml-2 inline" />}
                            {!loadingExternal.uptime_kuma && externalClientsCache.uptime_kuma.length > 0 && (
                              <span className="text-muted-foreground ml-1">({externalClientsCache.uptime_kuma.length})</span>
                            )}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Cliente do Sistema</label>
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
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium">Cliente Externo</label>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => refreshExternalClients(selectedSource)}
                          disabled={isLoadingExternal}
                          title="Atualizar lista"
                        >
                          {isLoadingExternal ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <Select 
                        value={selectedExternalClient} 
                        onValueChange={setSelectedExternalClient}
                        disabled={isLoadingExternal || externalClients.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            isLoadingExternal 
                              ? "Carregando..." 
                              : externalClients.length === 0 
                                ? "Nenhum cliente encontrado" 
                                : "Selecione um cliente"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {externalClients.map((client) => {
                            const alreadyMapped = mappedExternalIds.has(client.id);
                            return (
                              <SelectItem 
                                key={client.id} 
                                value={client.id}
                                disabled={alreadyMapped}
                                className={alreadyMapped ? "opacity-50" : ""}
                              >
                                {client.name} {alreadyMapped && "(já mapeado)"}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button 
                      className="w-full" 
                      onClick={handleAddMapping}
                      disabled={saving || !selectedClient || !selectedExternalClient}
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Link2 className="h-4 w-4 mr-2" />
                      )}
                      Criar Mapeamento
                    </Button>
                  </div>
                </DialogContent>
              )}
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente do Sistema</TableHead>
                <TableHead>Sistema Externo</TableHead>
                <TableHead>Cliente Externo</TableHead>
                <TableHead>Dispositivos</TableHead>
                <TableHead className="w-[80px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : mappings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum mapeamento configurado
                  </TableCell>
                </TableRow>
              ) : (
                mappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-medium">
                      {mapping.client_id ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => navigate(`/clients/${mapping.client_id}?tab=assets`)}
                              className="text-primary hover:underline text-left cursor-pointer transition-colors"
                            >
                              {mapping.client?.name || "-"}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Clique para ver ativos</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getSourceBadgeVariant(mapping.external_source)}>
                        <Monitor className="h-3 w-3 mr-1" />
                        {getSourceLabel(mapping.external_source)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {mapping.external_name || mapping.external_id}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => navigate(`/clients/${mapping.client_id}?tab=assets`)}
                            className="cursor-pointer transition-transform hover:scale-105"
                          >
                            <Badge variant="outline" className="font-mono hover:bg-accent">
                              <HardDrive className="h-3 w-3 mr-1" />
                              {deviceCounts[mapping.client_id] || 0}
                            </Badge>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Ver ativos do cliente</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMapping(mapping.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
