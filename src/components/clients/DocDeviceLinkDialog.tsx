import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Link2 } from "lucide-react";
import { useDocDeviceSync } from "@/hooks/useDocDeviceSync";
import { toast } from "sonner";

interface AssetData {
  id: string;
  client_id: string;
  name: string;
  asset_type: string;
  brand?: string | null;
  model?: string | null;
  serial_number?: string | null;
  ip_address?: string | null;
  location?: string | null;
  notes?: string | null;
}

interface DocDeviceLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: AssetData | null;
}

export function DocDeviceLinkDialog({ open, onOpenChange, asset }: DocDeviceLinkDialogProps) {
  const { findMatch, linkAsset, promoteToDoc, isLinking, isPromoting } = useDocDeviceSync();
  const [match, setMatch] = useState<{ id: string; name: string | null } | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (open && asset) {
      setMatch(null);
      setSearched(false);
      findMatch(asset.client_id, asset.name, asset.serial_number).then((m) => {
        setMatch(m);
        setSearched(true);
      });
    }
  }, [open, asset]);

  if (!asset) return null;

  const handleLink = async () => {
    if (!match) return;
    try {
      await linkAsset({ assetId: asset.id, docDeviceId: match.id });
      toast.success("Ativo vinculado à Documentação");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao vincular ativo");
    }
  };

  const handlePromote = async () => {
    try {
      await promoteToDoc(asset);
      toast.success("Dispositivo adicionado à Documentação Técnica");
      onOpenChange(false);
    } catch {
      toast.error("Erro ao adicionar à Documentação");
    }
  };

  if (!searched) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular à Documentação
          </DialogTitle>
          <DialogDescription>
            {match
              ? `Encontramos um dispositivo na Documentação com nome/serial similar: "${match.name}". Deseja vincular?`
              : "Deseja também adicionar este dispositivo à Documentação Técnica?"}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {match ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Não vincular
              </Button>
              <Button onClick={handleLink} disabled={isLinking}>
                <FileText className="h-4 w-4 mr-2" />
                {isLinking ? "Vinculando..." : "Vincular"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Agora não
              </Button>
              <Button onClick={handlePromote} disabled={isPromoting}>
                <FileText className="h-4 w-4 mr-2" />
                {isPromoting ? "Adicionando..." : "Adicionar à Documentação"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
