import { useState } from "react";
import { ChevronDown, ChevronRight, DollarSign } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { calcularRetencoes, formatarReais } from "@/lib/nfse-retencoes";

export interface TributacaoData {
  issRetido: boolean;
  aliquotaIss: number;
  valorPis: number;
  valorCofins: number;
  valorCsll: number;
  valorIrrf: number;
  valorInss: number;
}

interface NfseTributacaoSectionProps {
  valorServico: number;
  aliquotaIss: number;
  data: TributacaoData;
  onChange: (data: TributacaoData) => void;
  /** Regime tributário da empresa (ex: "simples_nacional", "lucro_presumido", "lucro_real") */
  regimeTributario?: string | null;
}

export function NfseTributacaoSection({
  valorServico,
  aliquotaIss,
  data,
  onChange,
  regimeTributario,
}: NfseTributacaoSectionProps) {
  const [federaisOpen, setFederaisOpen] = useState(false);

  // Usa a aliquota do data se foi alterada, senão usa a sugerida
  const aliquotaEfetiva = data.aliquotaIss > 0 ? data.aliquotaIss : aliquotaIss;

  const result = calcularRetencoes({
    valorServico,
    aliquotaIss: aliquotaEfetiva,
    issRetido: data.issRetido,
    valorPis: data.valorPis,
    valorCofins: data.valorCofins,
    valorCsll: data.valorCsll,
    valorIrrf: data.valorIrrf,
    valorInss: data.valorInss,
  });

  const hasFederalRetentions =
    data.valorPis > 0 ||
    data.valorCofins > 0 ||
    data.valorCsll > 0 ||
    data.valorIrrf > 0 ||
    data.valorInss > 0;

  const isSimplesNacional = regimeTributario === "simples_nacional";

  const handleAliquotaChange = (value: string) => {
    const numValue = parseFloat(value.replace(",", ".")) || 0;
    // Simples Nacional: ISS varia de 2% a 5% (LC 123/2006, Anexos III/IV/V)
    // Outros regimes: alíquota pode variar, limite genérico de 100%
    const maxAliquota = isSimplesNacional ? 5 : 100;
    onChange({ ...data, aliquotaIss: Math.min(Math.max(numValue, 0), maxAliquota) });
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <DollarSign className="h-4 w-4" />
          Tributação (Asaas)
        </div>
        {regimeTributario && (
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            isSimplesNacional
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
          }`}>
            {isSimplesNacional ? "Simples Nacional" : regimeTributario === "lucro_presumido" ? "Lucro Presumido" : regimeTributario === "lucro_real" ? "Lucro Real" : regimeTributario}
          </span>
        )}
      </div>

      {/* Nota informativa para Simples Nacional */}
      {isSimplesNacional && (
        <div className="text-xs p-2 rounded bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
          <strong>Simples Nacional:</strong> Os tributos federais (PIS, COFINS, CSLL, IR, INSS) estão inclusos no DAS
          e <strong>não devem ser retidos</strong> separadamente, exceto quando o tomador for órgão público ou empresa obrigada a reter na fonte.
          A alíquota ISS varia de 2% a 5% conforme a faixa de faturamento (LC 123/2006).
        </div>
      )}

      {/* Alíquota ISS - Editável */}
      <div className="flex items-center justify-between">
        <Label className="text-sm text-muted-foreground">Alíquota ISS:</Label>
        <div className="flex items-center gap-1">
          <Input
            type="text"
            value={aliquotaEfetiva.toFixed(2).replace(".", ",")}
            onChange={(e) => handleAliquotaChange(e.target.value)}
            className="w-20 h-8 text-right text-sm font-medium"
          />
          <span className="text-sm font-medium">%</span>
        </div>
      </div>

      {/* ISS Retido */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm">ISS Retido pelo Tomador</Label>
          <p className="text-xs text-muted-foreground">
            Quando o cliente retém o ISS na fonte
          </p>
        </div>
        <Switch
          checked={data.issRetido}
          onCheckedChange={(checked) =>
            onChange({ ...data, issRetido: checked })
          }
        />
      </div>

      {data.issRetido && (
        <div className="flex items-center justify-between text-sm bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
          <span className="text-amber-800 dark:text-amber-200">
            Valor ISS a Reter:
          </span>
          <span className="font-medium text-amber-900 dark:text-amber-100">
            {formatarReais(result.valorIssRetido)}
          </span>
        </div>
      )}

      {/* Tributos Federais (Collapsible) */}
      <Collapsible open={federaisOpen} onOpenChange={setFederaisOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full">
          {federaisOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span>Tributos Federais Retidos (opcional)</span>
          {hasFederalRetentions && (
            <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
              {formatarReais(
                data.valorPis +
                  data.valorCofins +
                  data.valorCsll +
                  data.valorIrrf +
                  data.valorInss
              )}
            </span>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">PIS</Label>
              <CurrencyInput
                value={data.valorPis}
                onChange={(v) => onChange({ ...data, valorPis: v })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">COFINS</Label>
              <CurrencyInput
                value={data.valorCofins}
                onChange={(v) => onChange({ ...data, valorCofins: v })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CSLL</Label>
              <CurrencyInput
                value={data.valorCsll}
                onChange={(v) => onChange({ ...data, valorCsll: v })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">IRRF</Label>
              <CurrencyInput
                value={data.valorIrrf}
                onChange={(v) => onChange({ ...data, valorIrrf: v })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">INSS/CP</Label>
              <CurrencyInput
                value={data.valorInss}
                onChange={(v) => onChange({ ...data, valorInss: v })}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Resumo */}
      <div className="border-t pt-3 space-y-2">
        {result.totalRetencoes > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total Retenções:</span>
            <span className="font-medium text-destructive">
              - {formatarReais(result.totalRetencoes)}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between text-base font-semibold">
          <span>Valor Líquido:</span>
          <span className="text-primary">{formatarReais(result.valorLiquido)}</span>
        </div>
      </div>
    </div>
  );
}
