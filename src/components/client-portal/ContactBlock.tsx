import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormLabel } from "@/components/ui/form";
import { Phone, UserPlus } from "lucide-react";
import { formatPhone, stripPhone } from "@/lib/phone";

export interface ContactBlockValue {
  phone: string;
  is_whatsapp: boolean;
  for_someone_else: boolean;
}

interface Props {
  contactName: string;
  defaultPhone: string | null;
  defaultIsWhatsapp: boolean;
  value: ContactBlockValue;
  onChange: (v: ContactBlockValue) => void;
}

export function ContactBlock({
  contactName, defaultPhone, defaultIsWhatsapp, value, onChange,
}: Props) {
  const formattedDefault = defaultPhone ? formatPhone(defaultPhone) : "";

  // Se não há telefone padrão, força modo "outra pessoa" e mantém valores limpos
  useEffect(() => {
    if (!defaultPhone && !value.for_someone_else) {
      onChange({ ...value, for_someone_else: true });
    }
  }, [defaultPhone]); // eslint-disable-line react-hooks/exhaustive-deps

  const setSelf = () => {
    if (!defaultPhone) return; // sem telefone padrão, não pode ser "você"
    onChange({
      phone: formattedDefault,
      is_whatsapp: defaultIsWhatsapp,
      for_someone_else: false,
    });
  };

  const setOther = () => {
    onChange({
      phone: value.for_someone_else ? value.phone : "",
      is_whatsapp: false,
      for_someone_else: true,
    });
  };

  const isSelf = !value.for_someone_else;
  const lockedFields = isSelf;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Phone className="h-4 w-4 text-muted-foreground" />
        Contato para retorno
      </div>

      {defaultPhone && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={setSelf}
            className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-xs transition-all ${
              isSelf
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "bg-card border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <span className="font-semibold">Falar com você</span>
            <span className="opacity-70">{contactName} · {formattedDefault}</span>
          </button>
          <button
            type="button"
            onClick={setOther}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition-all ${
              !isSelf
                ? "border-primary bg-primary/10 text-primary font-medium"
                : "bg-card border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="font-semibold">Outra pessoa</span>
          </button>
        </div>
      )}

      {!defaultPhone && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Seu contato não tem telefone cadastrado. Informe um número para retorno.
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="contact_phone_input" className="text-xs">
          Telefone {!lockedFields && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="contact_phone_input"
          placeholder="(00) 00000-0000"
          inputMode="tel"
          maxLength={15}
          value={value.phone}
          disabled={lockedFields}
          onChange={(e) => onChange({ ...value, phone: formatPhone(e.target.value) })}
        />

        <div className="flex items-center justify-between pt-1">
          <Label htmlFor="contact_is_whatsapp" className="cursor-pointer text-xs font-normal">
            Este número tem WhatsApp?
          </Label>
          <Switch
            id="contact_is_whatsapp"
            checked={value.is_whatsapp}
            onCheckedChange={(v) => onChange({ ...value, is_whatsapp: v })}
            disabled={lockedFields}
          />
        </div>
      </div>
    </div>
  );
}

export function isContactBlockValid(v: ContactBlockValue): boolean {
  return /^\d{10,11}$/.test(stripPhone(v.phone));
}
