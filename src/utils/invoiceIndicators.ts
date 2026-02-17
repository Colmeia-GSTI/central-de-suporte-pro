// Centralized invoice indicator logic for boleto, NFS-e and email status

export interface BoletoIndicatorInput {
  boleto_url: string | null;
  boleto_barcode?: string | null;
  boleto_error_msg?: string | null;
  status?: string;
  billing_provider?: string | null;
  pix_code?: string | null;
}

export interface NfseIndicatorInput {
  status: string;
  numero_nfse: string | null;
  pdf_url?: string | null;
  xml_url?: string | null;
}

export interface EmailIndicatorInput {
  email_sent_at?: string | null;
  email_error_msg?: string | null;
  email_status?: string | null;
}

export interface IndicatorResult {
  color: string;
  tooltip: string;
  level: "success" | "error" | "warning" | "processing" | "pending";
}

export interface SendBlockResult {
  blocked: boolean;
  reasons: string[];
}

export function isBoletoReady(input: Pick<BoletoIndicatorInput, "boleto_url" | "boleto_barcode">): boolean {
  return !!input.boleto_url || !!input.boleto_barcode;
}

export function getBoletoIndicator(input: BoletoIndicatorInput): IndicatorResult {
  // CORREÇÃO DEFINITIVA: Mensagens informativas (Resetado) não são erros reais
  if (input.boleto_error_msg && !input.boleto_error_msg.includes("Resetado")) {
    return { color: "text-destructive", tooltip: "Erro no boleto", level: "error" };
  }

  if (isBoletoReady(input)) {
    const tooltip = input.boleto_url
      ? "Abrir PDF do boleto"
      : "Copiar código de barras";
    return { color: "text-emerald-500", tooltip, level: "success" };
  }

  // Mensagem de reset = aguardando nova geração
  if (input.boleto_error_msg?.includes("Resetado")) {
    return { color: "text-muted-foreground", tooltip: "Boleto resetado - aguardando nova geração", level: "pending" };
  }

  return { color: "text-muted-foreground", tooltip: "Boleto pendente", level: "pending" };
}

export function getNfseIndicator(input?: NfseIndicatorInput): IndicatorResult {
  if (!input) {
    return { color: "text-muted-foreground", tooltip: "NFS-e pendente", level: "pending" };
  }

  if (input.status === "autorizada") {
    return { color: "text-emerald-500", tooltip: "NFS-e autorizada", level: "success" };
  }

  if (input.status === "erro" || input.status === "rejeitada") {
    return {
      color: "text-destructive",
      tooltip: "NFS-e com erro - clique para ver detalhes",
      level: "error",
    };
  }

  if (input.status === "processando") {
    return { color: "text-blue-400", tooltip: "NFS-e: processando", level: "processing" };
  }

  return {
    color: "text-muted-foreground",
    tooltip: `NFS-e: ${input.status}`,
    level: "pending",
  };
}

export function getEmailIndicator(input: EmailIndicatorInput): IndicatorResult {
  const hasError = !!input.email_error_msg || input.email_status === "erro";
  const hasSent = !!input.email_sent_at || input.email_status === "enviado";

  if (hasError) {
    return { color: "text-destructive", tooltip: "Erro no email", level: "error" };
  }

  if (hasSent) {
    return { color: "text-emerald-500", tooltip: "Email enviado", level: "success" };
  }

  return { color: "text-muted-foreground", tooltip: "Enviar email", level: "pending" };
}

export function getSendBlockedStatus(input: { nfseInfo?: NfseIndicatorInput }): SendBlockResult {
  const reasons: string[] = [];

  if (input.nfseInfo && input.nfseInfo.status === "autorizada") {
    const missing: string[] = [];
    if (!input.nfseInfo.pdf_url) missing.push("PDF");
    if (!input.nfseInfo.xml_url) missing.push("XML");
    if (missing.length > 0) {
      reasons.push(`NFS-e: ${missing.join(" e ")} ausente(s)`);
    }
  }

  return { blocked: reasons.length > 0, reasons };
}
