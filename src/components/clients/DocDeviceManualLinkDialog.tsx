import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Link2 } from "lucide-react";
import { useDocDeviceSync } from "@/hooks/useDocDeviceSync";
import { toast } from "sonner";

interface DocDeviceManualLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assetId: string;
  clientId: string;
}

export function DocDeviceManualLinkDialog({ open, onOpenChange, assetId, clientId }: DocDeviceManualLinkDialogProps) {
  const { linkAsset, isLinking } = useDocDeviceSync();
  const [selected, setSelected] = useState("");

  const { data: availableDevices = [] } = useQuery({
    queryKey: ["unlinked-doc-devices", clientId],
    queryFn: async () => {
      // Get doc_devices that are NOT linked to any asset
      const { data: linkedIds } = await supabase
        .from("assets")
        .select("doc_device_id")
        .eq("client_id", clientId)
        .not("doc_device_id", "is", null);

      const excludeIds = (linkedIds || [])
        .map((r) => (r as Record<string, unknown>).doc_device_id as string)
        .filter(Boolean);

      let query = supabase
        .from("doc_devices")
        .select("id, name, device_type, serial_number")
        .eq("client_id", clientId)
        .order("name");

      if (excludeIds.length > 0) {
        query = query.not("id", "in", `(${excludeIds.join(",")})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      await linkAsset({ assetId, docDeviceId: selected });
      toast.success("Ativo vinculado à Documentação");
      onOpenChange(false);
      setSelected("");
    } catch {
      toast.error("Erro ao vincular ativo");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setSelected(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular à Documentação
          </DialogTitle>
          <DialogDescription>
            Selecione um dispositivo da Documentação Técnica para vincular a este ativo.
          </DialogDescription>
        </DialogHeader>

        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um dispositivo" />
          </SelectTrigger>
          <SelectContent>
            {availableDevices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name || "Sem nome"} {d.serial_number ? `(S/N: ${d.serial_number})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {availableDevices.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum dispositivo disponível para vincular.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selected || isLinking}>
            {isLinking ? "Vinculando..." : "Vincular"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
