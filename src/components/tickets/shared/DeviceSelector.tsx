import { useMemo } from "react";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectSeparator, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FormLabel, FormDescription } from "@/components/ui/form";
import { Circle, Monitor, Laptop, Server, Printer, Network, Wifi, Box, Pencil } from "lucide-react";
import type { ClientMonitoredDevice } from "@/hooks/useClientMonitoredDevices";

export interface DeviceSelectorValue {
  monitored_device_id: string | null;
  asset_id: string | null;
  asset_description: string | null;
  device_hostname_text: string | null;
}

export interface AssetOption {
  id: string;
  name: string;
  asset_type: string;
}

interface Props {
  monitoredDevices: ClientMonitoredDevice[];
  assets: AssetOption[];
  value: DeviceSelectorValue;
  onChange: (next: DeviceSelectorValue) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

const NONE = "__none__";
const FREE = "__free__";

const assetIcons: Record<string, React.ReactNode> = {
  desktop: <Monitor className="h-3.5 w-3.5" />,
  laptop: <Laptop className="h-3.5 w-3.5" />,
  server: <Server className="h-3.5 w-3.5" />,
  printer: <Printer className="h-3.5 w-3.5" />,
  network: <Network className="h-3.5 w-3.5" />,
  access_point: <Wifi className="h-3.5 w-3.5" />,
};

const empty: DeviceSelectorValue = {
  monitored_device_id: null,
  asset_id: null,
  asset_description: null,
  device_hostname_text: null,
};

function deriveSelectKey(v: DeviceSelectorValue): string {
  if (v.monitored_device_id) return `rmm:${v.monitored_device_id}`;
  if (v.asset_id) return `asset:${v.asset_id}`;
  if (v.device_hostname_text || v.asset_description) return FREE;
  return NONE;
}

export function DeviceSelector({
  monitoredDevices,
  assets,
  value,
  onChange,
  label = "Dispositivo com problema",
  description,
  disabled,
}: Props) {
  const selectKey = useMemo(() => deriveSelectKey(value), [value]);
  const isFree = selectKey === FREE;
  const hasOptions = monitoredDevices.length > 0 || assets.length > 0;

  const handleSelect = (key: string) => {
    if (key === NONE) return onChange(empty);
    if (key === FREE) {
      return onChange({
        ...empty,
        // mantém texto digitado se existia
        device_hostname_text: value.device_hostname_text,
        asset_description: value.asset_description,
      });
    }
    if (key.startsWith("rmm:")) {
      return onChange({ ...empty, monitored_device_id: key.slice(4) });
    }
    if (key.startsWith("asset:")) {
      return onChange({ ...empty, asset_id: key.slice(6) });
    }
  };

  // Sem dispositivos cadastrados: vira input livre direto
  if (!hasOptions) {
    return (
      <div className="space-y-2">
        <FormLabel>{label}</FormLabel>
        {description && <FormDescription>{description}</FormDescription>}
        <Input
          placeholder="Ex.: PC-RECEPCAO, Impressora HP da recepção..."
          maxLength={120}
          value={value.device_hostname_text || ""}
          onChange={(e) => onChange({ ...empty, device_hostname_text: e.target.value })}
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <FormLabel>{label}</FormLabel>
      {description && <FormDescription>{description}</FormDescription>}

      <Select value={selectKey} onValueChange={handleSelect} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione o dispositivo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Nenhum específico —</SelectItem>

          {monitoredDevices.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5 text-xs">
                  <Monitor className="h-3 w-3" /> Computadores monitorados (RMM)
                </SelectLabel>
                {monitoredDevices.map((d) => (
                  <SelectItem key={d.id} value={`rmm:${d.id}`}>
                    <span className="flex items-center gap-2">
                      <Circle className={`h-2 w-2 ${d.is_online ? "fill-green-500 text-green-500" : "fill-muted-foreground text-muted-foreground"}`} />
                      {d.hostname || d.name || "(sem nome)"}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}

          {assets.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="flex items-center gap-1.5 text-xs">
                  <Box className="h-3 w-3" /> Outros ativos do cliente
                </SelectLabel>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={`asset:${a.id}`}>
                    <span className="flex items-center gap-2">
                      {assetIcons[a.asset_type] || <Box className="h-3.5 w-3.5" />}
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}

          <SelectSeparator />
          <SelectItem value={FREE}>
            <span className="flex items-center gap-2">
              <Pencil className="h-3.5 w-3.5" /> Outro / não sei (descrever)
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {isFree && (
        <Input
          placeholder="Descreva o dispositivo (ex.: PC-RECEPCAO, impressora sala 2)"
          maxLength={120}
          value={value.device_hostname_text || ""}
          onChange={(e) => onChange({ ...empty, device_hostname_text: e.target.value })}
          disabled={disabled}
        />
      )}
    </div>
  );
}
