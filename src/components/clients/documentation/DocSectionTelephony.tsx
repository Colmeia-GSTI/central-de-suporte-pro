import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Pencil, Save, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocSection } from "@/hooks/useDocSection";
import { DocTableInternetLinks } from "./DocTableInternetLinks";

interface Props { clientId: string; }
const TELEPHONY_TYPES = ["PABX", "VoIP", "Ramal nuvem", "Não tem"];

interface TelephonyData {
  type: string | null;
  provider: string | null;
  extensions_count: number | null;
  support_phone: string | null;
  notes: string | null;
}

const EMPTY: TelephonyData = { type: null, provider: null, extensions_count: null, support_phone: null, notes: null };

export function DocSectionTelephony({ clientId }: Props) {
  const { data, isLoading, save, isSaving } = useDocSection<TelephonyData>("doc_telephony", clientId);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<TelephonyData>(EMPTY);

  const startEditing = () => { setForm({ ...EMPTY, ...data }); setIsEditing(true); };
  const handleSave = async () => { try { await save(form as any); setIsEditing(false); } catch { /* handled */ } };

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const d = data || EMPTY;
  const display = (v: string | number | null | undefined) => (v != null && v !== "") ? String(v) : "—";

  return (
    <div className="space-y-6">
      {/* Links de Internet */}
      <div>
        <Separator className="mb-3" />
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Links de Internet</p>
        <DocTableInternetLinks clientId={clientId} />
      </div>

      {/* Telephony Section */}
      <div>
        <Separator className="mb-3" />
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Telefonia / VoIP</p>
        {!isEditing ? (
          <div className="space-y-4">
            <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={startEditing}><Pencil className="h-4 w-4 mr-1" /> Editar</Button></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo" value={display(d.type)} />
              <Field label="Fornecedor / Sistema" value={display(d.provider)} />
              <Field label="Quantidade de ramais" value={display(d.extensions_count)} />
              <Field label="Telefone suporte fornecedor" value={display(d.support_phone)} />
            </div>
            {d.notes ? (<div><p className="text-xs text-muted-foreground mb-0.5">Observações</p><p className="text-sm font-medium whitespace-pre-wrap">{d.notes}</p></div>) : (<Field label="Observações" value="—" />)}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Tipo</Label><Select value={form.type || ""} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{TELEPHONY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Fornecedor / Sistema</Label><Input value={form.provider || ""} onChange={(e) => setForm({ ...form, provider: e.target.value })} /></div>
              <div><Label>Quantidade de ramais</Label><Input type="number" value={form.extensions_count ?? ""} onChange={(e) => setForm({ ...form, extensions_count: e.target.value ? Number(e.target.value) : null })} /></div>
              <div><Label>Telefone suporte fornecedor</Label><Input value={form.support_phone || ""} onChange={(e) => setForm({ ...form, support_phone: e.target.value })} /></div>
              <div className="sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}><X className="h-4 w-4 mr-1" /> Cancelar</Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}><Save className="h-4 w-4 mr-1" /> {isSaving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (<div><p className="text-xs text-muted-foreground mb-0.5">{label}</p><p className="text-sm font-medium">{value}</p></div>);
}
