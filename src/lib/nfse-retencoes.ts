/**
 * NFS-e Nacional 2026: Cálculo de Retenções e Tributos
 * Padrão DPS (Declaração de Prestação de Serviço) v1.0
 */

export interface RetencoesInput {
  valorServico: number;
  aliquotaIss: number;
  issRetido: boolean;
  valorPis?: number;
  valorCofins?: number;
  valorCsll?: number;
  valorIrrf?: number;
  valorInss?: number;
  valorDeducoes?: number;
  valorDesconto?: number;
}

export interface RetencoesResult {
  valorIssRetido: number;
  valorPis: number;
  valorCofins: number;
  valorCsll: number;
  valorIrrf: number;
  valorInss: number;
  totalRetencoes: number;
  valorLiquido: number;
  baseCalculo: number;
}

/**
 * Calcula todas as retenções e valor líquido conforme padrão NFS-e Nacional 2026
 */
export function calcularRetencoes(input: RetencoesInput): RetencoesResult {
  const {
    valorServico,
    aliquotaIss,
    issRetido,
    valorPis = 0,
    valorCofins = 0,
    valorCsll = 0,
    valorIrrf = 0,
    valorInss = 0,
    valorDeducoes = 0,
    valorDesconto = 0,
  } = input;

  // Base de cálculo = valor serviço - deduções
  const baseCalculo = Math.max(0, valorServico - valorDeducoes);

  // ISS retido é calculado sobre a base de cálculo
  const valorIssRetido = issRetido ? baseCalculo * (aliquotaIss / 100) : 0;

  // Total de retenções
  const totalRetencoes =
    valorIssRetido +
    valorPis +
    valorCofins +
    valorCsll +
    valorIrrf +
    valorInss;

  // Valor líquido = valor serviço - descontos - retenções
  const valorLiquido = Math.max(0, valorServico - valorDesconto - totalRetencoes);

  return {
    valorIssRetido: Number(valorIssRetido.toFixed(2)),
    valorPis: Number(valorPis.toFixed(2)),
    valorCofins: Number(valorCofins.toFixed(2)),
    valorCsll: Number(valorCsll.toFixed(2)),
    valorIrrf: Number(valorIrrf.toFixed(2)),
    valorInss: Number(valorInss.toFixed(2)),
    totalRetencoes: Number(totalRetencoes.toFixed(2)),
    valorLiquido: Number(valorLiquido.toFixed(2)),
    baseCalculo: Number(baseCalculo.toFixed(2)),
  };
}

/**
 * Formata valor monetário para exibição
 */
export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
