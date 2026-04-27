import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useClientBranchOptions } from "@/hooks/useClientBranchOptions";
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
import { Plus, Pencil, Trash2, CalendarIcon, Wifi } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { daysUntil, display } from "@/lib/doc-utils";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Props { clientId: string; }

const TYPES = ["Principal", "Redundante", "Backup", "4G"];
const LINK_TYPES = ["Fibra", "Rádio", "ADSL", "4G", "Satélite"];
const IP_TYPES = ["Fixo", "Dinâmico"];

interface LinkRow {
  id: string;
  type: string | null;
  provider: string | null;
  link_type: string | null;
  plan_speed: string | null;
  public_ip: string | null;
  support_phone: string | null;
  contract_expiry: string | null;
  alert_days: number | null;
  notes: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<LinkRow, "id"> = {
  type: null, provider: null, link_type: null, plan_speed: null,
  public_ip: null, support_phone: null, contract_expiry: null,
  alert_days: 30, notes: null,
};

export function DocTableInternetLinks({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<LinkRow>({
    tableName: "doc_internet_links", clientId,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LinkRow | null>(null);
  const [form, setForm] = useState<Omit<LinkRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: LinkRow) => {
    setEditingItem(item);
    setForm({ type: item.type, provider: item.provider, link_type: item.link_type, plan_speed: item.plan_speed, public_ip: item.public_ip, support_phone: item.support_phone, contract_expiry: item.contract_expiry, alert_days: item.alert_days ?? 30, notes: item.notes });
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (editingItem) {
      await update({ id: editingItem.id, ...form } as any);
    } else {
      await create(form as any);
    }
    setDrawerOpen(false);
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Wifi className="h-8 w-8" />
          <p className="text-sm">Nenhum link de internet cadastrado</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Provedor</TableHead>
              <TableHead>Plano/Banda</TableHead>
              <TableHead>IP Público</TableHead>
              <TableHead>Vencimento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const expiry = daysUntil(item.contract_expiry);
              return (
                <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                  <>
                    <CollapsibleTrigger asChild>
                      <TableRow className="cursor-pointer hover:bg-muted/30">
                        <TableCell>{display(item.type)}</TableCell>
                        <TableCell>{display(item.provider)}</TableCell>
                        <TableCell>{display(item.plan_speed)}</TableCell>
                        <TableCell className="font-mono text-xs">{display(item.public_ip)}</TableCell>
                        <TableCell>
                          {item.contract_expiry ? (
                            <Badge variant={expiry.variant === "warning" ? "outline" : expiry.variant === "destructive" ? "destructive" : "secondary"} className="text-xs">
                              {expiry.text}
                            </Badge>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    </CollapsibleTrigger>
                    <CollapsibleContent asChild>
                      <TableRow className="bg-muted/20">
                        <TableCell colSpan={5}>
                          <div className="py-3 space-y-3">
                            <div className="grid gap-3 sm:grid-cols-3 text-sm">
                              <div><span className="text-xs text-muted-foreground">Tipo de link</span><p>{display(item.link_type)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Tel. suporte ISP</span><p>{display(item.support_phone)}</p></div>
                              <div><span className="text-xs text-muted-foreground">Alerta</span><p>{item.alert_days ? `${item.alert_days} dias antes` : "—"}</p></div>
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

      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar link</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar link" : "Novo link"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Tipo *</Label>
              <Select value={form.type || ""} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            </div>
            <div>
              <Label>Provedor *</Label>
              <Input value={form.provider || ""} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            </div>
            <div>
              <Label>Tipo de link</Label>
              <Select value={form.link_type || ""} onValueChange={(v) => setForm({ ...form, link_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{LINK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
            </div>
            <div>
              <Label>Plano / banda contratada</Label>
              <Input value={form.plan_speed || ""} onChange={(e) => setForm({ ...form, plan_speed: e.target.value })} placeholder="500MB down / 100MB up" />
            </div>
            <div>
              <Label>IP público</Label>
              <Input value={form.public_ip || ""} onChange={(e) => setForm({ ...form, public_ip: e.target.value })} />
            </div>
            <div>
              <Label>Telefone suporte ISP</Label>
              <Input value={form.support_phone || ""} onChange={(e) => setForm({ ...form, support_phone: e.target.value })} />
            </div>
            <div>
              <Label>Data vencimento contrato</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.contract_expiry && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.contract_expiry ? format(parseISO(form.contract_expiry), "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={form.contract_expiry ? parseISO(form.contract_expiry) : undefined} onSelect={(d) => setForm({ ...form, contract_expiry: d ? format(d, "yyyy-MM-dd") : null })} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Dias para alerta de vencimento</Label>
              <Input type="number" value={form.alert_days ?? 30} onChange={(e) => setForm({ ...form, alert_days: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.type || !form.provider}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir link" description="Tem certeza que deseja excluir este link de internet?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
