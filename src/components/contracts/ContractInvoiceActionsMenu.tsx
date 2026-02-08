import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, Barcode, QrCode, Zap, Mail, MessageCircle, Send,
  Building2, Loader2, ExternalLink, CheckCircle2, FileText,
} from "lucide-react";
import { EmitNfseDialog } from "@/components/financial/EmitNfseDialog";
import { PixCodeDialog } from "@/components/financial/PixCodeDialog";
import { useInvoiceActions } from "@/hooks/useInvoiceActions";
import type { Tables } from "@/integrations/supabase/types";

export interface ContractInvoiceData {
  id: string;
  invoice_number: number;
  amount: number;
  due_date: string;
  status: string;
  paid_date: string | null;
  reference_month: string | null;
  boleto_url: string | null;
  boleto_barcode: string | null;
  pix_code: string | null;
  client_id: string | null;
  contract_id: string | null;
  billing_provider: string | null;
  clients?: { name: string } | null;
  nfse_history: Array<{
    id: string;
    numero_nfse: string | null;
    status: string;
    created_at: string;
  }>;
}

interface ContractInvoiceActionsMenuProps {
  invoice: ContractInvoiceData;
  clientName?: string;
}

export function ContractInvoiceActionsMenu({ invoice, clientName }: ContractInvoiceActionsMenuProps) {
  const [nfseDialogOpen, setNfseDialogOpen] = useState(false);
  const [pixDialogOpen, setPixDialogOpen] = useState(false);

  const {
    generatingPayment,
    processingComplete,
    sendingNotification,
    isProcessing,
    markAsPaidMutation,
    handleGeneratePayment,
    handleResendNotification,
    handleEmitComplete,
  } = useInvoiceActions();

  // Build nfseByInvoice map from invoice's nfse_history
  const nfseByInvoice = invoice.nfse_history.reduce<Record<string, { status: string; numero_nfse: string | null }>>((acc, n) => {
    if (!acc[invoice.id] || n.status === "autorizada") {
      acc[invoice.id] = { status: n.status, numero_nfse: n.numero_nfse };
    }
    return acc;
  }, {});

  const invoiceForDialog = {
    ...invoice,
    clients: invoice.clients || (clientName ? { name: clientName } : null),
  } as Tables<"invoices"> & { clients: { name: string } | null };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0">
            {isProcessing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MoreHorizontal className="h-3.5 w-3.5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* Emitir Completo */}
          <DropdownMenuItem
            onClick={() => handleEmitComplete(invoice, nfseByInvoice)}
            disabled={isProcessing}
            className="font-medium text-primary"
          >
            {processingComplete === invoice.id ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Zap className="mr-2 h-4 w-4" />
            )}
            Emitir Completo
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Gerar Boleto */}
          {!invoice.boleto_url && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Barcode className="mr-2 h-4 w-4" />
                Gerar Boleto
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleGeneratePayment(invoice.id, "boleto", "banco_inter")} disabled={isProcessing}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Banco Inter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleGeneratePayment(invoice.id, "boleto", "asaas")} disabled={isProcessing}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Asaas
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* Gerar PIX */}
          {!invoice.pix_code && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <QrCode className="mr-2 h-4 w-4" />
                Gerar PIX
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleGeneratePayment(invoice.id, "pix", "banco_inter")} disabled={isProcessing}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Banco Inter
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleGeneratePayment(invoice.id, "pix", "asaas")} disabled={isProcessing}>
                  <Building2 className="mr-2 h-4 w-4" />
                  Asaas
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {/* Marcar como Pago */}
          <DropdownMenuItem onClick={() => markAsPaidMutation.mutate(invoice.id)} disabled={isProcessing}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Marcar como Pago
          </DropdownMenuItem>

          {/* Notificações */}
          {(invoice.boleto_url || invoice.pix_code) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleResendNotification(invoice.id, ["email"])} disabled={isProcessing}>
                <Mail className="mr-2 h-4 w-4" />
                Enviar por Email
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleResendNotification(invoice.id, ["whatsapp"])} disabled={isProcessing}>
                <MessageCircle className="mr-2 h-4 w-4" />
                Enviar por WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleResendNotification(invoice.id, ["email", "whatsapp"])} disabled={isProcessing}>
                <Send className="mr-2 h-4 w-4" />
                Enviar Email + WhatsApp
              </DropdownMenuItem>
            </>
          )}

          {/* NFS-e Manual */}
          {invoice.contract_id && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNfseDialogOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Emitir NFS-e Manual
              </DropdownMenuItem>
            </>
          )}

          {/* Ver boleto / PIX */}
          {(invoice.boleto_url || invoice.pix_code) && (
            <>
              <DropdownMenuSeparator />
              {invoice.boleto_url && (
                <DropdownMenuItem onClick={() => window.open(invoice.boleto_url!, "_blank")}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Ver Boleto
                </DropdownMenuItem>
              )}
              {invoice.pix_code && (
                <DropdownMenuItem onClick={() => setPixDialogOpen(true)}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Ver PIX
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialogs */}
      {nfseDialogOpen && (
        <EmitNfseDialog
          open={nfseDialogOpen}
          onOpenChange={setNfseDialogOpen}
          invoice={invoiceForDialog}
        />
      )}

      {pixDialogOpen && invoice.pix_code && (
        <PixCodeDialog
          open={pixDialogOpen}
          onOpenChange={setPixDialogOpen}
          pixCode={invoice.pix_code}
          invoiceNumber={invoice.invoice_number}
          amount={invoice.amount}
          clientName={clientName || "Cliente"}
        />
      )}
    </>
  );
}
