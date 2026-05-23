import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Ban, Loader2 } from "lucide-react";

interface NfseCancelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numeroNfse: number | string | null | undefined;
  motivo: string;
  setMotivo: (v: string) => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export function NfseCancelDialog({ open, onOpenChange, numeroNfse, motivo, setMotivo, onConfirm, isLoading }: NfseCancelDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o) setMotivo("");
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Ban className="h-5 w-5" />
            Cancelar NFS-e?
          </DialogTitle>
          <DialogDescription>
            Esta ação irá solicitar o cancelamento da NFS-e {numeroNfse ? `#${numeroNfse}` : ""} no Asaas.
            O cancelamento será processado e o status atualizado automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
            <AlertTriangle className="h-4 w-4 text-yellow-700" />
            <AlertDescription className="text-yellow-900 dark:text-yellow-200">
              O motivo do cancelamento é obrigatório para fins de auditoria e conformidade fiscal.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="motivo-cancelamento">Motivo do Cancelamento *</Label>
            <Textarea
              id="motivo-cancelamento"
              placeholder="Ex: Erro na descrição do serviço, cliente solicitou cancelamento, nota emitida em duplicidade..."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className={!motivo.trim() && isLoading ? "border-destructive" : ""}
            />
            {!motivo.trim() && (
              <p className="text-xs text-muted-foreground">
                Informe o motivo pelo qual esta nota está sendo cancelada.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => {
            onOpenChange(false);
            setMotivo("");
          }}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading || !motivo.trim()}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar Cancelamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
