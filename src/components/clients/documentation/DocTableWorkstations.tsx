import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceBadge } from "./shared/SourceBadge";
import { StatusBadge } from "./shared/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Pencil, Trash2, Monitor, RefreshCw, Loader2, AlertTriangle } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocSync } from "@/hooks/useDocSync";
import { useClientBranchOptions } from "@/hooks/useClientBranchOptions";
import { display } from "@/lib/doc-utils";

const NONE_BRANCH = "__none__";

interface Props { clientId: string; }

const DEVICE_TYPES = [
  { value: "workstation", label: "Estação" },
  { value: "server", label: "Servidor" },
  { value: "notebook", label: "Notebook" },
];
const STATUSES = ["online", "offline", "overdue", "unknown"];
const DATA_SOURCES = ["Manual", "trmm", "trmm+manual"];

interface DeviceRow {
  id: string;
  name: string | null;
  device_type: string | null;
  brand_model: string | null;
  serial_number: string | null;
  os: string | null;
  ip_local: string | null;
  status: string | null;
  primary_user: string | null;
  physical_location: string | null;
  notes: string | null;
  cpu: string | null;
  ram: string | null;
  disks: string | null;
  mac_address: string | null;
  trmm_agent_id: string | null;
  data_source: string | null;
  last_seen: string | null;
  branch_id: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<DeviceRow, "id"> = {
  name: null, device_type: "workstation", brand_model: null, serial_number: null,
  os: null, ip_local: null, status: "unknown", primary_user: null,
  physical_location: null, notes: null, cpu: null, ram: null, disks: null,
  mac_address: null, trmm_agent_id: null, data_source: "Manual", last_seen: null,
  branch_id: null,
};


export function DocTableWorkstations({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<DeviceRow>({
    tableName: "doc_devices", clientId,
    filter: { column: "device_type", values: ["workstation", "server", "notebook"] },
  });
  const { syncingTrmm, trmmConfigured, syncTrmm } = useDocSync(clientId);
  const { options: branchOptions, isEmpty: noBranches } = useClientBranchOptions(clientId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DeviceRow | null>(null);
  const [form, setForm] = useState<Omit<DeviceRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: DeviceRow) => { setEditingItem(item); setForm({ ...EMPTY, ...item }); setDrawerOpen(true); };

  const handleSave = async () => {
    const saveData = { ...form };
    // If editing a synced item, mark as +manual
    if (editingItem) {
      const origSource = (editingItem.data_source || "").toLowerCase();
      if (origSource === "trmm") {
        saveData.data_source = "trmm+manual";
      }
      await update({ id: editingItem.id, ...saveData } as any);
    } else {
      await create(saveData as any);
    }
    setDrawerOpen(false);
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const typeLabel = (t: string | null) => DEVICE_TYPES.find(d => d.value === t)?.label || t || "—";

  // Detect hostname conflicts: manual devices with same hostname as TRMM devices
  const trmmNames = new Set(items.filter(i => i.trmm_agent_id).map(i => (i.name || "").toLowerCase()));
  const conflicts = items.filter(i => !i.trmm_agent_id && i.name && trmmNames.has(i.name.toLowerCase()));

  return (
    <div className="space-y-3">
      {/* Sync button and conflict banner */}
      <div className="flex flex-wrap items-center gap-2">
        {trmmConfigured && (
          <Button variant="outline" size="sm" onClick={syncTrmm} disabled={syncingTrmm} className="gap-1.5">
            {syncingTrmm ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar TRMM
          </Button>
        )}
      </div>

      {conflicts.length > 0 && (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            {conflicts.length} dispositivo(s) aguardando revisão de conflito — hostname duplicado com agentes do TRMM.
          </AlertDescription>
        </Alert>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Monitor className="h-8 w-8" /><p className="text-sm">Nenhum dispositivo cadastrado</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hostname</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>SO</TableHead>
              <TableHead>IP Local</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Origem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">{display(item.name)}</TableCell>
                      <TableCell>{typeLabel(item.device_type)}</TableCell>
                      <TableCell>{display(item.os)}</TableCell>
                      <TableCell className="font-mono text-xs">{display(item.ip_local)}</TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell><SourceBadge source={item.data_source} /></TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={6}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            <div><span className="text-xs text-muted-foreground">Marca/Modelo</span><p>{display(item.brand_model)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Nº Série</span><p>{display(item.serial_number)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Usuário</span><p>{display(item.primary_user)}</p></div>
                            <div><span className="text-xs text-muted-foreground">CPU</span><p>{display(item.cpu)}</p></div>
                            <div><span className="text-xs text-muted-foreground">RAM</span><p>{display(item.ram)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Disco(s)</span><p>{display(item.disks)}</p></div>
                            <div><span className="text-xs text-muted-foreground">MAC</span><p className="font-mono text-xs">{display(item.mac_address)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Localização</span><p>{display(item.physical_location)}</p></div>
                            {item.last_seen && <div><span className="text-xs text-muted-foreground">Última vez visto</span><p>{item.last_seen}</p></div>}
                          </div>
                          {item.notes && <div><span className="text-xs text-muted-foreground">Observações</span><p className="text-sm whitespace-pre-wrap">{item.notes}</p></div>}
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteId(item.id)}><Trash2 className="h-4 w-4 mr-1" />Excluir</Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            ))}
          </TableBody>
        </Table>
      )}

      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar dispositivo</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar dispositivo" : "Novo dispositivo"}</SheetTitle></SheetHeader>
          <Tabs defaultValue="geral" className="mt-4">
            <TabsList className="w-full"><TabsTrigger value="geral" className="flex-1">Geral</TabsTrigger><TabsTrigger value="detalhes" className="flex-1">Detalhes</TabsTrigger></TabsList>
            <TabsContent value="geral" className="space-y-4 mt-4">
              <div><Label>Nome / Hostname *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Tipo *</Label><Select value={form.device_type || ""} onValueChange={(v) => setForm({ ...form, device_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DEVICE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></div>
              <div>
                <Label>Filial</Label>
                <Select
                  value={form.branch_id ?? NONE_BRANCH}
                  onValueChange={(v) => setForm({ ...form, branch_id: v === NONE_BRANCH ? null : v })}
                  disabled={noBranches}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione uma filial (opcional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_BRANCH}>— Sem filial —</SelectItem>
                    {branchOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Marca / Modelo</Label><Input value={form.brand_model || ""} onChange={(e) => setForm({ ...form, brand_model: e.target.value })} /></div>
              <div><Label>Número de série</Label><Input value={form.serial_number || ""} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
              <div><Label>Sistema operacional</Label><Input value={form.os || ""} onChange={(e) => setForm({ ...form, os: e.target.value })} /></div>
              <div><Label>IP local</Label><Input value={form.ip_local || ""} onChange={(e) => setForm({ ...form, ip_local: e.target.value })} /></div>
              <div><Label>Status</Label><Select value={form.status || "unknown"} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Usuário principal</Label><Input value={form.primary_user || ""} onChange={(e) => setForm({ ...form, primary_user: e.target.value })} /></div>
              <div><Label>Localização física</Label><Input value={form.physical_location || ""} onChange={(e) => setForm({ ...form, physical_location: e.target.value })} /></div>
              <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            </TabsContent>
            <TabsContent value="detalhes" className="space-y-4 mt-4">
              <div><Label>CPU</Label><Input value={form.cpu || ""} onChange={(e) => setForm({ ...form, cpu: e.target.value })} /></div>
              <div><Label>RAM</Label><Input value={form.ram || ""} onChange={(e) => setForm({ ...form, ram: e.target.value })} /></div>
              <div><Label>Disco(s)</Label><Input value={form.disks || ""} onChange={(e) => setForm({ ...form, disks: e.target.value })} /></div>
              <div><Label>MAC address</Label><Input value={form.mac_address || ""} onChange={(e) => setForm({ ...form, mac_address: e.target.value })} /></div>
              <div><Label>ID agente TRMM</Label><Input value={form.trmm_agent_id || ""} onChange={(e) => setForm({ ...form, trmm_agent_id: e.target.value })} readOnly={!!editingItem?.trmm_agent_id} /></div>
            </TabsContent>
          </Tabs>
          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isMutating || !form.name}>{isMutating ? "Salvando..." : "Salvar"}</Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir dispositivo" description="Tem certeza que deseja excluir este dispositivo?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
