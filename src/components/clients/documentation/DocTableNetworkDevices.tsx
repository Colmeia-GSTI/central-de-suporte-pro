import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SourceBadge } from "./shared/SourceBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Network, RefreshCw, Loader2 } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocSync } from "@/hooks/useDocSync";
import { useClientBranchOptions } from "@/hooks/useClientBranchOptions";
import { display } from "@/lib/doc-utils";

const NONE_BRANCH = "__none__";

interface Props { clientId: string; }

const DEVICE_TYPES = [
  { value: "switch", label: "Switch" },
  { value: "access_point", label: "Access Point" },
  { value: "printer", label: "Impressora" },
  { value: "tv", label: "TV" },
  { value: "clock", label: "Relógio Ponto" },
  { value: "facial", label: "Controle Facial" },
  { value: "nas", label: "NAS" },
  { value: "other", label: "Outro" },
];

interface DeviceRow {
  id: string;
  name: string | null;
  device_type: string | null;
  brand_model: string | null;
  ip_local: string | null;
  mac_address: string | null;
  physical_location: string | null;
  notes: string | null;
  firmware: string | null;
  port_count: number | null;
  vlans: string | null;
  unifi_device_id: string | null;
  ssids: string | null;
  connected_clients: number | null;
  connection_type: string | null;
  consumable: string | null;
  usage: string | null;
  os: string | null;
  integrated_software: string | null;
  reading_type: string | null;
  disks: string | null;
  ram: string | null;
  data_source: string | null;
  branch_id: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<DeviceRow, "id"> = {
  name: null, device_type: "switch", brand_model: null, ip_local: null,
  mac_address: null, physical_location: null, notes: null, firmware: null,
  port_count: null, vlans: null, unifi_device_id: null, ssids: null,
  connected_clients: null, connection_type: null, consumable: null,
  usage: null, os: null, integrated_software: null, reading_type: null,
  disks: null, ram: null, data_source: "Manual", branch_id: null,
};


export function DocTableNetworkDevices({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<DeviceRow>({
    tableName: "doc_devices", clientId,
    filter: { column: "device_type", values: ["switch", "access_point", "printer", "tv", "clock", "facial", "nas", "other"] },
  });
  const { syncingUnifi, unifiConfigured, syncUnifi } = useDocSync(clientId);
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
    if (editingItem) {
      const origSource = (editingItem.data_source || "").toLowerCase();
      if (origSource === "unifi") saveData.data_source = "unifi+manual";
      await update({ id: editingItem.id, ...saveData } as any);
    } else {
      await create(saveData as any);
    }
    setDrawerOpen(false);
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  const typeLabel = (t: string | null) => DEVICE_TYPES.find(d => d.value === t)?.label || t || "—";
  const dt = form.device_type;

  return (
    <div className="space-y-3">
      {unifiConfigured && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={syncUnifi} disabled={syncingUnifi} className="gap-1.5">
            {syncingUnifi ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar UniFi
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Network className="h-8 w-8" /><p className="text-sm">Nenhum dispositivo de rede cadastrado</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Modelo</TableHead><TableHead>IP</TableHead><TableHead>Localização</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">{display(item.name)}</TableCell>
                      <TableCell>{typeLabel(item.device_type)}</TableCell>
                      <TableCell>{display(item.brand_model)}</TableCell>
                      <TableCell className="font-mono text-xs">{display(item.ip_local)}</TableCell>
                      <TableCell>{display(item.physical_location)}</TableCell>
                      <TableCell><SourceBadge source={item.data_source} /></TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={6}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            <div><span className="text-xs text-muted-foreground">MAC</span><p className="font-mono text-xs">{display(item.mac_address)}</p></div>
                            {item.firmware && <div><span className="text-xs text-muted-foreground">Firmware</span><p>{item.firmware}</p></div>}
                            {item.port_count && <div><span className="text-xs text-muted-foreground">Portas</span><p>{item.port_count}</p></div>}
                            {item.vlans && <div><span className="text-xs text-muted-foreground">VLANs</span><p>{item.vlans}</p></div>}
                            {item.ssids && <div><span className="text-xs text-muted-foreground">SSIDs</span><p>{item.ssids}</p></div>}
                            {item.connected_clients != null && <div><span className="text-xs text-muted-foreground">Clientes</span><p>{item.connected_clients}</p></div>}
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
          <div className="space-y-4 mt-4">
            <div><Label>Nome / Identificação *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
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
            <div><Label>IP na rede</Label><Input value={form.ip_local || ""} onChange={(e) => setForm({ ...form, ip_local: e.target.value })} /></div>
            <div><Label>MAC address</Label><Input value={form.mac_address || ""} onChange={(e) => setForm({ ...form, mac_address: e.target.value })} /></div>
            <div><Label>Localização física</Label><Input value={form.physical_location || ""} onChange={(e) => setForm({ ...form, physical_location: e.target.value })} /></div>

            {dt === "switch" && (
              <>
                <div><Label>Quantidade de portas</Label><Input type="number" value={form.port_count ?? ""} onChange={(e) => setForm({ ...form, port_count: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><Label>Firmware</Label><Input value={form.firmware || ""} onChange={(e) => setForm({ ...form, firmware: e.target.value })} /></div>
                <div><Label>VLANs</Label><Input value={form.vlans || ""} onChange={(e) => setForm({ ...form, vlans: e.target.value })} /></div>
                <div><Label>ID dispositivo UniFi</Label><Input value={form.unifi_device_id || ""} onChange={(e) => setForm({ ...form, unifi_device_id: e.target.value })} readOnly={!!editingItem?.unifi_device_id} /></div>
              </>
            )}
            {dt === "access_point" && (
              <>
                <div><Label>SSIDs transmitidos</Label><Input value={form.ssids || ""} onChange={(e) => setForm({ ...form, ssids: e.target.value })} /></div>
                <div><Label>Clientes conectados</Label><Input type="number" value={form.connected_clients ?? ""} onChange={(e) => setForm({ ...form, connected_clients: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><Label>Firmware</Label><Input value={form.firmware || ""} onChange={(e) => setForm({ ...form, firmware: e.target.value })} /></div>
                <div><Label>ID dispositivo UniFi</Label><Input value={form.unifi_device_id || ""} onChange={(e) => setForm({ ...form, unifi_device_id: e.target.value })} readOnly={!!editingItem?.unifi_device_id} /></div>
              </>
            )}
            {dt === "printer" && (
              <>
                <div><Label>Tipo de conexão</Label><Select value={form.connection_type || ""} onValueChange={(v) => setForm({ ...form, connection_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="Rede">Rede</SelectItem><SelectItem value="USB">USB</SelectItem><SelectItem value="Wi-Fi">Wi-Fi</SelectItem></SelectContent></Select></div>
                <div><Label>Referência toner / cartucho</Label><Input value={form.consumable || ""} onChange={(e) => setForm({ ...form, consumable: e.target.value })} /></div>
              </>
            )}
            {dt === "tv" && (
              <>
                <div><Label>Uso</Label><Select value={form.usage || ""} onValueChange={(v) => setForm({ ...form, usage: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="Sinalização digital">Sinalização digital</SelectItem><SelectItem value="Sala de reunião">Sala de reunião</SelectItem><SelectItem value="Outro">Outro</SelectItem></SelectContent></Select></div>
                <div><Label>Sistema operacional da TV</Label><Input value={form.os || ""} onChange={(e) => setForm({ ...form, os: e.target.value })} placeholder="Tizen, WebOS..." /></div>
              </>
            )}
            {dt === "clock" && (
              <>
                <div><Label>Software integrado</Label><Input value={form.integrated_software || ""} onChange={(e) => setForm({ ...form, integrated_software: e.target.value })} /></div>
                <div><Label>Tipo de leitura</Label><Select value={form.reading_type || ""} onValueChange={(v) => setForm({ ...form, reading_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="Biométrico">Biométrico</SelectItem><SelectItem value="Cartão">Cartão</SelectItem><SelectItem value="Facial">Facial</SelectItem><SelectItem value="Híbrido">Híbrido</SelectItem></SelectContent></Select></div>
              </>
            )}
            {dt === "facial" && (
              <>
                <div><Label>Software integrado</Label><Input value={form.integrated_software || ""} onChange={(e) => setForm({ ...form, integrated_software: e.target.value })} /></div>
                <div><Label>Tipo de acesso</Label><Select value={form.reading_type || ""} onValueChange={(v) => setForm({ ...form, reading_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="Facial">Facial</SelectItem><SelectItem value="Cartão">Cartão</SelectItem><SelectItem value="Facial+Cartão">Facial+Cartão</SelectItem></SelectContent></Select></div>
              </>
            )}
            {dt === "nas" && (
              <>
                <div><Label>Capacidade total</Label><Input value={form.disks || ""} onChange={(e) => setForm({ ...form, disks: e.target.value })} /></div>
                <div><Label>RAID configurado</Label><Input value={form.ram || ""} onChange={(e) => setForm({ ...form, ram: e.target.value })} /></div>
                <div><Label>Sistema operacional</Label><Input value={form.os || ""} onChange={(e) => setForm({ ...form, os: e.target.value })} placeholder="DSM 7.2" /></div>
                <div><Label>Função</Label><Input value={form.usage || ""} onChange={(e) => setForm({ ...form, usage: e.target.value })} placeholder="Backup, Arquivo, AD" /></div>
              </>
            )}

            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.name}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir dispositivo" description="Tem certeza que deseja excluir este dispositivo de rede?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
