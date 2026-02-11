import { Eye, Zap, Barcode, FileText, Mail, DollarSign, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface InvoiceInlineActionsProps {
  invoice: {
    id: string;
    status: string;
    boleto_url: string | null;
    pix_code: string | null;
    contract_id: string | null;
    billing_provider: string | null;
    boleto_error_msg?: string | null;
    nfse_error_msg?: string | null;
    email_sent_at?: string | null;
    email_error_msg?: string | null;
    email_status?: string | null;
  };
  nfseInfo?: { status: string; numero_nfse: string | null };
  processingComplete: string | null;
  generatingPayment: string | null;
  sendingNotification: string | null;
  onViewHistory: () => void;
  onEmitComplete: () => void;
  onBoletoClick: () => void;
  onNfseClick: () => void;
  onEmailClick: () => void;
  onManualPayment: () => void;
}

export function InvoiceInlineActions({
  invoice,
  nfseInfo,
  processingComplete,
  generatingPayment,
  sendingNotification,
  onViewHistory,
  onEmitComplete,
  onBoletoClick,
  onNfseClick,
  onEmailClick,
  onManualPayment,
}: InvoiceInlineActionsProps) {
  const isPendingOrOverdue = invoice.status === "pending" || invoice.status === "overdue";
  const isProcessing = processingComplete === invoice.id;
  const isGenerating = generatingPayment?.startsWith(invoice.id);
  const isSending = sendingNotification?.startsWith(invoice.id);

  // Boleto status color
  const boletoColor = invoice.boleto_error_msg
    ? "text-destructive"
    : invoice.boleto_url
      ? "text-emerald-500"
      : "text-muted-foreground";

  // NFS-e status color
  const nfseColor = nfseInfo?.status === "autorizada"
    ? "text-emerald-500"
    : nfseInfo?.status === "erro" || nfseInfo?.status === "rejeitada"
      ? "text-destructive"
      : nfseInfo?.status === "processando"
        ? "text-blue-400"
        : "text-muted-foreground";

  // Email status color
  const emailSent = invoice.email_sent_at || invoice.email_status === "enviado";
  const emailError = invoice.email_error_msg || invoice.email_status === "erro";
  const emailColor = emailError
    ? "text-destructive"
    : emailSent
      ? "text-emerald-500"
      : "text-muted-foreground";

  const iconClass = "h-4 w-4 cursor-pointer transition-transform hover:scale-125";

  return (
    <div className="flex items-center gap-1">
      {/* View History */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={onViewHistory} className={`${iconClass} text-muted-foreground hover:text-foreground`}>
            <Eye className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Histórico</TooltipContent>
      </Tooltip>

      {/* Emit Complete */}
      {isPendingOrOverdue && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onEmitComplete}
              disabled={isProcessing || isGenerating !== undefined && isGenerating}
              className={`${iconClass} text-primary hover:text-primary/80 disabled:opacity-50`}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>Emitir Completo</TooltipContent>
        </Tooltip>
      )}

      {/* Boleto indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={onBoletoClick} className={`${iconClass} ${boletoColor}`}>
            <Barcode className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {invoice.boleto_url ? "Boleto gerado" : invoice.boleto_error_msg ? "Erro no boleto" : "Boleto pendente"}
        </TooltipContent>
      </Tooltip>

      {/* NFS-e indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button onClick={onNfseClick} className={`${iconClass} ${nfseColor}`}>
            <FileText className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {nfseInfo ? `NFS-e: ${nfseInfo.status}` : "NFS-e pendente"}
        </TooltipContent>
      </Tooltip>

      {/* Email indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onEmailClick}
            disabled={isSending}
            className={`${iconClass} ${emailColor} disabled:opacity-50`}
          >
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {emailSent ? "Email enviado" : emailError ? "Erro no email" : "Enviar email"}
        </TooltipContent>
      </Tooltip>

      {/* Manual Payment */}
      {isPendingOrOverdue && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onManualPayment} className={`${iconClass} text-muted-foreground hover:text-foreground`}>
              <DollarSign className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Baixa Manual</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
