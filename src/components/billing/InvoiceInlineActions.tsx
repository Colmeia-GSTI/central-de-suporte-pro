import { Eye, Zap, Barcode, FileText, Mail, DollarSign, Loader2, RefreshCw, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

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

  // Check if send is blocked due to incomplete artifacts
  const sendBlockedReasons: string[] = [];
  if (nfseInfo && nfseInfo.status === "autorizada" && (!nfseInfo.pdf_url || !nfseInfo.xml_url)) {
    const missing = [];
    if (!nfseInfo.pdf_url) missing.push("PDF");
    if (!nfseInfo.xml_url) missing.push("XML");
    sendBlockedReasons.push(`NFS-e: ${missing.join(" e ")} ausente(s)`);
  }
  const hasBoletoData = !!invoice.boleto_url;
  const boletoProcessando = invoice.boleto_error_msg === null && !hasBoletoData && invoice.status !== "paid";
  // Only block if boleto was expected but not ready (no URL and no pix fallback)
  if (boletoProcessando && !invoice.pix_code && invoice.billing_provider) {
    // Don't block - this is just informational
  }
  const isSendBlocked = sendBlockedReasons.length > 0;

  // Boleto status color - consider barcode as well as URL
  const hasBoletoReady = !!invoice.boleto_url || !!invoice.boleto_barcode;
  const boletoColor = invoice.boleto_error_msg
    ? "text-destructive"
    : hasBoletoReady
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
          {hasBoletoReady ? "Boleto gerado" : invoice.boleto_error_msg ? "Erro no boleto" : "Boleto pendente"}
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
          {nfseInfo ? `NFS-e: ${nfseInfo.status}` : "NFS-e pendente"}
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
          {isSendBlocked ? `Envio bloqueado: ${sendBlockedReasons.join(". ")}` : emailSent ? "Email enviado" : emailError ? "Erro no email" : "Enviar email"}
        </TooltipContent>
      </Tooltip>

      {/* Manual Payment */}
      {isPendingOrOverdue && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onManualPayment} 
              className="h-7 w-7 p-0 hover:bg-muted"
            >
              <DollarSign className={`${iconClass} text-muted-foreground`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Baixa Manual</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
