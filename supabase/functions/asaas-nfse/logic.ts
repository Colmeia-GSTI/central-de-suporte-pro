// Regras puras da emissão de NFS-e (testáveis sem rede/Supabase).

// Status de nfse_history que representam uma nota "viva" para a fatura.
// Mesmo predicado do índice único uq_nfse_history_active_per_invoice —
// manter os dois em sincronia.
export const NFSE_BLOCKING_STATUSES = ["autorizada", "processando", "pendente"] as const;

export interface EmitParams {
  invoice_id?: string | null;
  nfse_history_id?: string | null;
  force_new_emission?: boolean;
}

// Idempotência por fatura: uma nova emissão automática só é permitida se a
// fatura não tiver nota viva. Bypasses: nfse_history_id (reemissão/retry E0014)
// e force_new_emission (substituição pós-cancelamento).
export function shouldBlockNewEmission(p: EmitParams, existingStatus: string | null): boolean {
  if (!p.invoice_id || p.nfse_history_id || p.force_new_emission) return false;
  return existingStatus !== null &&
    (NFSE_BLOCKING_STATUSES as readonly string[]).includes(existingStatus);
}

// ============ NORMALIZE SERVICE CODE ============
export function normalizeServiceCode(code: string): string {
  // CORREÇÃO DEFINITIVA: NÃO remover zeros à esquerda
  // O código "010701" deve ser mantido como "010701" para match correto com a municipalidade
  return code.replace(/[.\s\-]/g, "");
}

// ============ KNOWN PREFEITURA ERRORS ============
export interface KnownError {
  code: string;
  title: string;
  message: string;
  action: string;
}

const KNOWN_PREFEITURA_ERRORS: Record<string, KnownError> = {
  E0014: {
    code: "DPS_DUPLICADA",
    title: "Nota Fiscal já existe",
    message: "Esta NFS-e já foi emitida anteriormente com os mesmos dados no provedor Asaas.",
    action: "VERIFY_EXTERNAL",
  },
  E0001: {
    code: "CERT_INVALIDO",
    title: "Certificado digital inválido",
    message: "Verifique os dados do certificado digital.",
    action: "CHECK_CERTIFICATE",
  },
  E0002: {
    code: "DADOS_INCOMPLETOS",
    title: "Dados incompletos",
    message: "Verifique os dados do prestador ou tomador.",
    action: "CHECK_DATA",
  },
};

// Parse error code from prefeitura status description
export function parseStatusDescription(statusDescription: string | null): {
  codigo: string | null;
  descricao: string;
  acao: string | null;
  knownError: KnownError | null;
} {
  if (!statusDescription) {
    return { codigo: null, descricao: "Erro desconhecido", acao: null, knownError: null };
  }

  // Extract code from format "Código: E0014\r\nDescrição: ..."
  const codigoMatch = statusDescription.match(/C[oó]digo:\s*(\w+)/i);
  const descMatch = statusDescription.match(/Descri[cç][aã]o:\s*(.+?)(?:\r?\n|$)/i);

  const codigo = codigoMatch?.[1] || null;
  const descricao = descMatch?.[1]?.trim() || statusDescription;

  // Check if it's a known error
  const knownError = codigo ? KNOWN_PREFEITURA_ERRORS[codigo] || null : null;

  // Map known actions
  const acoesConhecidas: Record<string, string> = {
    E0014: "Verifique se a nota já existe no Asaas e use 'Vincular Nota Existente'",
    E0001: "Verifique os dados do certificado digital",
    E0002: "Verifique os dados do prestador e tomador de serviço",
  };

  return {
    codigo,
    descricao,
    acao: codigo ? acoesConhecidas[codigo] || null : null,
    knownError,
  };
}

// Data de hoje no fuso America/Sao_Paulo. As edge functions rodam em UTC; sem isto a
// competência "hoje" pula um dia à noite (BRT = UTC-3) e, no fim do mês, cai no mês seguinte.
function todaySaoPaulo(): string {
  // en-CA formata como YYYY-MM-DD; timeZone garante a data-calendário de SP.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Helper to normalize competencia to full date format (YYYY-MM-DD)
export function normalizeCompetencia(competencia?: string): string {
  if (!competencia) {
    return todaySaoPaulo();
  }
  // If already full date format (YYYY-MM-DD), return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(competencia)) {
    return competencia;
  }
  // If month format (YYYY-MM), append -01
  if (/^\d{4}-\d{2}$/.test(competencia)) {
    return `${competencia}-01`;
  }
  // Default to current date (fuso de SP)
  return todaySaoPaulo();
}

// ============ ADDRESS HELPERS ============
export function extractStreetFromAddress(address: string): string {
  // Remove o número do endereço (ex: "RUA X, 123" -> "RUA X")
  return address.replace(/,?\s*\d+\s*(-.*)?$/, "").trim() || address;
}

export function extractNumberFromAddress(address: string): string | null {
  // Extrai número do endereço (ex: "RUA X, 123" -> "123")
  const match = address.match(/,?\s*(\d+)\s*(?:-|$)/);
  return match ? match[1] : null;
}
