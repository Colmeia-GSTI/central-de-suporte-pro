import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Pencil, Save, X, Info } from "lucide-react";
import { Field } from "./shared/Field";
import { display } from "@/lib/doc-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocSection } from "@/hooks/useDocSection";
import { useClientBranchOptions } from "@/hooks/useClientBranchOptions";

interface Props {
  clientId: string;
}

const SERVER_TYPES = ["Local", "VPS", "Nuvem", "Híbrido", "Não tem"];
const FILE_SERVER_OPTIONS = ["Local", "Nextcloud", "Synology", "Google Drive", "OneDrive", "Não tem"];
const AD_OPTIONS = ["Sim", "Não"];

interface InfraData {
  server_type: string | null;
  cloud_provider: string | null;
  file_server: string | null;
  active_directory: string | null;
  ad_location: string | null;
  general_notes: string | null;
  unifi_console_model: string | null;
  unifi_console_ip: string | null;
  unifi_firmware: string | null;
  unifi_uptime: string | null;
  gateway_model: string | null;
  gateway_wan_ip: string | null;
  gateway_lan_ip: string | null;
  gateway_firmware: string | null;
}

const EMPTY: InfraData = {
  server_type: null, cloud_provider: null, file_server: null,
  active_directory: null, ad_location: null, general_notes: null,
  unifi_console_model: null, unifi_console_ip: null, unifi_firmware: null, unifi_uptime: null,
  gateway_model: null, gateway_wan_ip: null, gateway_lan_ip: null, gateway_firmware: null,
};

export function DocSectionInfrastructure({ clientId }: Props) {
  const { data, isLoading, save, isSaving } = useDocSection<InfraData>("doc_infrastructure", clientId);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<InfraData>(EMPTY);

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
  const showCloud = ["VPS", "Nuvem", "Híbrido"].includes(form.server_type || "");
  const showAd = form.active_directory === "Sim";

  if (!isEditing) {
    const showCloudRead = ["VPS", "Nuvem", "Híbrido"].includes(d.server_type || "");
    const showAdRead = d.active_directory === "Sim";

    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        </div>

        <SubTitle>Geral</SubTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de servidor" value={display(d.server_type)} />
          {showCloudRead && <Field label="Provedor VPS / Nuvem" value={display(d.cloud_provider)} />}
          <Field label="Servidor de arquivos" value={display(d.file_server)} />
          <Field label="Active Directory" value={display(d.active_directory)} />
          {showAdRead && <Field label="Localização do AD" value={display(d.ad_location)} />}
        </div>
        {d.general_notes && (
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Observações gerais</p>
            <p className="text-sm font-medium whitespace-pre-wrap">{d.general_notes}</p>
          </div>
        )}

        <SubTitle>Rede — Console UniFi</SubTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modelo do console" value={display(d.unifi_console_model)} />
          <Field label="IP do console" value={display(d.unifi_console_ip)} />
          <Field label="Versão firmware" value={display(d.unifi_firmware)} />
          <Field label="Uptime" value={display(d.unifi_uptime)} />
        </div>
        <InfoNote text="Credencial admin registrada na seção 10" />

        <SubTitle>Rede — Gateway / Firewall</SubTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modelo" value={display(d.gateway_model)} />
          <Field label="IP WAN" value={display(d.gateway_wan_ip)} />
          <Field label="IP LAN" value={display(d.gateway_lan_ip)} />
          <Field label="Firmware" value={display(d.gateway_firmware)} />
        </div>
        <InfoNote text="Dados complementares importados via UniFi API" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SubTitle>Geral</SubTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Tipo de servidor</Label>
          <Select value={form.server_type || ""} onValueChange={(v) => setForm({ ...form, server_type: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{SERVER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className={`transition-all duration-200 ${showCloud ? "opacity-100" : "opacity-0 h-0 overflow-hidden"}`}>
          <Label>Provedor VPS / Nuvem</Label>
          <Input value={form.cloud_provider || ""} onChange={(e) => setForm({ ...form, cloud_provider: e.target.value })} />
        </div>
        <div>
          <Label>Servidor de arquivos</Label>
          <Select value={form.file_server || ""} onValueChange={(v) => setForm({ ...form, file_server: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{FILE_SERVER_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Active Directory</Label>
          <Select value={form.active_directory || ""} onValueChange={(v) => setForm({ ...form, active_directory: v })}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{AD_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className={`transition-all duration-200 ${showAd ? "opacity-100" : "opacity-0 h-0 overflow-hidden"}`}>
          <Label>Localização do AD</Label>
          <Input value={form.ad_location || ""} onChange={(e) => setForm({ ...form, ad_location: e.target.value })} placeholder="Servidor local / Synology / Nuvem" />
        </div>
        <div className="sm:col-span-2">
          <Label>Observações gerais</Label>
          <Textarea value={form.general_notes || ""} onChange={(e) => setForm({ ...form, general_notes: e.target.value })} rows={3} />
        </div>
      </div>

      <SubTitle>Rede — Console UniFi</SubTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Modelo do console</Label>
          <Input value={form.unifi_console_model || ""} onChange={(e) => setForm({ ...form, unifi_console_model: e.target.value })} />
        </div>
        <div>
          <Label>IP do console</Label>
          <Input value={form.unifi_console_ip || ""} onChange={(e) => setForm({ ...form, unifi_console_ip: e.target.value })} />
        </div>
        <div>
          <Label>Versão firmware</Label>
          <Input value={form.unifi_firmware || ""} onChange={(e) => setForm({ ...form, unifi_firmware: e.target.value })} />
        </div>
        <div>
          <Label>Uptime</Label>
          <Input value={form.unifi_uptime || ""} onChange={(e) => setForm({ ...form, unifi_uptime: e.target.value })} />
        </div>
      </div>
      <InfoNote text="Credencial admin registrada na seção 10" />

      <SubTitle>Rede — Gateway / Firewall</SubTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Modelo</Label>
          <Input value={form.gateway_model || ""} onChange={(e) => setForm({ ...form, gateway_model: e.target.value })} />
        </div>
        <div>
          <Label>IP WAN</Label>
          <Input value={form.gateway_wan_ip || ""} onChange={(e) => setForm({ ...form, gateway_wan_ip: e.target.value })} />
        </div>
        <div>
          <Label>IP LAN</Label>
          <Input value={form.gateway_lan_ip || ""} onChange={(e) => setForm({ ...form, gateway_lan_ip: e.target.value })} />
        </div>
        <div>
          <Label>Firmware</Label>
          <Input value={form.gateway_firmware || ""} onChange={(e) => setForm({ ...form, gateway_firmware: e.target.value })} />
        </div>
      </div>
      <InfoNote text="Dados complementares importados via UniFi API" />

      <div className="flex gap-2 justify-end pt-2">
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


function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Separator className="mb-3" />
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{children}</p>
    </div>
  );
}

function InfoNote({ text }: { text: string }) {
  return (
    <Badge variant="outline" className="font-normal text-xs gap-1">
      <Info className="h-3 w-3" /> {text}
    </Badge>
  );
}
