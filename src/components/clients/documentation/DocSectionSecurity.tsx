import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Network, ShieldCheck, RefreshCw, Loader2 } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocSync } from "@/hooks/useDocSync";
import { display } from "@/lib/doc-utils";

interface Props { clientId: string; }

// ─── VLANs ────────────────────────────────────────────────────────────────────

interface VlanRow { id: string; vlan_id: number | null; name: string | null; purpose: string | null; ip_range: string | null; gateway: string | null; dhcp_enabled: boolean | null; isolated: boolean | null; unifi_network_id: string | null; data_source: string | null; notes: string | null; [key: string]: unknown; }

const VLAN_EMPTY: Omit<VlanRow, "id"> = { vlan_id: null, name: null, purpose: null, ip_range: null, gateway: null, dhcp_enabled: false, isolated: false, unifi_network_id: null, data_source: "Manual", notes: null };

function VlansTab({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<VlanRow>({ tableName: "doc_vlans", clientId });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VlanRow | null>(null);
  const [form, setForm] = useState<Omit<VlanRow, "id">>(VLAN_EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...VLAN_EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: VlanRow) => { setEditingItem(item); setForm({ ...VLAN_EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6"><Network className="h-8 w-8" /><p className="text-sm">Nenhuma VLAN cadastrada</p></div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>ID VLAN</TableHead><TableHead>Nome</TableHead><TableHead>Finalidade</TableHead><TableHead>Range IP</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell>{display(item.vlan_id)}</TableCell>
                      <TableCell className="font-medium">{display(item.name)}</TableCell>
                      <TableCell>{display(item.purpose)}</TableCell>
                      <TableCell className="font-mono text-xs">{display(item.ip_range)}</TableCell>
                      <TableCell><Badge variant="outline" className={item.data_source === "UniFi" ? "text-green-600 border-green-300" : ""}>{item.data_source || "Manual"}</Badge></TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            <div><span className="text-xs text-muted-foreground">Gateway</span><p>{display(item.gateway)}</p></div>
                            <div><span className="text-xs text-muted-foreground">DHCP</span><p>{item.dhcp_enabled ? "Sim" : "Não"}</p></div>
                            <div><span className="text-xs text-muted-foreground">Isolada</span><p>{item.isolated ? "Sim" : "Não"}</p></div>
                            {item.unifi_network_id && <div><span className="text-xs text-muted-foreground">ID UniFi</span><p className="font-mono text-xs">{item.unifi_network_id}</p></div>}
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
      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar VLAN</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar VLAN" : "Nova VLAN"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>ID da VLAN *</Label><Input type="number" value={form.vlan_id ?? ""} onChange={(e) => setForm({ ...form, vlan_id: Number(e.target.value) || null })} placeholder="Ex: 10, 20, 30" /></div>
            <div><Label>Nome *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Corporativa" /></div>
            <div><Label>Finalidade</Label><Input value={form.purpose || ""} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
            <div><Label>Range de IP</Label><Input value={form.ip_range || ""} onChange={(e) => setForm({ ...form, ip_range: e.target.value })} placeholder="Ex: 192.168.10.0/24" /></div>
            <div><Label>Gateway</Label><Input value={form.gateway || ""} onChange={(e) => setForm({ ...form, gateway: e.target.value })} /></div>
            <div className="flex items-center gap-3"><Switch checked={!!form.dhcp_enabled} onCheckedChange={(v) => setForm({ ...form, dhcp_enabled: v })} /><Label>DHCP habilitado</Label></div>
            <div className="flex items-center gap-3"><Switch checked={!!form.isolated} onCheckedChange={(v) => setForm({ ...form, isolated: v })} /><Label>Isolada de outras VLANs</Label></div>
            <div><Label>ID rede UniFi</Label><Input value={form.unifi_network_id || ""} onChange={(e) => setForm({ ...form, unifi_network_id: e.target.value })} /></div>
            <div><Label>Fonte dos dados</Label>
              <Select value={form.data_source || "Manual"} onValueChange={(v) => setForm({ ...form, data_source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Manual">Manual</SelectItem><SelectItem value="UniFi">UniFi</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.vlan_id || !form.name}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir VLAN" description="Tem certeza?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}

// ─── VPN ──────────────────────────────────────────────────────────────────────

interface VpnRow { id: string; name: string | null; vpn_type: string | null; server: string | null; port: string | null; protocol: string | null; users_configured: string | null; unifi_vpn_id: string | null; data_source: string | null; notes: string | null; [key: string]: unknown; }

const VPN_EMPTY: Omit<VpnRow, "id"> = { name: null, vpn_type: null, server: null, port: null, protocol: null, users_configured: null, unifi_vpn_id: null, data_source: "Manual", notes: null };
const VPN_TYPES = ["WireGuard", "OpenVPN", "IPSec", "L2TP", "PPTP", "Outro"];

function VpnTab({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<VpnRow>({ tableName: "doc_vpn", clientId });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VpnRow | null>(null);
  const [form, setForm] = useState<Omit<VpnRow, "id">>(VPN_EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...VPN_EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: VpnRow) => { setEditingItem(item); setForm({ ...VPN_EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const userCount = (users: string | null) => users ? users.split("\n").filter(Boolean).length : 0;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6"><ShieldCheck className="h-8 w-8" /><p className="text-sm">Nenhuma VPN cadastrada</p></div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Tipo</TableHead><TableHead>Servidor</TableHead><TableHead>Usuários</TableHead><TableHead>Origem</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">{display(item.name)}</TableCell>
                      <TableCell>{display(item.vpn_type)}</TableCell>
                      <TableCell>{display(item.server)}</TableCell>
                      <TableCell>{userCount(item.users_configured)}</TableCell>
                      <TableCell><Badge variant="outline" className={item.data_source === "UniFi" ? "text-green-600 border-green-300" : ""}>{item.data_source || "Manual"}</Badge></TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            <div><span className="text-xs text-muted-foreground">Porta</span><p>{display(item.port)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Protocolo</span><p>{display(item.protocol)}</p></div>
                            {item.unifi_vpn_id && <div><span className="text-xs text-muted-foreground">ID UniFi</span><p className="font-mono text-xs">{item.unifi_vpn_id}</p></div>}
                          </div>
                          {item.users_configured && <div><span className="text-xs text-muted-foreground">Usuários</span><p className="text-sm whitespace-pre-wrap font-mono">{item.users_configured}</p></div>}
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
      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar VPN</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar VPN" : "Nova VPN"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Nome *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Tipo *</Label>
              <Select value={form.vpn_type || ""} onValueChange={(v) => setForm({ ...form, vpn_type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{VPN_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Servidor</Label><Input value={form.server || ""} onChange={(e) => setForm({ ...form, server: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Porta</Label><Input value={form.port || ""} onChange={(e) => setForm({ ...form, port: e.target.value })} /></div>
              <div><Label>Protocolo</Label>
                <Select value={form.protocol || ""} onValueChange={(v) => setForm({ ...form, protocol: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent><SelectItem value="UDP">UDP</SelectItem><SelectItem value="TCP">TCP</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Usuários configurados (um por linha)</Label><Textarea value={form.users_configured || ""} onChange={(e) => setForm({ ...form, users_configured: e.target.value })} rows={4} /></div>
            <div><Label>ID VPN UniFi</Label><Input value={form.unifi_vpn_id || ""} onChange={(e) => setForm({ ...form, unifi_vpn_id: e.target.value })} /></div>
            <div><Label>Fonte dos dados</Label>
              <Select value={form.data_source || "Manual"} onValueChange={(v) => setForm({ ...form, data_source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Manual">Manual</SelectItem><SelectItem value="UniFi">UniFi</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.name || !form.vpn_type}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir VPN" description="Tem certeza?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}

// ─── Firewall ─────────────────────────────────────────────────────────────────

interface FirewallRow { id: string; name: string | null; rule_type: string | null; source: string | null; destination: string | null; port: string | null; protocol: string | null; action: string | null; context: string | null; unifi_rule_id: string | null; data_source: string | null; notes: string | null; [key: string]: unknown; }

const FW_EMPTY: Omit<FirewallRow, "id"> = { name: null, rule_type: null, source: null, destination: null, port: null, protocol: null, action: null, context: null, unifi_rule_id: null, data_source: "Manual", notes: null };
const RULE_TYPES = ["Regra de firewall", "Abertura de porta (Port forward)", "Bloqueio"];
const PROTOCOLS = ["TCP", "UDP", "TCP+UDP", "Qualquer"];

function FirewallTab({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<FirewallRow>({ tableName: "doc_firewall_rules", clientId });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FirewallRow | null>(null);
  const [form, setForm] = useState<Omit<FirewallRow, "id">>(FW_EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...FW_EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: FirewallRow) => { setEditingItem(item); setForm({ ...FW_EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6"><ShieldCheck className="h-8 w-8" /><p className="text-sm">Nenhuma regra cadastrada</p></div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Descrição</TableHead><TableHead>Tipo</TableHead><TableHead>Origem → Destino</TableHead><TableHead>Porta</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">{display(item.name)}</TableCell>
                      <TableCell>{display(item.rule_type)}</TableCell>
                      <TableCell className="text-xs">{display(item.source)} → {display(item.destination)}</TableCell>
                      <TableCell className="font-mono text-xs">{display(item.port)}</TableCell>
                      <TableCell>
                        {item.action && <Badge variant="outline" className={item.action === "Permitir" ? "text-green-600 border-green-300" : "text-red-600 border-red-300"}>{item.action}</Badge>}
                      </TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            <div><span className="text-xs text-muted-foreground">Protocolo</span><p>{display(item.protocol)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Fonte</span><p><Badge variant="outline" className={item.data_source === "UniFi" ? "text-green-600 border-green-300" : ""}>{item.data_source || "Manual"}</Badge></p></div>
                            {item.unifi_rule_id && <div><span className="text-xs text-muted-foreground">ID UniFi</span><p className="font-mono text-xs">{item.unifi_rule_id}</p></div>}
                          </div>
                          {item.context && <div><span className="text-xs text-muted-foreground">Motivo / Contexto</span><p className="text-sm whitespace-pre-wrap">{item.context}</p></div>}
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
      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar regra</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar regra" : "Nova regra"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Descrição / Nome *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Tipo de regra *</Label>
              <Select value={form.rule_type || ""} onValueChange={(v) => setForm({ ...form, rule_type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Origem</Label><Input value={form.source || ""} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Ex: VLAN 20, WAN" /></div>
              <div><Label>Destino</Label><Input value={form.destination || ""} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Ex: 192.168.1.100" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Porta</Label><Input value={form.port || ""} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="Ex: 443, 80" /></div>
              <div><Label>Protocolo</Label>
                <Select value={form.protocol || ""} onValueChange={(v) => setForm({ ...form, protocol: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{PROTOCOLS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Ação</Label>
              <Select value={form.action || ""} onValueChange={(v) => setForm({ ...form, action: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent><SelectItem value="Permitir">Permitir</SelectItem><SelectItem value="Bloquear">Bloquear</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Motivo / Contexto</Label><Textarea value={form.context || ""} onChange={(e) => setForm({ ...form, context: e.target.value })} rows={3} /></div>
            <div><Label>ID regra UniFi</Label><Input value={form.unifi_rule_id || ""} onChange={(e) => setForm({ ...form, unifi_rule_id: e.target.value })} /></div>
            <div><Label>Fonte dos dados</Label>
              <Select value={form.data_source || "Manual"} onValueChange={(v) => setForm({ ...form, data_source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Manual">Manual</SelectItem><SelectItem value="UniFi">UniFi</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.name || !form.rule_type}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir regra" description="Tem certeza?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}

// ─── Políticas de Acesso ──────────────────────────────────────────────────────

interface PolicyRow { id: string; policy_type: string | null; target: string | null; affected_group: string | null; reason: string | null; exceptions: string | null; configured_via: string | null; unifi_rule_id: string | null; notes: string | null; [key: string]: unknown; }

const POLICY_EMPTY: Omit<PolicyRow, "id"> = { policy_type: null, target: null, affected_group: null, reason: null, exceptions: null, configured_via: null, unifi_rule_id: null, notes: null };
const CONFIGURED_VIA = ["UniFi Traffic Rules", "DNS Filtering", "Proxy", "Outro"];

function PoliciesTab({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<PolicyRow>({ tableName: "doc_access_policies", clientId });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PolicyRow | null>(null);
  const [form, setForm] = useState<Omit<PolicyRow, "id">>(POLICY_EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...POLICY_EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: PolicyRow) => { setEditingItem(item); setForm({ ...POLICY_EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6"><ShieldCheck className="h-8 w-8" /><p className="text-sm">Nenhuma política cadastrada</p></div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Alvo</TableHead><TableHead>Grupo afetado</TableHead><TableHead>Configurado via</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell>
                        {item.policy_type && <Badge variant="outline" className={item.policy_type === "Bloqueio" ? "text-red-600 border-red-300" : "text-green-600 border-green-300"}>{item.policy_type}</Badge>}
                      </TableCell>
                      <TableCell className="font-medium">{display(item.target)}</TableCell>
                      <TableCell>{display(item.affected_group)}</TableCell>
                      <TableCell>{display(item.configured_via)}</TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={4}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-2 text-sm">
                            <div><span className="text-xs text-muted-foreground">Motivo</span><p>{display(item.reason)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Exceções</span><p>{display(item.exceptions)}</p></div>
                            {item.unifi_rule_id && <div><span className="text-xs text-muted-foreground">ID UniFi</span><p className="font-mono text-xs">{item.unifi_rule_id}</p></div>}
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
      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar política</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar política" : "Nova política"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Tipo *</Label>
              <Select value={form.policy_type || ""} onValueChange={(v) => setForm({ ...form, policy_type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent><SelectItem value="Bloqueio">Bloqueio</SelectItem><SelectItem value="Liberação">Liberação</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Alvo *</Label><Input value={form.target || ""} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="Ex: Facebook, TikTok" /></div>
            <div><Label>Grupo afetado</Label><Input value={form.affected_group || ""} onChange={(e) => setForm({ ...form, affected_group: e.target.value })} placeholder="Ex: VLAN Corporativa" /></div>
            <div><Label>Motivo</Label><Input value={form.reason || ""} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div><Label>Exceções</Label><Input value={form.exceptions || ""} onChange={(e) => setForm({ ...form, exceptions: e.target.value })} placeholder="Ex: Marketing liberado" /></div>
            <div><Label>Configurado via</Label>
              <Select value={form.configured_via || ""} onValueChange={(v) => setForm({ ...form, configured_via: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{CONFIGURED_VIA.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>ID regra UniFi</Label><Input value={form.unifi_rule_id || ""} onChange={(e) => setForm({ ...form, unifi_rule_id: e.target.value })} /></div>
            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.policy_type || !form.target}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir política" description="Tem certeza?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DocSectionSecurity({ clientId }: Props) {
  const [activeTab, setActiveTab] = useState("vlans");
  const { syncingUnifi, unifiConfigured, syncUnifi } = useDocSync(clientId);

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
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="vlans">VLANs</TabsTrigger>
          <TabsTrigger value="vpn">VPN</TabsTrigger>
          <TabsTrigger value="firewall">Firewall e Portas</TabsTrigger>
          <TabsTrigger value="policies">Políticas de Acesso</TabsTrigger>
        </TabsList>
        <TabsContent value="vlans"><VlansTab clientId={clientId} /></TabsContent>
        <TabsContent value="vpn"><VpnTab clientId={clientId} /></TabsContent>
        <TabsContent value="firewall"><FirewallTab clientId={clientId} /></TabsContent>
        <TabsContent value="policies"><PoliciesTab clientId={clientId} /></TabsContent>
      </Tabs>
    </div>
  );
}
