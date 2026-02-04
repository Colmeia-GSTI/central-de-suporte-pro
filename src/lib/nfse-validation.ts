/**
 * NFS-e Validation Rules for Portal Nacional da NFS-e
 * Based on the DPS (Declaração de Prestação de Serviço) standard
 */

export interface NfseValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

interface NfseData {
  valor_servico: number;
  competencia: string | null;
  descricao_servico: string | null;
  codigo_tributacao: string | null;
  cnae: string | null;
  aliquota: number | null;
  client_id: string | null;
}

interface ClientData {
  name: string;
  document: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  email: string | null;
  financial_email?: string | null;
}

interface CompanyData {
  cnpj: string | null;
  inscricao_municipal: string | null;
  endereco_codigo_ibge: string | null;
}

/**
 * Validates NFS-e data before submission
 */
export function validateNfseData(
  nfse: NfseData,
  client?: ClientData | null,
  company?: CompanyData | null
): NfseValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // === VALOR ===
  if (!nfse.valor_servico || nfse.valor_servico <= 0) {
    errors.push({
      field: "valor_servico",
      message: "Valor do serviço deve ser maior que zero",
      code: "VALOR_INVALIDO",
    });
  } else if (nfse.valor_servico > 999999999.99) {
    errors.push({
      field: "valor_servico",
      message: "Valor do serviço excede o limite máximo",
      code: "VALOR_EXCEDIDO",
    });
  }

  // === COMPETÊNCIA ===
  if (!nfse.competencia) {
    errors.push({
      field: "competencia",
      message: "Competência é obrigatória",
      code: "COMPETENCIA_OBRIGATORIA",
    });
  } else {
    const compMatch = nfse.competencia.match(/^(\d{4})-(\d{2})(-\d{2})?$/);
    if (!compMatch) {
      errors.push({
        field: "competencia",
        message: "Formato de competência inválido (esperado: YYYY-MM)",
        code: "COMPETENCIA_FORMATO",
      });
    } else {
      const year = parseInt(compMatch[1]);
      const month = parseInt(compMatch[2]);
      const currentYear = new Date().getFullYear();
      
      if (year < 2020 || year > currentYear + 1) {
        errors.push({
          field: "competencia",
          message: `Ano da competência fora do intervalo válido (2020-${currentYear + 1})`,
          code: "COMPETENCIA_ANO",
        });
      }
      if (month < 1 || month > 12) {
        errors.push({
          field: "competencia",
          message: "Mês da competência inválido",
          code: "COMPETENCIA_MES",
        });
      }
    }
  }

  // === DESCRIÇÃO ===
  if (!nfse.descricao_servico || nfse.descricao_servico.trim().length === 0) {
    errors.push({
      field: "descricao_servico",
      message: "Descrição do serviço é obrigatória",
      code: "DESCRICAO_OBRIGATORIA",
    });
  } else {
    if (nfse.descricao_servico.length > 2000) {
      errors.push({
        field: "descricao_servico",
        message: "Descrição excede 2000 caracteres",
        code: "DESCRICAO_TAMANHO",
      });
    }
    if (nfse.descricao_servico.length < 10) {
      warnings.push({
        field: "descricao_servico",
        message: "Descrição muito curta (recomendado mínimo 10 caracteres)",
      });
    }
    // Check for XML injection patterns
    const xmlPatterns = /<script|<\?xml|<!DOCTYPE|<!\[CDATA\[/i;
    if (xmlPatterns.test(nfse.descricao_servico)) {
      errors.push({
        field: "descricao_servico",
        message: "Descrição contém caracteres não permitidos",
        code: "DESCRICAO_CARACTERES",
      });
    }
  }

  // === CÓDIGO DE TRIBUTAÇÃO ===
  if (!nfse.codigo_tributacao) {
    errors.push({
      field: "codigo_tributacao",
      message: "Código de tributação é obrigatório",
      code: "CODIGO_OBRIGATORIO",
    });
  } else if (!/^\d{6}$/.test(nfse.codigo_tributacao)) {
    errors.push({
      field: "codigo_tributacao",
      message: "Código de tributação deve conter exatamente 6 dígitos",
      code: "CODIGO_FORMATO",
    });
  }

  // === CNAE ===
  if (!nfse.cnae) {
    warnings.push({
      field: "cnae",
      message: "CNAE não informado (será usado padrão 6209100)",
    });
  } else if (!/^\d{7}$/.test(nfse.cnae)) {
    errors.push({
      field: "cnae",
      message: "CNAE deve conter exatamente 7 dígitos",
      code: "CNAE_FORMATO",
    });
  }

  // === ALÍQUOTA ===
  if (nfse.aliquota !== null && nfse.aliquota !== undefined) {
    if (nfse.aliquota < 0 || nfse.aliquota > 100) {
      errors.push({
        field: "aliquota",
        message: "Alíquota deve estar entre 0% e 100%",
        code: "ALIQUOTA_INTERVALO",
      });
    }
  }

  // === CLIENTE ===
  if (!nfse.client_id) {
    errors.push({
      field: "client_id",
      message: "Cliente é obrigatório",
      code: "CLIENTE_OBRIGATORIO",
    });
  }

  if (client) {
    if (!client.document) {
      errors.push({
        field: "client.document",
        message: "Cliente não possui CNPJ/CPF cadastrado",
        code: "CLIENTE_DOCUMENTO",
      });
    } else {
      const cleanDoc = client.document.replace(/\D/g, "");
      if (cleanDoc.length === 11) {
        if (!validateCpf(cleanDoc)) {
          errors.push({
            field: "client.document",
            message: "CPF do cliente inválido (dígitos verificadores incorretos)",
            code: "CLIENTE_CPF_CHECKSUM",
          });
        }
      } else if (cleanDoc.length === 14) {
        if (!validateCnpj(cleanDoc)) {
          errors.push({
            field: "client.document",
            message: "CNPJ do cliente inválido (dígitos verificadores incorretos)",
            code: "CLIENTE_CNPJ_CHECKSUM",
          });
        }
      } else {
        errors.push({
          field: "client.document",
          message: "CNPJ/CPF do cliente deve ter 11 ou 14 dígitos",
          code: "CLIENTE_DOCUMENTO_FORMATO",
        });
      }
    }

    if (!client.name || client.name.trim().length < 2) {
      errors.push({
        field: "client.name",
        message: "Nome do cliente é obrigatório",
        code: "CLIENTE_NOME",
      });
    }

    if (!client.address) {
      errors.push({
        field: "client.address",
        message: "Endereço do cliente é obrigatório para emissão de NFS-e",
        code: "CLIENTE_ENDERECO",
      });
    }

    // Validar CEP - obrigatório para NFS-e
    const zip = (client.zip_code ?? "").replace(/\D/g, "");
    if (!zip || zip.length !== 8) {
      errors.push({
        field: "client.zip_code",
        message: "CEP do cliente inválido ou não informado (deve ter 8 dígitos)",
        code: "CLIENTE_CEP",
      });
    }

    if (!client.email) {
      errors.push({
        field: "client.email",
        message: "E-mail do cliente é obrigatório para emissão de NFS-e",
        code: "CLIENTE_EMAIL",
      });
    }
  }

  // === EMPRESA ===
  if (company) {
    if (!company.cnpj) {
      errors.push({
        field: "company.cnpj",
        message: "CNPJ da empresa não configurado",
        code: "EMPRESA_CNPJ",
      });
    } else {
      const cleanCnpj = company.cnpj.replace(/\D/g, "");
      if (cleanCnpj.length !== 14) {
        errors.push({
          field: "company.cnpj",
          message: "CNPJ da empresa inválido (deve ter 14 dígitos)",
          code: "EMPRESA_CNPJ_FORMATO",
        });
      } else if (!validateCnpj(cleanCnpj)) {
        errors.push({
          field: "company.cnpj",
          message: "CNPJ da empresa inválido (dígitos verificadores incorretos)",
          code: "EMPRESA_CNPJ_CHECKSUM",
        });
      }
    }

    if (!company.inscricao_municipal) {
      errors.push({
        field: "company.inscricao_municipal",
        message: "Inscrição Municipal não configurada",
        code: "EMPRESA_IM",
      });
    }

    if (!company.endereco_codigo_ibge) {
      warnings.push({
        field: "company.endereco_codigo_ibge",
        message: "Código IBGE do município não configurado",
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates CNPJ checksum
 */
export function validateCnpj(cnpj: string): boolean {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return false;
  if (/^(\d)\1+$/.test(clean)) return false;

  const calc = (digits: string, weights: number[]): number => {
    const sum = digits.split("").reduce((acc, digit, i) => {
      return acc + parseInt(digit) * weights[i];
    }, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const digit1 = calc(clean.slice(0, 12), weights1);
  const digit2 = calc(clean.slice(0, 12) + digit1, weights2);

  return clean.endsWith(`${digit1}${digit2}`);
}

/**
 * Validates CPF checksum
 */
export function validateCpf(cpf: string): boolean {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return false;
  if (/^(\d)\1+$/.test(clean)) return false;

  const calc = (digits: string, factor: number): number => {
    const sum = digits.split("").reduce((acc, digit, i) => {
      return acc + parseInt(digit) * (factor - i);
    }, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const digit1 = calc(clean.slice(0, 9), 10);
  const digit2 = calc(clean.slice(0, 10), 11);

  return clean.endsWith(`${digit1}${digit2}`);
}

/**
 * Format validation result for display
 */
export function formatValidationMessage(result: NfseValidationResult): string {
  const lines: string[] = [];
  
  if (result.errors.length > 0) {
    lines.push("ERROS:");
    result.errors.forEach((e, i) => {
      lines.push(`${i + 1}. ${e.message} [${e.code}]`);
    });
  }
  
  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("AVISOS:");
    result.warnings.forEach((w, i) => {
      lines.push(`${i + 1}. ${w.message}`);
    });
  }
  
  return lines.join("\n");
}
