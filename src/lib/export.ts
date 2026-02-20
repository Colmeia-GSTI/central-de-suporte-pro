import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// CSV Export
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; label: string }[]
) {
  const headers = columns.map((col) => col.label).join(",");
  const rows = data.map((row) =>
    columns
      .map((col) => {
        const value = row[col.key];
        // Escape quotes and wrap in quotes if contains comma
        if (typeof value === "string" && (value.includes(",") || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value ?? "";
      })
      .join(",")
  );

  const csvContent = [headers, ...rows].join("\n");
  downloadFile(csvContent, `${filename}.csv`, "text/csv;charset=utf-8;");
}

// Excel-like Export (using TSV for better Excel compatibility)
export function exportToExcel<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns: { key: keyof T; label: string }[]
) {
  const headers = columns.map((col) => col.label).join("\t");
  const rows = data.map((row) =>
    columns.map((col) => row[col.key] ?? "").join("\t")
  );

  const tsvContent = [headers, ...rows].join("\n");
  downloadFile(tsvContent, `${filename}.xls`, "application/vnd.ms-excel");
}

// JSON Export
export function exportToJSON<T>(data: T[], filename: string) {
  const jsonContent = JSON.stringify(data, null, 2);
  downloadFile(jsonContent, `${filename}.json`, "application/json");
}

// Helper function to download file
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(["\ufeff" + content], { type: mimeType });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Format helpers for export
export const formatters = {
  date: (value: string | null) =>
    value ? format(new Date(value), "dd/MM/yyyy", { locale: ptBR }) : "",
  datetime: (value: string | null) =>
    value ? format(new Date(value), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
  currency: (value: number | null) =>
    value != null
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
      : "",
  boolean: (value: boolean | null) => (value ? "Sim" : "Não"),
};

// Export configurations for different entities
export const exportConfigs = {
  tickets: [
    { key: "ticket_number", label: "Número" },
    { key: "title", label: "Título" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Prioridade" },
    { key: "client_name", label: "Cliente" },
    { key: "assigned_to_name", label: "Responsável" },
    { key: "created_at", label: "Criado em" },
    { key: "resolved_at", label: "Resolvido em" },
  ],
  clients: [
    { key: "name", label: "Nome" },
    { key: "document", label: "Documento" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Telefone" },
    { key: "city", label: "Cidade" },
    { key: "state", label: "Estado" },
    { key: "is_active", label: "Ativo" },
  ],
  invoices: [
    { key: "invoice_number", label: "Número" },
    { key: "client_name", label: "Cliente" },
    { key: "amount", label: "Valor" },
    { key: "status", label: "Status" },
    { key: "due_date", label: "Vencimento" },
    { key: "paid_date", label: "Data Pagamento" },
  ],
  contracts: [
    { key: "name", label: "Nome" },
    { key: "client_name", label: "Cliente" },
    { key: "support_model", label: "Modelo" },
    { key: "monthly_value", label: "Valor Mensal" },
    { key: "start_date", label: "Início" },
    { key: "end_date", label: "Término" },
    { key: "status", label: "Status" },
  ],
  assets: [
    { key: "name", label: "Nome" },
    { key: "asset_type", label: "Tipo" },
    { key: "brand", label: "Marca" },
    { key: "model", label: "Modelo" },
    { key: "serial_number", label: "Número de Série" },
    { key: "client_name", label: "Cliente" },
    { key: "status", label: "Status" },
  ],
  managementReport: [
    { key: "periodo", label: "Período" },
    { key: "total_chamados", label: "Total Chamados" },
    { key: "chamados_resolvidos", label: "Resolvidos" },
    { key: "sla_percentual", label: "SLA %" },
    { key: "horas_trabalhadas", label: "Horas Trabalhadas" },
    { key: "valor_faturado", label: "Valor Faturado" },
    { key: "valor_pago", label: "Valor Pago" },
    { key: "valor_pendente", label: "Valor Pendente" },
    { key: "valor_vencido", label: "Valor Vencido" },
  ],
};
