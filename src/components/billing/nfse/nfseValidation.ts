import { z } from "zod";

export type ValidationIssue = {
  level: "error" | "warning";
  field: string;
  message: string;
  code: string;
};

export type ValidationResult = {
  isValid: boolean;
  issues: ValidationIssue[];
};

const competenciaSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência deve estar no formato AAAA-MM");

export function normalizeCompetencia(value: string | null | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  // Accept YYYY-MM-DD and normalize to YYYY-MM
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);
  return trimmed;
}

export function validateCompetencia(value: string | null | undefined): ValidationIssue[] {
  if (!value) {
    return [
      {
        level: "error",
        field: "competencia",
        message: "Competência é obrigatória",
        code: "COMPETENCIA_OBRIGATORIA",
      },
    ];
  }
  const normalized = normalizeCompetencia(value);
  const parsed = competenciaSchema.safeParse(normalized);
  if (!parsed.success) {
    return [
      {
        level: "error",
        field: "competencia",
        message: parsed.error.issues[0]?.message ?? "Competência inválida",
        code: "COMPETENCIA_FORMATO",
      },
    ];
  }

  const [yearStr] = normalized.split("-");
  const year = Number(yearStr);
  const currentYear = new Date().getFullYear();
  if (year < 2020 || year > currentYear + 1) {
    return [
      {
        level: "error",
        field: "competencia",
        message: `Ano da competência fora do intervalo válido (2020-${currentYear + 1})`,
        code: "COMPETENCIA_ANO",
      },
    ];
  }

  return [];
}

