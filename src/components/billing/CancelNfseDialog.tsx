import { useState, useRef, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";

const MIN_CHARS = 15;
const MAX_CHARS = 500;

interface CancelNfseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (justification: string) => Promise<void>;
  invoiceNumber?: number;
  nfseNumber?: string | null;
}

export function CancelNfseDialog({
  open,
  onOpenChange,
  onConfirm,
  invoiceNumber,
  nfseNumber,
}: CancelNfseDialogProps) {
  const [justification, setJustification] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charCount = justification.trim().length;
  const isValid = charCount >= MIN_CHARS && charCount <= MAX_CHARS;

  useEffect(() => {
    if (open) {
      setJustification("");
      setIsSubmitting(false);
      // Auto-focus textarea
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirm(justification.trim());
      onOpenChange(false);
    } catch {
      // Error handled by caller
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !isSubmitting && onOpenChange(v)}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(e) => isSubmitting && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancelar NFS-e
          </DialogTitle>
          <DialogDescription>
            {nfseNumber
              ? `Cancelar NFS-e nº ${nfseNumber} da fatura #${invoiceNumber}.`
              : `Cancelar NFS-e da fatura #${invoiceNumber}.`}
            {" "}Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="cancel-justification">
            Justificativa do cancelamento <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancel-justification"
            ref={textareaRef}
            value={justification}
            onChange={(e) => setJustification(e.target.value.slice(0, MAX_CHARS))}
            placeholder="Descreva o motivo do cancelamento (mínimo 15 caracteres)..."
            className="min-h-[120px] resize-none"
            disabled={isSubmitting}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {charCount < MIN_CHARS
                ? `Mínimo ${MIN_CHARS - charCount} caracteres restantes`
                : "✓ Justificativa válida"}
            </span>
            <span className={charCount > MAX_CHARS * 0.9 ? "text-destructive" : ""}>
              {charCount}/{MAX_CHARS}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelando...
              </>
            ) : (
              "Confirmar Cancelamento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
