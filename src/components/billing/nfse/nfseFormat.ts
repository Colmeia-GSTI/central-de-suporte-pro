import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type NfseStatus =
  | "pendente"
  | "processando"
  | "autorizada"
  | "rejeitada"
  | "cancelada"
  | "substituida"
  | "erro"
  | string;

// Mapeamento de status Asaas para descrição
export const ASAAS_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada para envio",
  SYNCHRONIZED: "Sincronizada com prefeitura",
  AUTHORIZATION_PENDING: "Aguardando autorização",
  AUTHORIZED: "Autorizada",
  ERROR: "Erro no processamento",
  CANCELED: "Cancelada",
  CANCELLATION_PENDING: "Cancelamento pendente",
  CANCELLATION_DENIED: "Cancelamento negado",
};

// Progresso estimado por status Asaas
export const ASAAS_STATUS_PROGRESS: Record<string, number> = {
  SCHEDULED: 15,
  SYNCHRONIZED: 40,
  AUTHORIZATION_PENDING: 70,
  AUTHORIZED: 100,
  ERROR: 0,
  CANCELED: 0,
  CANCELLATION_PENDING: 85,
  CANCELLATION_DENIED: 75,
};

export function normalizeCompetencia(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);
  return trimmed;
}

export function formatCompetenciaLabel(competencia: string | null | undefined): string {
  const normalized = normalizeCompetencia(competencia);
  if (!/^\d{4}-\d{2}$/.test(normalized)) return "-";
  const date = new Date(normalized + "-01T00:00:00");
  if (Number.isNaN(date.getTime())) return "-";
  return format(date, "MMM/yyyy", { locale: ptBR }).toUpperCase();
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return format(d, "dd/MM/yyyy", { locale: ptBR });
}

export function statusLabel(status: NfseStatus): string {
  switch (status) {
    case "pendente":
      return "Pendente";
    case "processando":
      return "Processando";
    case "autorizada":
      return "Autorizada";
    case "rejeitada":
      return "Rejeitada";
    case "cancelada":
      return "Cancelada";
    case "substituida":
      return "Substituída";
    case "erro":
      return "Erro";
    default:
      return status ? status.charAt(0).toUpperCase() + status.slice(1) : "-";
  }
}

export function asaasStatusLabel(asaasStatus: string | null | undefined): string {
  if (!asaasStatus) return "-";
  return ASAAS_STATUS_LABELS[asaasStatus] || asaasStatus;
}

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return "-";
  if (provider === "asaas") return "Asaas";
  return provider;
}

export function formatElapsedTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return "Agora";
  if (diffMins === 1) return "1 min";
  if (diffMins < 60) return `${diffMins} min`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1h";
  if (diffHours < 24) return `${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 dia";
  return `${diffDays} dias`;
}

// ============ ERROR PARSING AND FORMATTING ============

export interface ParsedNfseError {
  codigo: string | null;
  descricao: string;
  acao: string | null;
  isE0014: boolean;
}

// Known prefeitura error codes and their user-friendly messages
const KNOWN_ERROR_ACTIONS: Record<string, string> = {
  E0014: "A nota já existe no provedor Asaas. Use 'Vincular Nota Existente' para sincronizar.",
  E0001: "Verifique os dados do certificado digital.",
  E0002: "Verifique os dados do prestador e tomador.",
};

/**
 * Parse error message from prefeitura/Asaas to extract code and actionable message
 */
export function parseNfseError(mensagemRetorno: string | null | undefined): ParsedNfseError {
  if (!mensagemRetorno) {
    return { codigo: null, descricao: "Erro desconhecido", acao: null, isE0014: false };
  }

  // Extract code from format "Código: E0014\r\nDescrição: ..."
  const codigoMatch = mensagemRetorno.match(/C[oó]digo:\s*(\w+)/i);
  const descMatch = mensagemRetorno.match(/Descri[cç][aã]o:\s*(.+?)(?:\r?\n|$)/i);

  const codigo = codigoMatch?.[1] || null;
  const descricao = descMatch?.[1]?.trim() || mensagemRetorno;
  const acao = codigo ? KNOWN_ERROR_ACTIONS[codigo] || null : null;
  const isE0014 = codigo === "E0014";

  return { codigo, descricao, acao, isE0014 };
}

/**
 * Check if an error message indicates E0014 (DPS duplicada)
 */
export function isE0014Error(mensagemRetorno: string | null | undefined): boolean {
  if (!mensagemRetorno) return false;
  return mensagemRetorno.includes("E0014") || 
         mensagemRetorno.toLowerCase().includes("dps duplicada") ||
         mensagemRetorno.toLowerCase().includes("já existe");
}

/**
 * Format error message for display with user-friendly action
 */
export function formatNfseErrorMessage(mensagemRetorno: string | null | undefined): {
  title: string;
  description: string;
  action: string | null;
  showLinkButton: boolean;
} {
  const parsed = parseNfseError(mensagemRetorno);

  if (parsed.isE0014) {
    return {
      title: "Nota já existe no provedor",
      description: "Esta NFS-e já foi emitida anteriormente com os mesmos dados.",
      action: "Informe o número da nota para sincronizar o registro.",
      showLinkButton: true,
    };
  }

  return {
    title: parsed.codigo ? `Erro ${parsed.codigo}` : "Erro na emissão",
    description: parsed.descricao,
    action: parsed.acao,
    showLinkButton: false,
  };
}
