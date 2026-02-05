import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

interface FiscalReportExportProps {
  data: any[];
  month: string;
}

export function FiscalReportExport({ data, month }: FiscalReportExportProps) {
  const handleExport = () => {
    if (data.length === 0) {
      toast.warning("Sem dados para exportar");
      return;
    }

    const headers = [
      "numero_nfse",
      "data_emissao",
      "cliente",
      "valor_servico",
      "valor_iss",
      "valor_pis",
      "valor_cofins",
      "valor_csll",
      "valor_irrf",
      "valor_inss",
      "valor_liquido",
      "status",
    ];

    const rows = data.map((n: any) => [
      n.numero_nfse || "",
      n.data_emissao ? new Date(n.data_emissao).toLocaleDateString("pt-BR") : "",
      (n.clients as any)?.name || "",
      Number(n.valor_servico || 0).toFixed(2),
      Number(n.valor_iss || 0).toFixed(2),
      Number(n.valor_pis || 0).toFixed(2),
      Number(n.valor_cofins || 0).toFixed(2),
      Number(n.valor_csll || 0).toFixed(2),
      Number(n.valor_irrf || 0).toFixed(2),
      Number(n.valor_inss || 0).toFixed(2),
      Number(n.valor_liquido || 0).toFixed(2),
      n.status || "",
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map((row: string[]) => row.join(";")),
    ].join("\n");

    // BOM for Excel to recognize UTF-8
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio_fiscal_${month}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success("CSV exportado com sucesso!");
  };

  return (
    <Button variant="outline" onClick={handleExport} disabled={data.length === 0}>
      <Download className="h-4 w-4 mr-2" />
      Exportar CSV
    </Button>
  );
}
