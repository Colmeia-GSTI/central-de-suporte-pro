import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";

interface NfseCancelDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  numeroNfse: number | string | null | undefined;
  onConfirm: () => void;
  isLoading: boolean;
}

export function NfseCancelDeleteDialog({ open, onOpenChange, numeroNfse, onConfirm, isLoading }: NfseCancelDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Cancelar e Excluir NFS-e?
          </DialogTitle>
          <DialogDescription>
            Esta ação irá:
            <br />1) Solicitar o cancelamento da NFS-e {numeroNfse ? `#${numeroNfse}` : ""} no Asaas
            <br />2) Excluir permanentemente o registro do sistema
            <br /><br />
            <strong>Esta ação não pode ser desfeita.</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Cancelar e Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
