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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Pencil, Trash2, ClipboardList, CalendarIcon } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { display } from "@/lib/doc-utils";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Props { clientId: string; }

const FREQUENCIES = ["Diária", "Semanal", "Quinzenal", "Mensal", "Trimestral", "Sob demanda"];

interface RoutineRow {
  id: string;
  name: string | null;
  frequency: string | null;
  responsible: string | null;
  procedure: string | null;
  last_executed: string | null;
  notes: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<RoutineRow, "id"> = {
  name: null, frequency: null, responsible: null, procedure: null, last_executed: null, notes: null,
};

export function DocTableRoutines({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<RoutineRow>({ tableName: "doc_routines", clientId });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RoutineRow | null>(null);
  const [form, setForm] = useState<Omit<RoutineRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setDrawerOpen(true); };
  const openEdit = (item: RoutineRow) => { setEditingItem(item); setForm({ ...EMPTY, ...item }); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <ClipboardList className="h-8 w-8" /><p className="text-sm">Nenhuma rotina cadastrada</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Rotina</TableHead><TableHead>Frequência</TableHead><TableHead>Responsável</TableHead><TableHead>Última execução</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">{display(item.name)}</TableCell>
                      <TableCell>{display(item.frequency)}</TableCell>
                      <TableCell>{display(item.responsible)}</TableCell>
                      <TableCell>{item.last_executed ? format(parseISO(item.last_executed), "dd/MM/yyyy") : "—"}</TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={4}>
                        <div className="py-3 space-y-3">
                          {item.procedure && <div><span className="text-xs text-muted-foreground">Procedimento</span><p className="text-sm whitespace-pre-wrap">{item.procedure}</p></div>}
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

      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar rotina</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar rotina" : "Nova rotina"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Nome da rotina *</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Frequência *</Label><Select value={form.frequency || ""} onValueChange={(v) => setForm({ ...form, frequency: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Responsável</Label><Input value={form.responsible || ""} onChange={(e) => setForm({ ...form, responsible: e.target.value })} /></div>
            <div><Label>Procedimento</Label><Textarea value={form.procedure || ""} onChange={(e) => setForm({ ...form, procedure: e.target.value })} rows={8} placeholder="Passo a passo..." /></div>
            <div>
              <Label>Última execução</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.last_executed && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />{form.last_executed ? format(parseISO(form.last_executed), "dd/MM/yyyy") : "Selecione"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={form.last_executed ? parseISO(form.last_executed) : undefined} onSelect={(d) => setForm({ ...form, last_executed: d ? format(d, "yyyy-MM-dd") : null })} className="p-3 pointer-events-auto" /></PopoverContent>
              </Popover>
            </div>
            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.name || !form.frequency}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir rotina" description="Tem certeza que deseja excluir esta rotina?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
