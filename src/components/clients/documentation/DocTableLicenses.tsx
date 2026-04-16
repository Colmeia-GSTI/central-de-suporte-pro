import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Plus, Pencil, Trash2, Key, Eye, EyeOff, Copy, X } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocCredentialOptions } from "@/hooks/useDocCredentialOptions";
import { daysUntil, display } from "@/lib/doc-utils";
import { toast } from "sonner";
import { addMonths, parseISO, differenceInDays, format } from "date-fns";

interface Props { clientId: string; }

const LICENSE_TYPES = [
  { value: "windows", label: "Windows" },
  { value: "office", label: "Office / Microsoft 365" },
  { value: "antivirus", label: "Antivírus" },
  { value: "other", label: "Outro" },
];

const TYPE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  LICENSE_TYPES.map(t => [t.value, t.label])
);

const WINDOWS_MODELS = ["OEM", "Retail", "Volume", "MAK", "KMS"];
const OFFICE_MODELS = ["Assinatura mensal", "Assinatura anual", "Perpétua", "OEM"];
const OTHER_MODELS = ["Perpétua", "Assinatura", "OEM", "Outro"];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAILS = 6;

interface LicenseRow {
  id: string;
  license_type: string | null;
  product_name: string | null;
  license_model: string | null;
  key: string | null;
  linked_device: string | null;
  linked_email: string | null;
  linked_emails: string[] | null;
  quantity_total: number | null;
  quantity_in_use: number | null;
  devices_covered: number | null;
  months_contracted: number | null;
  start_date: string | null;
  expiry_date: string | null;
  alert_days: number | null;
  cloud_console_url: string | null;
  credential_id: string | null;
  notes: string | null;
  [key: string]: unknown;
}

const EMPTY: Omit<LicenseRow, "id"> = {
  license_type: null, product_name: null, license_model: null, key: null,
  linked_device: null, linked_email: null, linked_emails: null,
  quantity_total: 1, quantity_in_use: null,
  devices_covered: null, months_contracted: null, start_date: null, expiry_date: null,
  alert_days: 30, cloud_console_url: null, credential_id: null, notes: null,
};

function isPerpetual(row: Omit<LicenseRow, "id">) {
  if (row.license_type === "windows") return true;
  if (row.license_type === "office" && row.license_model === "Perpétua") return true;
  if (row.license_type === "other" && row.license_model === "Perpétua") return true;
  return false;
}

function getExpiryBadge(row: LicenseRow) {
  if (isPerpetual(row)) return null;
  if (!row.expiry_date) return null;
  const info = daysUntil(row.expiry_date);
  if (info.variant === "default") return <Badge variant="outline" className="text-green-600 border-green-300 text-[10px]">OK</Badge>;
  return <Badge variant={info.variant as any} className="text-[10px]">{info.text}</Badge>;
}