export function validateDescricao(descricao: string | null | undefined): ValidationIssue[] {
  const value = (descricao ?? "").trim();
  if (!value) {
    return [
      {
        level: "error",
        field: "descricao_servico",
        message: "Descrição do serviço é obrigatória",
        code: "DESCRICAO_OBRIGATORIA",
      },
    ];
  }

  const issues: ValidationIssue[] = [];

  if (value.length > 2000) {
    issues.push({
      level: "error",
      field: "descricao_servico",
      message: "Descrição excede 2000 caracteres",
      code: "DESCRICAO_TAMANHO",
    });
  }

  if (value.length < 10) {
    issues.push({
      level: "warning",
      field: "descricao_servico",
      message: "Descrição muito curta (recomendado mínimo de 10 caracteres)",
      code: "DESCRICAO_CURTA",
    });
  }

  const xmlPatterns = /<script|<\?xml|<!DOCTYPE|<!\[CDATA\[/i;
  if (xmlPatterns.test(value)) {
    issues.push({
      level: "error",
      field: "descricao_servico",
      message: "Descrição contém caracteres/padrões não permitidos",
      code: "DESCRICAO_CARACTERES",
    });
  }

  return issues;
}

export function validateValor(valor: number | null | undefined): ValidationIssue[] {
  if (valor === null || valor === undefined || Number.isNaN(valor)) {
    return [
      {
        level: "error",
        field: "valor_servico",
        message: "Valor do serviço é obrigatório",
        code: "VALOR_OBRIGATORIO",
      },
    ];
  }

  if (valor <= 0) {
    return [
      {
        level: "error",
        field: "valor_servico",
        message: "Valor do serviço deve ser maior que zero",
        code: "VALOR_INVALIDO",
      },
    ];
  }

  if (valor > 999_999_999.99) {
    return [
      {
        level: "error",
        field: "valor_servico",
        message: "Valor do serviço excede o limite máximo",
        code: "VALOR_EXCEDIDO",
      },
    ];
  }

  return [];
}

export function validateCodigoTributacao(codigo: string | null | undefined): ValidationIssue[] {
  const value = (codigo ?? "").trim();
  if (!value) {
    return [
      {
        level: "error",
        field: "codigo_tributacao",
        message: "Código de tributação é obrigatório",
        code: "CODIGO_OBRIGATORIO",
      },
    ];
  }
  if (!/^\d{6}$/.test(value)) {
    return [
      {
        level: "error",
        field: "codigo_tributacao",
        message: "Código de tributação deve conter exatamente 6 dígitos",
        code: "CODIGO_FORMATO",
      },
    ];
  }
  return [];
}

export function validateCnae(cnae: string | null | undefined): ValidationIssue[] {
  const value = (cnae ?? "").trim();
  if (!value) {
    return [
      {
        level: "warning",
        field: "cnae",
        message: "CNAE não informado (verifique se o município exige)",
        code: "CNAE_AUSENTE",
      },
    ];
  }
  if (!/^\d{7}$/.test(value)) {
    return [
      {
        level: "error",
        field: "cnae",
        message: "CNAE deve conter exatamente 7 dígitos",
        code: "CNAE_FORMATO",
      },
    ];
  }
  return [];
}

export function validateAliquota(aliquota: number | null | undefined): ValidationIssue[] {
  if (aliquota === null || aliquota === undefined) return [];
  if (Number.isNaN(aliquota)) {
    return [
      {
        level: "error",
        field: "aliquota",
        message: "Alíquota inválida",
        code: "ALIQUOTA_INVALIDA",
      },
    ];
  }
  if (aliquota < 0 || aliquota > 100) {
    return [
      {
        level: "error",
        field: "aliquota",
        message: "Alíquota deve estar entre 0% e 100%",
        code: "ALIQUOTA_INTERVALO",
      },
    ];
  }
  return [];
}

export function validateCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return false;
  if (/^(\d)\1+$/.test(clean)) return false;

  const calc = (digits: string, factor: number): number => {
    const sum = digits.split("").reduce((acc, digit, i) => acc + Number(digit) * (factor - i), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const digit1 = calc(clean.slice(0, 9), 10);
  const digit2 = calc(clean.slice(0, 10), 11);
  return clean.endsWith(`${digit1}${digit2}`);
}

export function validateCnpj(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;

  const calc = (digits: string, weights: number[]): number => {
    const sum = digits.split("").reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calc(clean.slice(0, 12), w1);
  const d2 = calc(clean.slice(0, 12) + d1, w2);
  return clean.endsWith(`${d1}${d2}`);
}

export function validateDocumento(document: string | null | undefined): ValidationIssue[] {
  const raw = (document ?? "").trim();
  if (!raw) {
    return [
      {
        level: "error",
        field: "client.document",
        message: "Cliente não possui CNPJ/CPF cadastrado",
        code: "CLIENTE_DOCUMENTO",
      },
    ];
  }

  const clean = raw.replace(/\D/g, "");
  if (clean.length === 11) {
    if (!validateCpf(clean)) {
      return [
        {
          level: "error",
          field: "client.document",
          message: "CPF do cliente inválido (dígitos verificadores incorretos)",
          code: "CLIENTE_CPF_CHECKSUM",
        },
      ];
    }
    return [];
  }

  if (clean.length === 14) {
    if (!validateCnpj(clean)) {
      return [
        {
          level: "error",
          field: "client.document",
          message: "CNPJ do cliente inválido (dígitos verificadores incorretos)",
          code: "CLIENTE_CNPJ_CHECKSUM",
        },
      ];
    }
    return [];
  }

  return [
    {
      level: "error",
      field: "client.document",
      message: "CNPJ/CPF do cliente deve ter 11 ou 14 dígitos",
      code: "CLIENTE_DOCUMENTO_FORMATO",
    },
  ];
}

export function buildNfseValidation(input: {
  valor_servico: number | null | undefined;
  competencia: string | null | undefined;
  descricao_servico: string | null | undefined;
  codigo_tributacao: string | null | undefined;
  cnae: string | null | undefined;
  aliquota: number | null | undefined;
  client:
    | {
        name: string | null | undefined;
        document: string | null | undefined;
        email?: string | null | undefined;
        address?: string | null | undefined;
      }
    | null
    | undefined;
  company:
    | {
        cnpj: string | null | undefined;
        inscricao_municipal: string | null | undefined;
        endereco_codigo_ibge?: string | null | undefined;
      }
    | null
    | undefined;
}): ValidationResult {
  const issues: ValidationIssue[] = [];

  issues.push(...validateValor(input.valor_servico));
  issues.push(...validateCompetencia(input.competencia));
  issues.push(...validateDescricao(input.descricao_servico));
  issues.push(...validateCodigoTributacao(input.codigo_tributacao));
  issues.push(...validateCnae(input.cnae));
  issues.push(...validateAliquota(input.aliquota));

  if (!input.client) {
    issues.push({
      level: "error",
      field: "client_id",
      message: "Cliente é obrigatório",
      code: "CLIENTE_OBRIGATORIO",
    });
  } else {
    const name = (input.client.name ?? "").trim();
    if (name.length < 2) {
      issues.push({
        level: "error",
        field: "client.name",
        message: "Nome do cliente é obrigatório",
        code: "CLIENTE_NOME",
      });
    }
    issues.push(...validateDocumento(input.client.document));

    if (!input.client.address) {
      issues.push({
        level: "warning",
        field: "client.address",
        message: "Endereço do cliente não informado",
        code: "CLIENTE_ENDERECO",
      });
    }

    if (!input.client.email) {
      issues.push({
        level: "warning",
        field: "client.email",
        message: "E-mail do cliente não informado (necessário para envio automático)",
        code: "CLIENTE_EMAIL",
      });
    }
  }

  if (!input.company) {
    issues.push({
      level: "warning",
      field: "company",
      message: "Configuração da empresa não encontrada. Verifique Configurações → Empresa",
      code: "EMPRESA_NAO_CONFIGURADA",
    });
  } else {
    const cnpj = (input.company.cnpj ?? "").trim();
    if (!cnpj) {
      issues.push({
        level: "error",
        field: "company.cnpj",
        message: "CNPJ da empresa não configurado",
        code: "EMPRESA_CNPJ",
      });
    }

    if (!input.company.inscricao_municipal) {
      issues.push({
        level: "error",
        field: "company.inscricao_municipal",
        message: "Inscrição Municipal não configurada",
        code: "EMPRESA_IM",
      });
    }

    if (!input.company.endereco_codigo_ibge) {
      issues.push({
        level: "warning",
        field: "company.endereco_codigo_ibge",
        message: "Código IBGE do município não configurado",
        code: "EMPRESA_IBGE",
      });
    }
  }

  return { isValid: issues.every((i) => i.level !== "error"), issues };
}