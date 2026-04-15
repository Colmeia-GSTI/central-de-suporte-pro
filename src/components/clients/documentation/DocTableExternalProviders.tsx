import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Pencil, Trash2, Handshake, CalendarIcon } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocCredentialOptions } from "@/hooks/useDocCredentialOptions";
import { daysUntil, display } from "@/lib/doc-utils";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Props { clientId: string; }

const SERVICE_TYPES = ["CFTV", "ERP", "Hospedagem", "Site", "Telefonia", "Segurança", "Elétrica", "Outro"];
const CONTRACT_TYPES = ["Mensal", "Anual", "Avulso", "Sem contrato"];

interface ProviderRow {
  id: string;
  company_name: string | null;
  service_type: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  support_hours: string | null;
  contract_type: string | null;
  contract_expiry: string | null;
  panel_url: string | null;
  credential_id: string | null;
  notes: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<ProviderRow, "id"> = {
  company_name: null, service_type: null, contact_name: null, contact_phone: null,
  contact_email: null, support_hours: null, contract_type: null, contract_expiry: null,
  panel_url: null, credential_id: null, notes: null,
};

export function DocTableExternalProviders({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<ProviderRow>({ tableName: "doc_external_providers", clientId });
  const { options: credOptions } = useDocCredentialOptions(clientId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProviderRow | null>(null);
  const [form, setForm] = useState<Omit<ProviderRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: ProviderRow) => { setEditingItem(item); setForm({ ...EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Handshake className="h-8 w-8" /><p className="text-sm">Nenhum prestador cadastrado</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>Serviço</TableHead><TableHead>Contato</TableHead><TableHead>Painel</TableHead><TableHead>Vencimento</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => {
              const expiry = daysUntil(item.contract_expiry);
              return (
                <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow className="cursor-pointer hover:bg-muted/30">
                        <TableCell className="font-medium">{display(item.company_name)}</TableCell>
                        <TableCell>{display(item.service_type)}</TableCell>
                        <TableCell>{display(item.contact_name)}</TableCell>
                        <TableCell>{item.panel_url ? "Sim" : "—"}</TableCell>
                        <TableCell>
                          {item.contract_expiry ? <Badge variant={expiry.variant === "destructive" ? "destructive" : "secondary"} className="text-xs">{expiry.text}</Badge> : "—"}
                        </TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={5}>
                          <div className="py-3 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-3 text-sm">
                              <div><span className="text-xs text-muted-foreground">Telefone</span><p>{display(item.contact_phone)}</p></div>
                              <div><span className="text-xs text-muted-foreground">E-mail</span><p>{display(item.contact_email)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Horário suporte</span><p>{display(item.support_hours)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Tipo contrato</span><p>{display(item.contract_type)}</p></div>
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

      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar prestador</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar prestador" : "Novo prestador"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Empresa / Profissional *</Label><Input value={form.company_name || ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
            <div><Label>Tipo de serviço *</Label><Select value={form.service_type || ""} onValueChange={(v) => setForm({ ...form, service_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Nome do contato</Label><Input value={form.contact_name || ""} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div><Label>Telefone</Label><Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
            <div><Label>E-mail</Label><Input value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
            <div><Label>Horário de suporte</Label><Input value={form.support_hours || ""} onChange={(e) => setForm({ ...form, support_hours: e.target.value })} /></div>
            <div><Label>Tipo de contrato</Label><Select value={form.contract_type || ""} onValueChange={(v) => setForm({ ...form, contract_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div>
              <Label>Vencimento do contrato</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.contract_expiry && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />{form.contract_expiry ? format(parseISO(form.contract_expiry), "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={form.contract_expiry ? parseISO(form.contract_expiry) : undefined} onSelect={(d) => setForm({ ...form, contract_expiry: d ? format(d, "yyyy-MM-dd") : null })} className="p-3 pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
            <div><Label>URL do painel</Label><Input value={form.panel_url || ""} onChange={(e) => setForm({ ...form, panel_url: e.target.value })} /></div>
            <div><Label>Credencial do painel</Label><Select value={form.credential_id || ""} onValueChange={(v) => setForm({ ...form, credential_id: v || null })}><SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger><SelectContent>{credOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.company_name || !form.service_type}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir prestador" description="Tem certeza que deseja excluir este prestador?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
