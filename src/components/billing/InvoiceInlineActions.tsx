import { Eye, Zap, Barcode, FileText, Mail, DollarSign, Loader2, RefreshCw, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { getBoletoIndicator, getNfseIndicator, getEmailIndicator, getSendBlockedStatus } from "@/utils/invoiceIndicators";

interface InvoiceInlineActionsProps {
  invoice: {
    id: string;
    status: string;
    boleto_url: string | null;
    boleto_barcode?: string | null;
    pix_code: string | null;
    contract_id: string | null;
    billing_provider: string | null;
    boleto_error_msg?: string | null;
    nfse_error_msg?: string | null;
    email_sent_at?: string | null;
    email_error_msg?: string | null;
    email_status?: string | null;
  };
  nfseInfo?: { status: string; numero_nfse: string | null; pdf_url?: string | null; xml_url?: string | null };
  processingComplete: string | null;
  generatingPayment: string | null;
  sendingNotification: string | null;
  checkingPayment: string | null;
  onViewHistory: () => void;
  onEmitComplete: () => void;
  onBoletoClick: () => void;
  onNfseClick: () => void;
  onEmailClick: () => void;
  onManualPayment: () => void;
  onCheckPayment: () => void;
}

export function InvoiceInlineActions({
  invoice,
  nfseInfo,
  processingComplete,
  generatingPayment,
  sendingNotification,
  checkingPayment,
  onViewHistory,
  onEmitComplete,
  onBoletoClick,
  onNfseClick,
  onEmailClick,
  onManualPayment,
  onCheckPayment,
}: InvoiceInlineActionsProps) {
  const isPendingOrOverdue = invoice.status === "pending" || invoice.status === "overdue";
  const isProcessing = processingComplete === invoice.id;
  const isGenerating = generatingPayment?.startsWith(invoice.id);
  const isSending = sendingNotification?.startsWith(invoice.id);

  // CORREÇÃO DEFINITIVA: Usar funções centralizadas de invoiceIndicators.ts
  const sendBlocked = getSendBlockedStatus({ nfseInfo });
  const isSendBlocked = sendBlocked.blocked;
  const sendBlockedReasons = sendBlocked.reasons;

  const boletoIndicator = getBoletoIndicator(invoice);
  const boletoColor = boletoIndicator.color;

  const nfseIndicator = getNfseIndicator(nfseInfo);
  const nfseColor = nfseIndicator.color;

  const emailIndicator = getEmailIndicator(invoice);
  const emailColor = emailIndicator.color;

  const iconClass = "h-4 w-4 cursor-pointer transition-transform hover:scale-125";

  return (
    <div className="flex items-center gap-1 justify-center">
      {/* View History */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onViewHistory} 
            className="h-7 w-7 p-0 hover:bg-muted"
          >
            <Eye className={`${iconClass} text-muted-foreground`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Histórico</TooltipContent>
      </Tooltip>

      {/* Emit Complete */}
      {isPendingOrOverdue && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onEmitComplete}
              disabled={isProcessing}
              className="h-7 w-7 p-0 hover:bg-muted"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <Zap className={`${iconClass} text-primary`} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Emitir Completo</TooltipContent>
        </Tooltip>
      )}

      {/* Boleto indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onBoletoClick} 
            className="h-7 w-7 p-0 hover:bg-muted"
          >
            <Barcode className={`${iconClass} ${boletoColor}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {boletoIndicator.tooltip}
        </TooltipContent>
      </Tooltip>

      {/* NFS-e indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onNfseClick} 
            className="h-7 w-7 p-0 hover:bg-muted"
          >
            <FileText className={`${iconClass} ${nfseColor}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {nfseIndicator.tooltip}
        </TooltipContent>
      </Tooltip>

      {/* Email indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onEmailClick}
            disabled={isSending || isSendBlocked}
            className="h-7 w-7 p-0 hover:bg-muted"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : isSendBlocked ? (
              <Lock className={`${iconClass} text-amber-500`} />
            ) : (
              <Mail className={`${iconClass} ${emailColor}`} />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {isSendBlocked ? `Envio bloqueado: ${sendBlockedReasons.join(". ")}` : emailIndicator.tooltip}
        </TooltipContent>
      </Tooltip>

      {/* Payment indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={isPendingOrOverdue ? onManualPayment : undefined}
            disabled={!isPendingOrOverdue}
            className="h-7 w-7 p-0 hover:bg-muted"
          >
            <DollarSign className={`${iconClass} ${
              invoice.status === "paid"
                ? "text-emerald-500"
                : "text-muted-foreground"
            }`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {invoice.status === "paid"
            ? `Pago${invoice.boleto_url ? " (automático)" : ""}`
            : "Baixa Manual"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
