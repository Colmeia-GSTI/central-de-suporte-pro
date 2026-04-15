import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Save, X } from "lucide-react";
import { useClientUpdate } from "@/hooks/useDocSection";
import type { Tables } from "@/integrations/supabase/types";

type Client = Tables<"clients">;

interface Props {
  client: Client;
  clientId: string;
}

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function DocSectionClientInfo({ client, clientId }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const { save, isSaving } = useClientUpdate(clientId);
  const [form, setForm] = useState({
    name: client.name || "",
    trade_name: client.trade_name || "",
    document: client.document || "",
    address: client.address || "",
    phone: client.phone || "",
    whatsapp: client.whatsapp || "",
    email: client.email || "",
    notes: client.notes || "",
  });

  const startEditing = () => {
    setForm({
      name: client.name || "",
      trade_name: client.trade_name || "",
      document: client.document || "",
      address: client.address || "",
      phone: client.phone || "",
      whatsapp: client.whatsapp || "",
      email: client.email || "",
      notes: client.notes || "",
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      await save(form);
      setIsEditing(false);
    } catch {
      // error handled in hook
    }
  };

  const displayVal = (value: string | null | undefined) => value || "—";

  if (!isEditing) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Razão Social" value={displayVal(client.name)} />
          <Field label="Nome Fantasia" value={displayVal(client.trade_name)} />
          <Field label="CNPJ / CPF" value={displayVal(client.document)} />
          <Field label="Endereço" value={displayVal(client.address)} />
          <Field label="Telefone" value={displayVal(client.phone)} />
          <Field label="WhatsApp" value={displayVal(client.whatsapp)} />
          <Field label="E-mail" value={displayVal(client.email)} />
          
        </div>
        {(client.notes) && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Observações gerais</p>
            <p className="text-sm font-medium whitespace-pre-wrap">{client.notes}</p>
          </div>
        )}
        {!client.notes && (
          <Field label="Observações gerais" value="—" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Razão Social</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <Label>Nome Fantasia</Label>
          <Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />
        </div>
        <div>
          <Label>CNPJ / CPF</Label>
          <Input
            value={form.document}
            onChange={(e) => setForm({ ...form, document: formatCnpj(e.target.value) })}
            placeholder="00.000.000/0000-00"
          />
        </div>
        <div>
          <Label>Endereço</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div>
          <Label>Telefone</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <Label>WhatsApp</Label>
          <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>E-mail</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Label>Observações gerais</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
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
