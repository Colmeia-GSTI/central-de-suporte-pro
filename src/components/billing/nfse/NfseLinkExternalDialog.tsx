import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Link2, Loader2, Info } from "lucide-react";

interface NfseLinkExternalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nfseHistoryId: string;
  clientDocument?: string | null;
  clientName?: string | null;
  onLinked?: () => void;
}

export function NfseLinkExternalDialog({
  open,
  onOpenChange,
  nfseHistoryId,
  clientDocument,
  clientName,
  onLinked,
}: NfseLinkExternalDialogProps) {
  const queryClient = useQueryClient();
  const [numeroExterno, setNumeroExterno] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [rpsNumero, setRpsNumero] = useState("");

  const resetForm = () => {
    setNumeroExterno("");
    setJustificativa("");
    setRpsNumero("");
  };

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!numeroExterno.trim()) throw new Error("Número da NFS-e é obrigatório");
      if (justificativa.trim().length < 15) throw new Error("Justificativa deve ter no mínimo 15 caracteres");

      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "link_external",
          nfse_history_id: nfseHistoryId,
          numero_nfse: numeroExterno.trim(),
          justificativa: justificativa.trim(),
          rps_numero: rpsNumero.trim() || undefined,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Erro ao vincular nota");
      return data;
    },
    onSuccess: () => {
      toast.success("Nota vinculada com sucesso", {
        description: `Nota #${numeroExterno} vinculada ao registro.`,
      });
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      queryClient.invalidateQueries({ queryKey: ["billing-counters"] });
      onOpenChange(false);
      resetForm();
      onLinked?.();
    },
    onError: (e: Error) => {
      toast.error("Erro ao vincular nota", { description: e.message });
    },
  });

  const isValid = numeroExterno.trim().length > 0 && justificativa.trim().length >= 15;

  return (
    <Dialog open={open} onOpenChange={(v) => {
      onOpenChange(v);
      if (!v) resetForm();
    }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-amber-600" />
            Vincular Nota Existente
          </DialogTitle>
          <DialogDescription>
            Vincule uma NFS-e já emitida no Asaas ao registro local.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* E0014 explanation */}
          <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/30">
            <Info className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-blue-900 dark:text-blue-200 text-xs">
              <strong>O que é o erro E0014?</strong> Indica que uma nota com os mesmos dados já foi processada pelo Asaas.
              Isso acontece quando a nota foi emitida, mas o sistema não recebeu a confirmação. A vinculação manual
              sincroniza o registro local com a nota já autorizada.
            </AlertDescription>
          </Alert>

          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-900 dark:text-amber-200 text-xs">
              Use esta opção apenas se você verificou no Asaas que a nota existe e está autorizada.
            </AlertDescription>
          </Alert>

          {/* Client info (readonly) */}
          {(clientName || clientDocument) && (
            <div className="grid grid-cols-2 gap-3">
              {clientName && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Cliente</Label>
                  <Input value={clientName} readOnly className="bg-muted" />
                </div>
              )}
              {clientDocument && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">CPF/CNPJ</Label>
                  <Input value={clientDocument} readOnly className="bg-muted" />
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="link-numero-externo">Número da NFS-e *</Label>
            <Input
              id="link-numero-externo"
              placeholder="Ex: 77"
              value={numeroExterno}
              onChange={(e) => setNumeroExterno(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-rps-numero">Número do RPS (opcional)</Label>
            <Input
              id="link-rps-numero"
              placeholder="Ex: 123"
              value={rpsNumero}
              onChange={(e) => setRpsNumero(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="link-justificativa">Justificativa *</Label>
            <Textarea
              id="link-justificativa"
              placeholder="Descreva por que a vinculação é necessária (mínimo 15 caracteres)"
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              {justificativa.length}/15 caracteres mínimos • Registrado para auditoria
            </p>
          </div>

          {/* Preview */}
          {isValid && (
            <>
              <Separator />
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium text-xs text-muted-foreground">Dados que serão atualizados:</p>
                <p>Status: <strong className="text-green-600">Autorizada</strong></p>
                <p>Número NFS-e: <strong>{numeroExterno}</strong></p>
                {rpsNumero && <p>RPS: <strong>{rpsNumero}</strong></p>}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
            resetForm();
          }}>
            Cancelar
          </Button>
          <Button
            onClick={() => linkMutation.mutate()}
            disabled={!isValid || linkMutation.isPending}
          >
            {linkMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-2" />
            )}
            Vincular Nota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
