import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Monitor,
  Laptop,
  Server,
  Printer,
  Network,
  Wifi,
  Box,
  AlertCircle,
  Play,
} from "lucide-react";

interface AssetSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  ticketNumber: number;
  onConfirm: (assetId: string | null, assetDescription: string | null) => void;
  isPending?: boolean;
}

interface TicketFormData {
  technicians: { user_id: string; full_name: string }[];
  categories: { id: string; name: string }[];
  assets: { id: string; name: string; asset_type: string }[];
}

const assetTypeLabels: Record<string, string> = {
  computer: "Computador",
  notebook: "Notebook",
  server: "Servidor",
  printer: "Impressora",
  switch: "Switch",
  router: "Roteador",
  other: "Outro",
};

const assetTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  computer: Monitor,
  notebook: Laptop,
  server: Server,
  printer: Printer,
  switch: Network,
  router: Wifi,
  other: Box,
};

export function AssetSelectionDialog({
  open,
  onOpenChange,
  clientId,
  ticketNumber,
  onConfirm,
  isPending = false,
}: AssetSelectionDialogProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [customDescription, setCustomDescription] = useState("");

  // Fetch assets for the client
  const { data: formDataRpc, isLoading } = useQuery({
    queryKey: ["ticket-form-data-assets", clientId],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await supabase.rpc("get_ticket_form_data", {
        p_client_id: clientId,
      });
      if (error) throw error;
      return data as unknown as TicketFormData;
    },
    enabled: open && !!clientId,
  });

  const assets = useMemo(() => formDataRpc?.assets || [], [formDataRpc]);
  const hasAssets = assets.length > 0;
  const showDescriptionField = !clientId || selectedAssetId === "other";

  const canSubmit = useMemo(() => {
    if (selectedAssetId && selectedAssetId !== "other") {
      return true; // Ativo cadastrado selecionado
    }
    if (selectedAssetId === "other" && customDescription.trim()) {
      return true; // "Outro" com descrição preenchida
    }
    if (!clientId && customDescription.trim()) {
      return true; // Sem cliente, com descrição
    }
    return false;
  }, [selectedAssetId, customDescription, clientId]);

  const handleConfirm = () => {
    if (selectedAssetId && selectedAssetId !== "other") {
      onConfirm(selectedAssetId, null);
    } else {
      onConfirm(null, customDescription.trim());
    }
    // Reset state
    setSelectedAssetId("");
    setCustomDescription("");
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedAssetId("");
      setCustomDescription("");
    }
    onOpenChange(isOpen);
  };

  const getAssetIcon = (assetType: string) => {
    const IconComponent = assetTypeIcons[assetType] || Box;
    return <IconComponent className="h-4 w-4 mr-2 text-muted-foreground" />;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Iniciar Atendimento
          </DialogTitle>
          <DialogDescription>
            Chamado #{ticketNumber} - Selecione o dispositivo que será atendido
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* No client linked */}
          {!clientId && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Este chamado não possui cliente vinculado. Descreva o dispositivo ou problema geral.
              </AlertDescription>
            </Alert>
          )}

          {/* Asset selection - only if client has assets */}
          {clientId && (
            <div className="space-y-2">
              <Label htmlFor="asset-select">
                Qual dispositivo será atendido? <span className="text-destructive">*</span>
              </Label>
              {isLoading ? (
                <div className="h-10 bg-muted animate-pulse rounded-md" />
              ) : hasAssets ? (
                <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                  <SelectTrigger id="asset-select">
                    <SelectValue placeholder="Selecionar dispositivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {assets.map((asset) => (
                      <SelectItem key={asset.id} value={asset.id}>
                        <span className="flex items-center">
                          {getAssetIcon(asset.asset_type)}
                          <span className="text-xs text-muted-foreground mr-2">
                            [{assetTypeLabels[asset.asset_type] || asset.asset_type}]
                          </span>
                          {asset.name}
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem value="other">
                      <span className="flex items-center">
                        <Box className="h-4 w-4 mr-2 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground mr-2">[Outro]</span>
                        Outro dispositivo (especificar)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Nenhum ativo cadastrado para este cliente. Descreva o dispositivo abaixo.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Description field - shows when "other" is selected or no client */}
          {(showDescriptionField || (!hasAssets && clientId)) && (
            <div className="space-y-2">
              <Label htmlFor="asset-description">
                Descreva o dispositivo ou problema <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="asset-description"
                placeholder="Ex: Problema de rede, consultoria, notebook pessoal do cliente, etc."
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Esta informação será usada para relatórios de atendimentos por dispositivo.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canSubmit || isPending}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            {isPending ? "Iniciando..." : "Iniciar Atendimento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
