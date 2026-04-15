import { useState } from "react";
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Pencil, Trash2, Package, CalendarIcon } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocCredentialOptions } from "@/hooks/useDocCredentialOptions";
import { display } from "@/lib/doc-utils";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Props { clientId: string; }
const CATEGORIES = ["ERP", "CRM", "Contabilidade", "RH", "Fiscal", "Ponto", "Outro"];

interface SoftwareRow {
  id: string;
  name: string | null;
  category: string | null;
  version: string | null;
  vendor: string | null;
  vendor_phone: string | null;
  vendor_email: string | null;
  support_hours: string | null;
  support_contract: string | null;
  support_expiry: string | null;
  access_url: string | null;
  credential_id: string | null;
  trmm_software_match: string | null;
  notes: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<SoftwareRow, "id"> = {
  name: null, category: null, version: null, vendor: null, vendor_phone: null,
  vendor_email: null, support_hours: null, support_contract: null, support_expiry: null,
  access_url: null, credential_id: null, trmm_software_match: null, notes: null,
};

export function DocTableSoftwareErp({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<SoftwareRow>({ tableName: "doc_software_erp", clientId });
  const { options: credOptions } = useDocCredentialOptions(clientId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<SoftwareRow | null>(null);
  const [form, setForm] = useState<Omit<SoftwareRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: SoftwareRow) => { setEditingItem(item); setForm({ ...EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };
  const hasContract = form.support_contract === "true" || form.support_contract === "Sim";

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Package className="h-8 w-8" /><p className="text-sm">Nenhum software cadastrado</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Sistema</TableHead><TableHead>Categoria</TableHead><TableHead>Versão</TableHead><TableHead>Fornecedor</TableHead><TableHead>Suporte</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">{display(item.name)}</TableCell>
                      <TableCell>{display(item.category)}</TableCell>
                      <TableCell>{display(item.version)}</TableCell>
                      <TableCell>{display(item.vendor)}</TableCell>
                      <TableCell>{display(item.support_hours)}</TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            <div><span className="text-xs text-muted-foreground">Tel. suporte</span><p>{display(item.vendor_phone)}</p></div>
                            <div><span className="text-xs text-muted-foreground">E-mail suporte</span><p>{display(item.vendor_email)}</p></div>
                            <div><span className="text-xs text-muted-foreground">URL acesso</span><p>{display(item.access_url)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Contrato suporte</span><p>{item.support_contract === "true" || item.support_contract === "Sim" ? "Sim" : "Não"}</p></div>
                            {(item.support_contract === "true" || item.support_contract === "Sim") && <div><span className="text-xs text-muted-foreground">Vencimento contrato</span><p>{item.support_expiry ? format(parseISO(item.support_expiry), "dd/MM/yyyy") : "—"}</p></div>}
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

      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar software</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar software" : "Novo software"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Nome do sistema *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Categoria *</Label><Select value={form.category || ""} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Versão</Label><Input value={form.version || ""} onChange={(e) => setForm({ ...form, version: e.target.value })} /></div>
            <div><Label>Fornecedor</Label><Input value={form.vendor || ""} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
            <div><Label>Telefone suporte</Label><Input value={form.vendor_phone || ""} onChange={(e) => setForm({ ...form, vendor_phone: e.target.value })} /></div>
            <div><Label>E-mail suporte</Label><Input value={form.vendor_email || ""} onChange={(e) => setForm({ ...form, vendor_email: e.target.value })} /></div>
            <div><Label>Horário de suporte</Label><Input value={form.support_hours || ""} onChange={(e) => setForm({ ...form, support_hours: e.target.value })} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={hasContract} onCheckedChange={(v) => setForm({ ...form, support_contract: v ? "Sim" : "Não", support_expiry: v ? form.support_expiry : null })} />
              <Label>Contrato de suporte</Label>
            </div>
            {hasContract && (
              <div>
                <Label>Vencimento contrato</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.support_expiry && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />{form.support_expiry ? format(parseISO(form.support_expiry), "dd/MM/yyyy") : "Selecione"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={form.support_expiry ? parseISO(form.support_expiry) : undefined} onSelect={(d) => setForm({ ...form, support_expiry: d ? format(d, "yyyy-MM-dd") : null })} className="p-3 pointer-events-auto" /></PopoverContent>
                </Popover>
              </div>
            )}
            <div><Label>URL de acesso</Label><Input value={form.access_url || ""} onChange={(e) => setForm({ ...form, access_url: e.target.value })} /></div>
            <div><Label>Credencial de acesso</Label><Select value={form.credential_id || ""} onValueChange={(v) => setForm({ ...form, credential_id: v || null })}><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger><SelectContent>{credOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Nome no TRMM</Label><Input value={form.trmm_software_match || ""} onChange={(e) => setForm({ ...form, trmm_software_match: e.target.value })} /></div>
            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.name || !form.category}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir software" description="Tem certeza que deseja excluir este software?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
