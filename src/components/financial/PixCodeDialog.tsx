import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Check, QrCode, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface PixCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pixCode: string;
  invoiceNumber: number;
  amount: number;
  clientName: string;
}

export function PixCodeDialog({
  open,
  onOpenChange,
  pixCode,
  invoiceNumber,
  amount,
  clientName,
}: PixCodeDialogProps) {
  const [copied, setCopied] = useState(false);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const handleCopy = () => {
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate QR Code URL using a free API
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            PIX Copia e Cola
          </DialogTitle>
          <DialogDescription>
            Fatura #{invoiceNumber} - {clientName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Invoice Info */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Valor</span>
            <Badge variant="secondary" className="text-lg font-bold">
              {formatCurrency(amount)}
            </Badge>
          </div>

          {/* QR Code */}
          <div className="flex justify-center p-4 bg-white rounded-lg border">
            <img
              src={qrCodeUrl}
              alt="QR Code PIX"
              className="w-48 h-48"
              loading="lazy"
            />
          </div>

          {/* PIX Code */}
          <div className="space-y-2">
            <Label htmlFor="pix-code">Código Copia e Cola</Label>
            <div className="flex gap-2">
              <Input
                id="pix-code"
                value={pixCode}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                onClick={handleCopy}
                variant={copied ? "default" : "outline"}
                className={copied ? "bg-status-success hover:bg-status-success" : ""}
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Instructions */}
          <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/50 rounded-lg">
            <p className="font-medium text-foreground">Como pagar:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Abra o app do seu banco</li>
              <li>Escolha a opção "Pagar com PIX"</li>
              <li>Selecione "PIX Copia e Cola"</li>
              <li>Cole o código acima e confirme</li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <Button onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copiar Código
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
