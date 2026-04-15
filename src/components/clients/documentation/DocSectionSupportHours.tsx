import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Pencil, Save, X, Construction } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocSection } from "@/hooks/useDocSection";

interface Props {
  clientId: string;
}

interface SupportHoursData {
  business_hours: string | null;
  has_oncall: boolean | null;
  oncall_phone: string | null;
  sla_critical: string | null;
  sla_normal: string | null;
  notes: string | null;
}

const EMPTY: SupportHoursData = {
  business_hours: null, has_oncall: false, oncall_phone: null,
  sla_critical: null, sla_normal: null, notes: null,
};

export function DocSectionSupportHours({ clientId }: Props) {
  const { data, isLoading, save, isSaving } = useDocSection<SupportHoursData>("doc_support_hours", clientId);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<SupportHoursData>(EMPTY);

  const startEditing = () => {
    setForm({ ...EMPTY, ...data });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      await save(form as any);
      setIsEditing(false);
    } catch { /* handled */ }
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const d = data || EMPTY;
  const display = (v: string | null | undefined) => v || "—";

  return (
    <div className="space-y-6">
      {/* Support Hours */}
      <div>
        <Separator className="mb-3" />
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Horários e SLA</p>

        {!isEditing ? (
          <div className="space-y-4">
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-1" /> Editar
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Horário de atendimento" value={display(d.business_hours)} />
              <Field label="Possui plantão / emergência" value={d.has_oncall ? "Sim" : "Não"} />
              {d.has_oncall && <Field label="Telefone de plantão" value={display(d.oncall_phone)} />}
              <Field label="SLA crítico" value={display(d.sla_critical)} />
              <Field label="SLA normal" value={display(d.sla_normal)} />
            </div>
            {d.notes ? (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Observações</p>
                <p className="text-sm font-medium whitespace-pre-wrap">{d.notes}</p>
              </div>
            ) : (
              <Field label="Observações" value="—" />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Horário de atendimento</Label>
                <Input value={form.business_hours || ""} onChange={(e) => setForm({ ...form, business_hours: e.target.value })} placeholder="Seg–Sex 8h–18h" />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch checked={!!form.has_oncall} onCheckedChange={(v) => setForm({ ...form, has_oncall: v, oncall_phone: v ? form.oncall_phone : null })} />
                <Label>Possui plantão / emergência</Label>
              </div>
              <div className={`transition-all duration-200 ${form.has_oncall ? "opacity-100" : "opacity-0 h-0 overflow-hidden"}`}>
                <Label>Telefone de plantão</Label>
                <Input value={form.oncall_phone || ""} onChange={(e) => setForm({ ...form, oncall_phone: e.target.value })} />
              </div>
              <div>
                <Label>SLA crítico</Label>
                <Input value={form.sla_critical || ""} onChange={(e) => setForm({ ...form, sla_critical: e.target.value })} placeholder="2 horas" />
              </div>
              <div>
                <Label>SLA normal</Label>
                <Input value={form.sla_normal || ""} onChange={(e) => setForm({ ...form, sla_normal: e.target.value })} placeholder="8 horas" />
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={isSaving}>
                <X className="h-4 w-4 mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                <Save className="h-4 w-4 mr-1" /> {isSaving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Contacts placeholder */}
      <div>
        <Separator className="mb-3" />
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-4">Contatos</p>
        <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground py-6">
          <Construction className="h-8 w-8" />
          <p className="text-sm">[Tabela de contatos em construção]</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