function getAntivirusProgress(row: LicenseRow) {
  if (row.license_type !== "antivirus" || !row.start_date || !row.expiry_date) return null;
  const start = parseISO(row.start_date);
  const end = parseISO(row.expiry_date);
  const totalDays = differenceInDays(end, start);
  if (totalDays <= 0) return null;
  const elapsed = differenceInDays(new Date(), start);
  const pct = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
  const color = pct <= 70 ? "bg-green-500" : pct <= 90 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Progresso da licença</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <Progress value={pct} className="h-2 [&>div]:transition-all" style={{ "--progress-color": "currentColor" } as any}>
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%`, position: "absolute", top: 0, left: 0 }} />
      </Progress>
    </div>
  );
}

function getEmails(row: LicenseRow): string[] {
  if (row.linked_emails && row.linked_emails.length > 0) return row.linked_emails;
  if (row.linked_email) return [row.linked_email];
  return [];
}

export function DocTableLicenses({ clientId }: Props) {
  const { items, isLoading, create, update, remove, isMutating } = useDocTableCrud<LicenseRow>({ tableName: "doc_licenses", clientId });
  const { options: credOptions } = useDocCredentialOptions(clientId);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LicenseRow | null>(null);
  const [form, setForm] = useState<Omit<LicenseRow, "id">>(EMPTY);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  // Auto-calc expiry for antivirus
  useEffect(() => {
    if (form.license_type === "antivirus" && form.start_date && form.months_contracted) {
      const calc = addMonths(parseISO(form.start_date), form.months_contracted);
      setForm(f => ({ ...f, expiry_date: format(calc, "yyyy-MM-dd") }));
    }
  }, [form.start_date, form.months_contracted, form.license_type]);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setShowKey(false); setEmailInput(""); setDrawerOpen(true); };
  const openEdit = (item: LicenseRow) => {
    const emails = getEmails(item);
    setEditingItem(item);
    setForm({ ...EMPTY, ...item, linked_emails: emails.length > 0 ? emails : null });
    setShowKey(false);
    setEmailInput("");
    setDrawerOpen(true);
  };
  const handleSave = async () => { if (editingItem) await update({ id: editingItem.id, ...form } as any); else await create(form as any); setDrawerOpen(false); };

  const copyToClipboard = async (text: string | null) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast.success("Copiado"); } catch { toast.error("Erro ao copiar"); }
  };

  const addEmail = () => {
    const email = emailInput.trim();
    if (!email) return;
    if (!EMAIL_REGEX.test(email)) { toast.error("E-mail inválido"); return; }
    const current = form.linked_emails ?? [];
    if (current.length >= MAX_EMAILS) { toast.error(`Limite de ${MAX_EMAILS} e-mails`); return; }
    if (current.includes(email)) { toast.error("E-mail já adicionado"); return; }
    setForm({ ...form, linked_emails: [...current, email] });
    setEmailInput("");
  };

  const removeEmail = (email: string) => {
    const current = form.linked_emails ?? [];
    setForm({ ...form, linked_emails: current.filter(e => e !== email) });
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const modelOptions = form.license_type === "windows" ? WINDOWS_MODELS : form.license_type === "office" ? OFFICE_MODELS : OTHER_MODELS;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Key className="h-8 w-8" /><p className="text-sm">Nenhuma licença cadastrada</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead>Qtd</TableHead><TableHead>Vencimento</TableHead><TableHead>Alerta</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {items.map((item) => (
              <Collapsible key={item.id} open={expandedId === item.id} onOpenChange={(o) => setExpandedId(o ? item.id : null)} asChild>
                <>
                  <CollapsibleTrigger asChild>
                    <TableRow className="cursor-pointer hover:bg-muted/30">
                      <TableCell className="font-medium">{display(item.product_name)}</TableCell>
                      <TableCell>{TYPE_LABEL_MAP[item.license_type ?? ""] ?? display(item.license_type)}</TableCell>
                      <TableCell>{display(item.quantity_total ?? item.devices_covered)}</TableCell>
                      <TableCell>{isPerpetual(item) ? "Perpétua" : item.expiry_date ? format(parseISO(item.expiry_date), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell>{getExpiryBadge(item)}</TableCell>
                    </TableRow>
                  </CollapsibleTrigger>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/20">
                      <TableCell colSpan={5}>
                        <div className="py-3 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3 text-sm">
                            <div><span className="text-xs text-muted-foreground">Modelo</span><p>{display(item.license_model)}</p></div>
                            {item.linked_device && <div><span className="text-xs text-muted-foreground">Dispositivo</span><p>{item.linked_device}</p></div>}
                            {getEmails(item).length > 0 && (
                              <div>
                                <span className="text-xs text-muted-foreground">E-mails</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {getEmails(item).map(e => <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>)}
                                </div>
                              </div>
                            )}
                            {item.quantity_in_use != null && <div><span className="text-xs text-muted-foreground">Em uso</span><p>{item.quantity_in_use}</p></div>}
                            <div>
                              <span className="text-xs text-muted-foreground">Chave</span>
                              <div className="flex items-center gap-2">
                                <p className="font-mono">••••••••</p>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); copyToClipboard(item.key); }}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            {item.cloud_console_url && <div><span className="text-xs text-muted-foreground">Console</span><p className="truncate">{item.cloud_console_url}</p></div>}
                          </div>
                          {getAntivirusProgress(item)}
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

      <Button variant="outline" size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" />Adicionar licença</Button>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editingItem ? "Editar licença" : "Nova licença"}</SheetTitle></SheetHeader>
          <div className="space-y-4 mt-4">
            <div><Label>Tipo de licença *</Label>
              <Select value={form.license_type || ""} onValueChange={(v) => setForm({ ...EMPTY, license_type: v, product_name: form.product_name, notes: form.notes })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{LICENSE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nome do produto *</Label><Input value={form.product_name || ""} onChange={(e) => setForm({ ...form, product_name: e.target.value })} /></div>

            {/* Model select — not for antivirus */}
            {form.license_type && form.license_type !== "antivirus" && (
              <div><Label>Modelo</Label>
                <Select value={form.license_model || ""} onValueChange={(v) => setForm({ ...form, license_model: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{modelOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {/* Key */}
            <div>
              <Label>Chave / Serial</Label>
              <div className="relative">
                <Input type={showKey ? "text" : "password"} value={form.key || ""} onChange={(e) => setForm({ ...form, key: e.target.value })} className="pr-20" />
                <div className="absolute right-0 top-0 h-full flex">
                  <Button type="button" variant="ghost" size="icon" className="h-full w-10" onClick={() => copyToClipboard(form.key)}><Copy className="h-4 w-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" className="h-full w-10" onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                </div>
              </div>
            </div>

            {/* Windows-specific */}
            {form.license_type === "windows" && (<>
              <div><Label>Dispositivo vinculado</Label><Input value={form.linked_device || ""} onChange={(e) => setForm({ ...form, linked_device: e.target.value })} /></div>
              <div><Label>Quantidade</Label><Input type="number" value={form.quantity_total ?? ""} onChange={(e) => setForm({ ...form, quantity_total: Number(e.target.value) || null })} /></div>
              {(form.license_model === "Volume" || form.license_model === "MAK") && (
                <div><Label>Servidor KMS / MAK</Label><Input value={(form as any).kms_server || ""} onChange={(e) => setForm({ ...form, linked_device: e.target.value })} placeholder="Ex: kms.empresa.local" /></div>
              )}
            </>)}

            {/* Office/M365-specific */}
            {form.license_type === "office" && (<>
              <div>
                <Label>E-mails vinculados à Microsoft</Label>
                <div className="space-y-2">
                  {(form.linked_emails ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(form.linked_emails ?? []).map(email => (
                        <Badge key={email} variant="secondary" className="gap-1 text-xs">
                          {email}
                          <button type="button" onClick={() => removeEmail(email)} className="ml-1 hover:text-destructive" aria-label={`Remover ${email}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="usuario@outlook.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
                      disabled={(form.linked_emails ?? []).length >= MAX_EMAILS}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addEmail} disabled={(form.linked_emails ?? []).length >= MAX_EMAILS}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Para licenças individuais, adicione 1 e-mail. Para o Plano Família, adicione até 6 e-mails.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Qtd total</Label><Input type="number" value={form.quantity_total ?? ""} onChange={(e) => setForm({ ...form, quantity_total: Number(e.target.value) || null })} /></div>
                <div><Label>Qtd em uso</Label><Input type="number" value={form.quantity_in_use ?? ""} onChange={(e) => setForm({ ...form, quantity_in_use: Number(e.target.value) || null })} /></div>
              </div>
              <div><Label>Data de início</Label><Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              {form.license_model !== "Perpétua" && (
                <div><Label>Data de vencimento</Label><Input type="date" value={form.expiry_date || ""} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
              )}
              <div><Label>Dias para alerta</Label><Input type="number" value={form.alert_days ?? 60} onChange={(e) => setForm({ ...form, alert_days: Number(e.target.value) || 60 })} /></div>
            </>)}

            {/* Antivirus-specific */}
            {form.license_type === "antivirus" && (<>
              <div><Label>Dispositivos cobertos</Label><Input type="number" value={form.devices_covered ?? ""} onChange={(e) => setForm({ ...form, devices_covered: Number(e.target.value) || null })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data de início *</Label><Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
                <div><Label>Meses contratados</Label><Input type="number" value={form.months_contracted ?? ""} onChange={(e) => setForm({ ...form, months_contracted: Number(e.target.value) || null })} /></div>
              </div>
              <div>
                <Label className="text-muted-foreground">Data de vencimento (calculado automaticamente)</Label>
                {form.start_date && form.months_contracted ? (
                  <Input type="date" value={form.expiry_date || ""} readOnly disabled className="text-muted-foreground bg-muted/50" />
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">—</p>
                )}
              </div>
              <div><Label>Dias para alerta</Label><Input type="number" value={form.alert_days ?? 30} onChange={(e) => setForm({ ...form, alert_days: Number(e.target.value) || 30 })} /></div>
              <div><Label>URL console cloud</Label><Input value={form.cloud_console_url || ""} onChange={(e) => setForm({ ...form, cloud_console_url: e.target.value })} /></div>
              <div><Label>Credencial do console</Label>
                <Select value={form.credential_id || ""} onValueChange={(v) => setForm({ ...form, credential_id: v || null })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{credOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </>)}

            {/* Other-specific */}
            {form.license_type === "other" && (<>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Qtd total</Label><Input type="number" value={form.quantity_total ?? ""} onChange={(e) => setForm({ ...form, quantity_total: Number(e.target.value) || null })} /></div>
                <div><Label>Qtd em uso</Label><Input type="number" value={form.quantity_in_use ?? ""} onChange={(e) => setForm({ ...form, quantity_in_use: Number(e.target.value) || null })} /></div>
              </div>
              <div><Label>Data de início</Label><Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>Data de vencimento</Label><Input type="date" value={form.expiry_date || ""} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
              <div><Label>Dias para alerta</Label><Input type="number" value={form.alert_days ?? 30} onChange={(e) => setForm({ ...form, alert_days: Number(e.target.value) || 30 })} /></div>
            </>)}

            <div><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)} disabled={isMutating}>Cancelar</Button>
              <Button onClick={handleSave} disabled={isMutating || !form.license_type || !form.product_name}>{isMutating ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)} title="Excluir licença" description="Tem certeza que deseja excluir esta licença?" confirmLabel="Excluir" variant="destructive" onConfirm={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } }} isLoading={isMutating} />
    </div>
  );
}
