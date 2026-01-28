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

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return "-";
  if (provider === "asaas") return "Asaas";
  if (provider === "nacional") return "API Nacional";
  return provider;
}
