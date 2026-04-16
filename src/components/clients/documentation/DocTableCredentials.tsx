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
import { Plus, Pencil, Trash2, Lock, Eye, EyeOff, Copy } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { display } from "@/lib/doc-utils";
import { toast } from "sonner";

interface Props { clientId: string; }

const ACCESS_TYPES = ["RDP", "SSH", "VPN", "Admin local", "Painel web", "E-mail admin", "SSO / E-mail", "Nuvem", "ERP", "NVR", "Outro"];

interface CredRow {
  id: string;
  access_type: string | null;
  system_name: string | null;
  username: string | null;
  password_encrypted: string | null;
  url: string | null;
  port: string | null;
  mfa_enabled: boolean | null;
  mfa_type: string | null;
  mfa_backup_code: string | null;
  notes: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<CredRow, "id"> = {
  access_type: null, system_name: null, username: null, password_encrypted: null,
  url: null, port: null, mfa_enabled: false, mfa_type: null, mfa_backup_code: null, notes: null,
};

export function DocTableCredentials({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<CredRow>({ tableName: "doc_credentials", clientId });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CredRow | null>(null);
  const [form, setForm] = useState<Omit<CredRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setShowPassword(false); setDrawerOpen(true); };
  const openEdit = (item: CredRow) => { setEditingItem(item); setForm({ ...EMPTY, ...item }); setShowPassword(false); setDrawerOpen(true); };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  const copyToClipboard = async (text: string | null) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast.success("Copiado para a área de transferência"); }
    catch { toast.error("Erro ao copiar"); }
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Lock className="h-8 w-8" /><p className="text-sm">Nenhuma credencial cadastrada</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Sistema</TableHead><TableHead>Usuário</TableHead><TableHead>MFA</TableHead><TableHead>Obs</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell>{display(item.access_type)}</TableCell>
                      <TableCell className="font-medium">{display(item.system_name)}</TableCell>
                      <TableCell>{display(item.username)}</TableCell>
                      <TableCell>{item.mfa_enabled ? "Sim" : "Não"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{display(item.notes)}</TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            <div><span className="text-xs text-muted-foreground">URL / IP</span><p>{display(item.url)}</p></div>
                            <div><span className="text-xs text-muted-foreground">Porta</span><p>{display(item.port)}</p></div>
                            <div>
                              <span className="text-xs text-muted-foreground">Senha</span>
                              <div className="flex items-center gap-2">
                                <p className="font-mono">••••••••</p>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); copyToClipboard(item.password_encrypted); }}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {item.mfa_enabled && <div><span className="text-xs text-muted-foreground">Tipo MFA</span><p>{display(item.mfa_type)}</p></div>}
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

      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar credencial</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar credencial" : "Nova credencial"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Tipo de acesso *</Label><Select value={form.access_type || ""} onValueChange={(v) => setForm({ ...form, access_type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{ACCESS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Sistema / Dispositivo *</Label><Input value={form.system_name || ""} onChange={(e) => setForm({ ...form, system_name: e.target.value })} /></div>
            <div><Label>Usuário</Label><Input value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div>
              <Label>Senha</Label>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} value={form.password_encrypted || ""} onChange={(e) => setForm({ ...form, password_encrypted: e.target.value })} className="pr-10" />
                <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div><Label>URL / IP de acesso</Label><Input value={form.url || ""} onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
            <div><Label>Porta</Label><Input value={form.port || ""} onChange={(e) => setForm({ ...form, port: e.target.value })} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={!!form.mfa_enabled} onCheckedChange={(v) => setForm({ ...form, mfa_enabled: v, mfa_type: v ? form.mfa_type : null, mfa_backup_code: v ? form.mfa_backup_code : null })} />
              <Label>MFA ativo</Label>
            </div>
            {form.mfa_enabled && (<>
              <div><Label>Tipo de MFA</Label><Input value={form.mfa_type || ""} onChange={(e) => setForm({ ...form, mfa_type: e.target.value })} /></div>
              <div>
                <Label>Código backup MFA</Label>
                <Input type="password" value={form.mfa_backup_code || ""} onChange={(e) => setForm({ ...form, mfa_backup_code: e.target.value })} />
              </div>
            </>)}
            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.access_type || !form.system_name}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir credencial" description="Tem certeza que deseja excluir esta credencial?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
