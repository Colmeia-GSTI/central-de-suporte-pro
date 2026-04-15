import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Pencil, Trash2, Globe, CalendarIcon } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocCredentialOptions } from "@/hooks/useDocCredentialOptions";
import { daysUntil, display } from "@/lib/doc-utils";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Props { clientId: string; }

interface DomainRow {
  id: string;
  domain: string | null;
  registrar: string | null;
  dns_provider: string | null;
  registrar_panel_url: string | null;
  registrar_credential_id: string | null;
  dns_panel_url: string | null;
  dns_credential_id: string | null;
  expiry_date: string | null;
  alert_days: number | null;
  notes: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<DomainRow, "id"> = {
  domain: null, registrar: null, dns_provider: null, registrar_panel_url: null,
  registrar_credential_id: null, dns_panel_url: null, dns_credential_id: null,
  expiry_date: null, alert_days: 60, notes: null,
};

export function DocTableDomains({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<DomainRow>({ tableName: "doc_domains", clientId });
  const { options: credOptions } = useDocCredentialOptions(clientId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DomainRow | null>(null);
  const [form, setForm] = useState<Omit<DomainRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: DomainRow) => { setEditingItem(item); setForm({ ...EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Globe className="h-8 w-8" /><p className="text-sm">Nenhum domínio cadastrado</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Domínio</TableHead><TableHead>Registrador</TableHead><TableHead>DNS</TableHead><TableHead>Vencimento</TableHead><TableHead>Alerta</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => {
              const expiry = daysUntil(item.expiry_date);
              return (
                <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow className="cursor-pointer hover:bg-muted/30">
                        <TableCell className="font-medium">{display(item.domain)}</TableCell>
                        <TableCell>{display(item.registrar)}</TableCell>
                        <TableCell>{display(item.dns_provider)}</TableCell>
                        <TableCell>{item.expiry_date ? format(parseISO(item.expiry_date), "dd/MM/yyyy") : "—"}</TableCell>
                        <TableCell>
                          {item.expiry_date ? (
                            <Badge variant={expiry.variant === "destructive" ? "destructive" : expiry.variant === "warning" ? "outline" : "secondary"} className="text-xs">{expiry.text}</Badge>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={5}>
                          <div className="py-3 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2 text-sm">
                              <div><span className="text-xs text-muted-foreground">Painel registrador</span><p>{display(item.registrar_panel_url)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Painel DNS</span><p>{display(item.dns_panel_url)}</p></div>
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
              );
            })}
          </TableBody>
        </Table>
      )}

      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar domínio</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar domínio" : "Novo domínio"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Domínio *</Label><Input value={form.domain || ""} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="empresa.com.br" /></div>
            <div><Label>Registrador</Label><Input value={form.registrar || ""} onChange={(e) => setForm({ ...form, registrar: e.target.value })} placeholder="Registro.br, GoDaddy" /></div>
            <div><Label>Provedor DNS</Label><Input value={form.dns_provider || ""} onChange={(e) => setForm({ ...form, dns_provider: e.target.value })} placeholder="Cloudflare" /></div>
            <div><Label>URL painel registrador</Label><Input value={form.registrar_panel_url || ""} onChange={(e) => setForm({ ...form, registrar_panel_url: e.target.value })} /></div>
            <div><Label>Credencial registrador</Label><Select value={form.registrar_credential_id || ""} onValueChange={(v) => setForm({ ...form, registrar_credential_id: v || null })}><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger><SelectContent>{credOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>URL painel DNS</Label><Input value={form.dns_panel_url || ""} onChange={(e) => setForm({ ...form, dns_panel_url: e.target.value })} /></div>
            <div><Label>Credencial DNS</Label><Select value={form.dns_credential_id || ""} onValueChange={(v) => setForm({ ...form, dns_credential_id: v || null })}><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger><SelectContent>{credOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div>
              <Label>Data de vencimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.expiry_date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />{form.expiry_date ? format(parseISO(form.expiry_date), "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={form.expiry_date ? parseISO(form.expiry_date) : undefined} onSelect={(d) => setForm({ ...form, expiry_date: d ? format(d, "yyyy-MM-dd") : null })} className="p-3 pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
            <div><Label>Dias para alerta</Label><Input type="number" value={form.alert_days ?? 60} onChange={(e) => setForm({ ...form, alert_days: Number(e.target.value) })} /></div>
            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.domain}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir domínio" description="Tem certeza que deseja excluir este domínio?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
