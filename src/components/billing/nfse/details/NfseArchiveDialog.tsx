import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Archive, Info, Loader2 } from "lucide-react";

interface NfseArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numeroNfse: number | string | null | undefined;
  reason: string;
  setReason: (v: string) => void;
  onConfirm: () => void;
  isLoading: boolean;
}

/**
 * Diálogo de arquivamento de NFS-e.
 *
 * Conformidade fiscal: NFS-e nunca é apagada do banco. Apenas marcamos
 * `is_active = false` e preservamos histórico, logs e auditoria por 7 anos.
 */
export function NfseArchiveDialog({
  open,
  onOpenChange,
  numeroNfse,
  reason,
  setReason,
  onConfirm,
  isLoading,
}: NfseArchiveDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReason("");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-muted-foreground" />
            Arquivar registro {numeroNfse ? `#${numeroNfse}` : ""}?
          </DialogTitle>
          <DialogDescription>
            O registro será ocultado da listagem principal, mas continuará salvo
            para auditoria fiscal. Você pode restaurá-lo a qualquer momento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Arquivar <strong>não cancela</strong> a NFS-e no Asaas e
              <strong> não apaga</strong> nenhum dado. Para cancelar fiscalmente,
              use o botão <em>Cancelar NFS-e</em>.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="motivo-arquivamento">Motivo do arquivamento *</Label>
            <Textarea
              id="motivo-arquivamento"
              placeholder="Ex: nota duplicada, substituída por outra, registro de teste..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Mínimo 5 caracteres. Fica registrado no histórico do registro.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setReason("");
            }}
          >
            Voltar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading || reason.trim().length < 5}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Archive className="h-4 w-4 mr-2" />
            Arquivar registro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
