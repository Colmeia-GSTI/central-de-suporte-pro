import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Camera } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocCredentialOptions } from "@/hooks/useDocCredentialOptions";
import { display } from "@/lib/doc-utils";

interface Props { clientId: string; }

interface CftvRow {
  id: string;
  name: string | null;
  device_type: string | null;
  brand_model: string | null;
  ip: string | null;
  physical_location: string | null;
  notes: string | null;
  channels: number | null;
  storage_size: string | null;
  retention_days: number | null;
  remote_access: string | null;
  credential_id: string | null;
  resolution: string | null;
  camera_type: string | null;
  power_type: string | null;
  nvr_id: string | null;
  nvr_channel: number | null;
  [key: string]: unknown;
}

const EMPTY: Omit<CftvRow, "id"> = {
  name: null, device_type: "nvr", brand_model: null, ip: null,
  physical_location: null, notes: null, channels: null, storage_size: null,
  retention_days: null, remote_access: null, credential_id: null,
  resolution: null, camera_type: null, power_type: null, nvr_id: null, nvr_channel: null,
};

export function DocTableCftv({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<CftvRow>({ tableName: "doc_cftv", clientId });
  const { options: credOptions } = useDocCredentialOptions(clientId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CftvRow | null>(null);
  const [form, setForm] = useState<Omit<CftvRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: CftvRow) => { setEditingItem(item); setForm({ ...EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  const nvrs = items.filter(i => i.device_type === "nvr");

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Camera className="h-8 w-8" /><p className="text-sm">Nenhum dispositivo CFTV cadastrado</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Modelo</TableHead><TableHead>IP</TableHead><TableHead>Localização</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">{display(item.name)}</TableCell>
                      <TableCell>{item.device_type === "nvr" ? "NVR" : "Câmera IP"}</TableCell>
                      <TableCell>{display(item.brand_model)}</TableCell>
                      <TableCell className="font-mono text-xs">{display(item.ip)}</TableCell>
                      <TableCell>{display(item.physical_location)}</TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            {item.device_type === "nvr" && (<>
                              <div><span className="text-xs text-muted-foreground">Canais</span><p>{display(item.channels)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Armazenamento</span><p>{display(item.storage_size)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Retenção</span><p>{item.retention_days ? `${item.retention_days} dias` : "—"}</p></div>
                              <div><span className="text-xs text-muted-foreground">Acesso remoto</span><p>{display(item.remote_access)}</p></div>
                            </>)}
                            {item.device_type === "camera" && (<>
                              <div><span className="text-xs text-muted-foreground">Resolução</span><p>{display(item.resolution)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Tipo</span><p>{display(item.camera_type)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Alimentação</span><p>{display(item.power_type)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Canal NVR</span><p>{display(item.nvr_channel)}</p></div>
                            </>)}
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
          <SheetHeader><SheetTitle>{editingItem ? "Editar dispositivo CFTV" : "Novo dispositivo CFTV"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Nome *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Tipo *</Label><Select value={form.device_type || ""} onValueChange={(v) => setForm({ ...form, device_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nvr">NVR</SelectItem><SelectItem value="camera">Câmera IP</SelectItem></SelectContent></Select></div>
            <div><Label>Marca / Modelo</Label><Input value={form.brand_model || ""} onChange={(e) => setForm({ ...form, brand_model: e.target.value })} /></div>
            <div><Label>IP</Label><Input value={form.ip || ""} onChange={(e) => setForm({ ...form, ip: e.target.value })} /></div>
            <div><Label>Localização física</Label><Input value={form.physical_location || ""} onChange={(e) => setForm({ ...form, physical_location: e.target.value })} /></div>

            {form.device_type === "nvr" && (<>
              <div><Label>Canais</Label><Input type="number" value={form.channels ?? ""} onChange={(e) => setForm({ ...form, channels: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><Label>Armazenamento</Label><Input value={form.storage_size || ""} onChange={(e) => setForm({ ...form, storage_size: e.target.value })} placeholder="4TB" /></div>
              <div><Label>Retenção (dias)</Label><Input type="number" value={form.retention_days ?? ""} onChange={(e) => setForm({ ...form, retention_days: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><Label>Acesso remoto</Label><Input value={form.remote_access || ""} onChange={(e) => setForm({ ...form, remote_access: e.target.value })} placeholder="iSIC, DDNS" /></div>
              <div><Label>Credencial de acesso</Label><Select value={form.credential_id || ""} onValueChange={(v) => setForm({ ...form, credential_id: v || null })}><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger><SelectContent>{credOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            </>)}
            {form.device_type === "camera" && (<>
              <div><Label>Resolução</Label><Input value={form.resolution || ""} onChange={(e) => setForm({ ...form, resolution: e.target.value })} placeholder="2MP Full HD" /></div>
              <div><Label>Tipo câmera</Label><Select value={form.camera_type || ""} onValueChange={(v) => setForm({ ...form, camera_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="Dome">Dome</SelectItem><SelectItem value="Bullet">Bullet</SelectItem><SelectItem value="PTZ">PTZ</SelectItem><SelectItem value="Fisheye">Fisheye</SelectItem></SelectContent></Select></div>
              <div><Label>Alimentação</Label><Select value={form.power_type || ""} onValueChange={(v) => setForm({ ...form, power_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent><SelectItem value="PoE">PoE</SelectItem><SelectItem value="Fonte">Fonte</SelectItem><SelectItem value="PoE+">PoE+</SelectItem></SelectContent></Select></div>
              {nvrs.length > 0 && (
                <div><Label>NVR vinculado</Label><Select value={form.nvr_id || ""} onValueChange={(v) => setForm({ ...form, nvr_id: v || null })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{nvrs.map(n => <SelectItem key={n.id} value={n.id}>{n.name || "NVR sem nome"}</SelectItem>)}</SelectContent></Select></div>
              )}
              <div><Label>Canal no NVR</Label><Input type="number" value={form.nvr_channel ?? ""} onChange={(e) => setForm({ ...form, nvr_channel: e.target.value ? Number(e.target.value) : null })} /></div>
            </>)}

            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.name}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir dispositivo CFTV" description="Tem certeza que deseja excluir este dispositivo?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
