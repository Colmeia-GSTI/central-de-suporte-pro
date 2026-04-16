import { useState, useEffect, useMemo } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Key, Eye, EyeOff, Copy, X, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useDocTableCrud } from "@/hooks/useDocTableCrud";
import { useDocCredentialOptions } from "@/hooks/useDocCredentialOptions";
import { daysUntil, display } from "@/lib/doc-utils";
import { toast } from "sonner";
import { addMonths, parseISO, differenceInDays, format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

const CRED_ACCESS_TYPES = ["RDP", "SSH", "VPN", "Admin local", "Painel web", "E-mail admin", "SSO / E-mail", "Nuvem", "ERP", "NVR", "Outro"];

interface LicenseRow {
  id: string;
  license_type: string | null;
  product_name: string | null;
  license_model: string | null;
  key: string | null;
  key_activated: boolean | null;
  key_activated_at: string | null;
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
  key_activated: true, key_activated_at: null,
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
  if (row.key_activated === false) return <Badge variant="secondary" className="text-[10px]">Não ativada</Badge>;
  if (isPerpetual(row)) return null;
  if (!row.expiry_date) return null;
  const info = daysUntil(row.expiry_date);
  if (info.variant === "default") return <Badge variant="outline" className="text-green-600 border-green-300 text-[10px]">OK</Badge>;
  return <Badge variant={info.variant as any} className="text-[10px]">{info.text}</Badge>;
}

function getAntivirusProgress(row: LicenseRow) {
  if (row.license_type !== "antivirus" || !row.start_date || !row.expiry_date) return null;
  if (row.key_activated === false) return null;
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

// --- Inline credential mini-form ---
interface InlineCredFormState {
  access_type: string;
  system_name: string;
  username: string;
  password_encrypted: string;
  notes: string;
}

const INLINE_CRED_EMPTY: InlineCredFormState = {
  access_type: "", system_name: "", username: "", password_encrypted: "", notes: "",
};

function InlineCredentialForm({ clientId, onCreated, onCancel }: {
  clientId: string;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<InlineCredFormState>(INLINE_CRED_EMPTY);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const isSso = form.access_type === "SSO / E-mail";

  const handleSave = async () => {
    if (!form.access_type || !form.system_name) {
      toast.error("Preencha tipo e nome do sistema");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        client_id: clientId,
        access_type: form.access_type,
        system_name: form.system_name,
        username: form.username || null,
        password_encrypted: isSso ? null : (form.password_encrypted || null),
        notes: form.notes || null,
      };
      const { data, error } = await (supabase.from("doc_credentials") as any)
        .insert(payload).select("id").single();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["doc_credentials_options", clientId] });
      toast.success("Credencial criada");
      onCreated(data.id);
    } catch (e: any) {
      toast.error("Erro ao criar credencial: " + (e.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground">Nova credencial rápida</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Tipo de acesso *</Label>
          <Select value={form.access_type} onValueChange={(v) => setForm({ ...form, access_type: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{CRED_ACCESS_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Sistema / Nome *</Label>
          <Input className="h-8 text-xs" value={form.system_name} onChange={(e) => setForm({ ...form, system_name: e.target.value })} />
        </div>
      </div>
      <div>
        <Label className="text-xs">{isSso ? "E-mail SSO" : "Usuário / E-mail"}</Label>
        <Input className="h-8 text-xs" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      </div>
      {isSso ? (
        <p className="text-xs text-muted-foreground italic">Autenticação via SSO — nenhuma senha armazenada</p>
      ) : (
        <div>
          <Label className="text-xs">Senha</Label>
          <Input type="password" className="h-8 text-xs" value={form.password_encrypted} onChange={(e) => setForm({ ...form, password_encrypted: e.target.value })} />
        </div>
      )}
      <div>
        <Label className="text-xs">Observações</Label>
        <Input className="h-8 text-xs" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving || !form.access_type || !form.system_name}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Salvar credencial
        </Button>
      </div>
    </div>
  );
}

// --- Product Name Combobox ---
function ProductNameCombobox({ value, onChange, clientId }: {
  value: string;
  onChange: (v: string) => void;
  clientId: string;
}) {
  const [open, setOpen] = useState(false);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["doc-license-products", clientId],
    queryFn: async () => {
      const { data } = await (supabase.from("doc_licenses") as any)
        .select("product_name")
        .eq("client_id", clientId)
        .not("product_name", "is", null)
        .order("product_name");
      return [...new Set((data ?? []).map((r: any) => r.product_name).filter(Boolean))] as string[];
    },
    staleTime: 5 * 60 * 1000,
  });

  // If no suggestions, render plain input
  if (suggestions.length === 0) {
    return <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Nome do produto" />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal h-10">
          {value || "Nome do produto"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Buscar ou digitar novo..."
            value={value}
            onValueChange={onChange}
          />
          <CommandList>
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">Nenhum produto encontrado — o texto digitado será usado</span>
            </CommandEmpty>
            <CommandGroup>
              {suggestions.filter(s => s.toLowerCase().includes((value || "").toLowerCase())).map(s => (
                <CommandItem key={s} value={s} onSelect={() => { onChange(s); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === s ? "opacity-100" : "opacity-0")} />
                  {s}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// --- Main component ---
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
  const [showInlineCred, setShowInlineCred] = useState(false);

  // Auto-calc expiry for antivirus when key is activated
  useEffect(() => {
    if (form.license_type === "antivirus" && form.start_date && form.months_contracted && form.key_activated !== false) {
      const calc = addMonths(parseISO(form.start_date), form.months_contracted);
      setForm(f => ({ ...f, expiry_date: format(calc, "yyyy-MM-dd") }));
    }
  }, [form.start_date, form.months_contracted, form.license_type, form.key_activated]);

  const openNew = () => { setEditingItem(null); setForm({ ...EMPTY }); setShowKey(false); setEmailInput(""); setShowInlineCred(false); setDrawerOpen(true); };
  const openEdit = (item: LicenseRow) => {
    const emails = getEmails(item);
    setEditingItem(item);
    setForm({ ...EMPTY, ...item, linked_emails: emails.length > 0 ? emails : null });
    setShowKey(false);
    setEmailInput("");
    setShowInlineCred(false);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    // Always null out legacy linked_email, use linked_emails only
    const payload = { ...form, linked_email: null };

    // If key not activated, clear date fields
    if (payload.key_activated === false) {
      payload.start_date = null;
      payload.expiry_date = null;
      payload.key_activated_at = null;
    }

    if (editingItem) await update({ id: editingItem.id, ...payload } as any);
    else await create(payload as any);
    setDrawerOpen(false);
  };

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

  const notActivated = form.key_activated === false;

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const modelOptions = form.license_type === "windows" ? WINDOWS_MODELS : form.license_type === "office" ? OFFICE_MODELS : OTHER_MODELS;

  // Credential select section (reused in antivirus and other)
  const credentialSection = (
    <div className="space-y-2">
      <Label>Credencial do console</Label>
      <Select value={form.credential_id || ""} onValueChange={(v) => setForm({ ...form, credential_id: v || null })}>
        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
        <SelectContent>{credOptions.map(o => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
      {!showInlineCred ? (
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowInlineCred(true)}>
          <Plus className="h-3 w-3 mr-1" />Cadastrar nova credencial
        </Button>
      ) : (
        <InlineCredentialForm
          clientId={clientId}
          onCreated={(id) => {
            setForm({ ...form, credential_id: id });
            setShowInlineCred(false);
          }}
          onCancel={() => setShowInlineCred(false)}
        />
      )}
    </div>
  );

  // Key activation toggle (shown for all license types that have a key field)
  const keyActivationToggle = (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
      <Switch
        checked={notActivated}
        onCheckedChange={(checked) => setForm({ ...form, key_activated: !checked })}
      />
      <div>
        <Label className="text-sm cursor-pointer">Chave ainda não ativada</Label>
        <p className="text-xs text-muted-foreground">A chave foi comprada mas ainda não foi utilizada/ativada</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Key className="h-8 w-8" /><p className="text-sm">Nenhuma licença cadastrada</p>
        </div>
      ) : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead>Qtd</TableHead><TableHead>Vencimento</TableHead><TableHead>Status</TableHead>
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
                      <TableCell>{item.key_activated === false ? "—" : isPerpetual(item) ? "Perpétua" : item.expiry_date ? format(parseISO(item.expiry_date), "dd/MM/yyyy") : "—"}</TableCell>
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
            <div>
              <Label>Nome do produto *</Label>
              <ProductNameCombobox value={form.product_name || ""} onChange={(v) => setForm({ ...form, product_name: v })} clientId={clientId} />
            </div>

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

            {/* Key activation toggle */}
            {keyActivationToggle}

            {/* Windows-specific */}
            {form.license_type === "windows" && (<>
              <div><Label>Dispositivo vinculado</Label><Input value={form.linked_device || ""} onChange={(e) => setForm({ ...form, linked_device: e.target.value })} /></div>
              <div><Label>Quantidade</Label><Input type="number" value={form.quantity_total ?? ""} onChange={(e) => setForm({ ...form, quantity_total: Number(e.target.value) || null })} /></div>
              {(form.license_model === "Volume" || form.license_model === "MAK") && (
                <div><Label>Servidor KMS / MAK</Label><Input value={form.linked_device || ""} onChange={(e) => setForm({ ...form, linked_device: e.target.value })} placeholder="Ex: kms.empresa.local" /></div>
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
              <div>
                <Label>Data de início</Label>
                <Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} disabled={notActivated} placeholder={notActivated ? "— (não ativada)" : undefined} />
              </div>
              {form.license_model !== "Perpétua" && (
                <div>
                  <Label>Data de vencimento</Label>
                  {notActivated ? (
                    <p className="text-sm text-muted-foreground mt-1 italic">Será calculado ao ativar</p>
                  ) : (
                    <Input type="date" value={form.expiry_date || ""} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
                  )}
                </div>
              )}
              <div><Label>Dias para alerta</Label><Input type="number" value={form.alert_days ?? 60} onChange={(e) => setForm({ ...form, alert_days: Number(e.target.value) || 60 })} /></div>
            </>)}

            {/* Antivirus-specific */}
            {form.license_type === "antivirus" && (<>
              <div><Label>Dispositivos cobertos</Label><Input type="number" value={form.devices_covered ?? ""} onChange={(e) => setForm({ ...form, devices_covered: Number(e.target.value) || null })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Data de início *</Label>
                  <Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} disabled={notActivated} placeholder={notActivated ? "— (não ativada)" : undefined} />
                </div>
                <div><Label>Meses contratados</Label><Input type="number" value={form.months_contracted ?? ""} onChange={(e) => setForm({ ...form, months_contracted: Number(e.target.value) || null })} /></div>
              </div>
              <div>
                <Label className="text-muted-foreground">Data de vencimento (calculado automaticamente)</Label>
                {notActivated ? (
                  <p className="text-sm text-muted-foreground mt-1 italic">Será calculado ao ativar</p>
                ) : form.start_date && form.months_contracted ? (
                  <Input type="date" value={form.expiry_date || ""} readOnly disabled className="text-muted-foreground bg-muted/50" />
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">—</p>
                )}
              </div>
              <div><Label>Dias para alerta</Label><Input type="number" value={form.alert_days ?? 30} onChange={(e) => setForm({ ...form, alert_days: Number(e.target.value) || 30 })} /></div>
              <div><Label>URL console cloud</Label><Input value={form.cloud_console_url || ""} onChange={(e) => setForm({ ...form, cloud_console_url: e.target.value })} /></div>
              {credentialSection}
            </>)}

            {/* Other-specific */}
            {form.license_type === "other" && (<>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Qtd total</Label><Input type="number" value={form.quantity_total ?? ""} onChange={(e) => setForm({ ...form, quantity_total: Number(e.target.value) || null })} /></div>
                <div><Label>Qtd em uso</Label><Input type="number" value={form.quantity_in_use ?? ""} onChange={(e) => setForm({ ...form, quantity_in_use: Number(e.target.value) || null })} /></div>
              </div>
              <div>
                <Label>Data de início</Label>
                <Input type="date" value={form.start_date || ""} onChange={(e) => setForm({ ...form, start_date: e.target.value })} disabled={notActivated} placeholder={notActivated ? "— (não ativada)" : undefined} />
              </div>
              <div>
                <Label>Data de vencimento</Label>
                {notActivated ? (
                  <p className="text-sm text-muted-foreground mt-1 italic">Será calculado ao ativar</p>
                ) : (
                  <Input type="date" value={form.expiry_date || ""} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
                )}
              </div>
              <div><Label>Dias para alerta</Label><Input type="number" value={form.alert_days ?? 30} onChange={(e) => setForm({ ...form, alert_days: Number(e.target.value) || 30 })} /></div>
              {credentialSection}
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
