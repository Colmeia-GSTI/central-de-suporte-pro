import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Barcode, QrCode, MoreHorizontal, Loader2, FileText, Mail, MessageCircle,
  Send, Zap, XCircle, Building2, HandCoins, Ban, CheckCircle2, Clock, Trash2,
} from "lucide-react";

interface InvoiceForActions {
  id: string;
  invoice_number: number;
  amount: number;
  boleto_url: string | null;
  pix_code: string | null;
  contract_id: string | null;
  client_id: string | null;
  billing_provider: string | null;
  status: string;
  clients?: { name: string } | null;
}

interface NfseInfo {
  status: string;
  numero_nfse: string | null;
}

interface InvoiceActionsPopoverProps {
  invoice: InvoiceForActions;
  nfseInfo?: NfseInfo;
  generatingPayment: string | null;
  processingComplete: string | null;
  sendingNotification: string | null;
  onEmitComplete: () => void;
  onGeneratePayment: (invoiceId: string, type: "boleto" | "pix", provider: "banco_inter" | "asaas") => void;
  onManualPayment: () => void;
  onMarkAsPaid: () => void;
  onSecondCopy: () => void;
  onRenegotiate: () => void;
  onResendNotification: (invoiceId: string, channels: ("email" | "whatsapp")[]) => void;
  onEmitNfse: () => void;
  onCancelBoleto: () => void;
  onCancelNfse: () => void;
  onCancelInvoice: () => void;
  onViewHistory: () => void;
}

export function InvoiceActionsPopover({
  invoice,
  nfseInfo,
  generatingPayment,
  processingComplete,
  sendingNotification,
  onEmitComplete,
  onGeneratePayment,
  onManualPayment,
  onMarkAsPaid,
  onSecondCopy,
  onRenegotiate,
  onResendNotification,
  onEmitNfse,
  onCancelBoleto,
  onCancelNfse,
  onCancelInvoice,
  onViewHistory,
}: InvoiceActionsPopoverProps) {
  const isPendingOrOverdue = invoice.status === "pending" || invoice.status === "overdue";
  const hasPaymentMethod = !!invoice.boleto_url || !!invoice.pix_code;
  const hasBoleto = !!invoice.boleto_url;
  const canCancelBoleto = hasBoleto && invoice.status !== "paid";
  const hasAuthorizedNfse = nfseInfo?.status === "autorizada";

  const isLoading = generatingPayment?.startsWith(invoice.id);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* Emitir Completo */}
        {isPendingOrOverdue && (
          <>
            <DropdownMenuItem
              onClick={onEmitComplete}
              disabled={processingComplete !== null || generatingPayment !== null}
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
          </>
        )}

        {/* Gerar Boleto - Sub-menu com seleção de provedor */}
        {isPendingOrOverdue && !invoice.boleto_url && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Barcode className="mr-2 h-4 w-4" />
              Gerar Boleto
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => onGeneratePayment(invoice.id, "boleto", "banco_inter")}
                disabled={generatingPayment !== null}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Banco Inter
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onGeneratePayment(invoice.id, "boleto", "asaas")}
                disabled={generatingPayment !== null}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Asaas
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Gerar PIX - Sub-menu com seleção de provedor */}
        {isPendingOrOverdue && !invoice.pix_code && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <QrCode className="mr-2 h-4 w-4" />
              Gerar PIX
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => onGeneratePayment(invoice.id, "pix", "banco_inter")}
                disabled={generatingPayment !== null}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Banco Inter
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onGeneratePayment(invoice.id, "pix", "asaas")}
                disabled={generatingPayment !== null}
              >
                <Building2 className="mr-2 h-4 w-4" />
                Asaas
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Baixa Manual / Marcar como Pago */}
        {isPendingOrOverdue && (
          <>
            <DropdownMenuItem onClick={onManualPayment}>
              <HandCoins className="mr-2 h-4 w-4" />
              Baixa Manual
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMarkAsPaid}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar como Pago (rápido)
            </DropdownMenuItem>
          </>
        )}

        {/* Segunda Via / Renegociar */}
        {invoice.status === "overdue" && (
          <>
            <DropdownMenuItem onClick={onSecondCopy}>
              <Barcode className="mr-2 h-4 w-4" />
              Segunda Via
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRenegotiate}>
              <HandCoins className="mr-2 h-4 w-4" />
              Renegociar
            </DropdownMenuItem>
          </>
        )}

        {/* Notificações */}
        {isPendingOrOverdue && hasPaymentMethod && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onResendNotification(invoice.id, ["email"])}
              disabled={sendingNotification !== null}
            >
              <Mail className="mr-2 h-4 w-4" />
              Enviar por Email
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onResendNotification(invoice.id, ["whatsapp"])}
              disabled={sendingNotification !== null}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Enviar por WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onResendNotification(invoice.id, ["email", "whatsapp"])}
              disabled={sendingNotification !== null}
            >
              <Send className="mr-2 h-4 w-4" />
              Enviar Email + WhatsApp
            </DropdownMenuItem>
          </>
        )}

        {/* NFS-e Manual */}
        {invoice.contract_id && isPendingOrOverdue && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEmitNfse}>
              <FileText className="mr-2 h-4 w-4" />
              Emitir NFS-e Manual
            </DropdownMenuItem>
          </>
        )}

        {/* Cancelar Fatura */}
        {isPendingOrOverdue && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onCancelInvoice}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Cancelar Fatura
            </DropdownMenuItem>
          </>
        )}

        {/* Cancel Actions */}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={canCancelBoleto ? onCancelBoleto : undefined}
          disabled={!canCancelBoleto}
          className={canCancelBoleto ? "text-destructive focus:text-destructive" : ""}
        >
          <Ban className="mr-2 h-4 w-4" />
          <div className="flex flex-col items-start">
            <span>Cancelar Boleto</span>
            {!canCancelBoleto && (
              <span className="text-xs text-muted-foreground">
                {!hasBoleto ? "Nenhum boleto gerado" : "Boleto de fatura paga não pode ser cancelado"}
              </span>
            )}
          </div>
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={hasAuthorizedNfse ? onCancelNfse : undefined}
          disabled={!hasAuthorizedNfse}
          className={hasAuthorizedNfse ? "text-destructive focus:text-destructive" : ""}
        >
          <XCircle className="mr-2 h-4 w-4" />
          <div className="flex flex-col items-start">
            <span>Cancelar NFS-e</span>
            {!hasAuthorizedNfse && (
              <span className="text-xs text-muted-foreground">
                {nfseInfo ? `NFS-e "${nfseInfo.status}" não pode ser cancelada` : "Sem NFS-e vinculada"}
              </span>
            )}
          </div>
        </DropdownMenuItem>

        {/* Histórico */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onViewHistory}>
          <Clock className="mr-2 h-4 w-4" />
          Ver Histórico
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
