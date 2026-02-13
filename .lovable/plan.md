

# Salvar Dados de NFS-e na Fatura Avulsa e Recuperar no Dialog de Emissão

## Problema

Quando o usuario cria uma fatura avulsa pelo `NfseAvulsaDialog` (com a opcao "Gerar fatura junto"), os dados de NFS-e (codigo de servico, CNAE, aliquota, descricao, tributacao) sao usados apenas para a emissao imediata, mas **nao sao salvos na fatura**. Se o usuario precisar reemitir ou consultar, esses dados se perdem.

Alem disso, o `EmitNfseDialog` bloqueia completamente faturas sem contrato, mesmo quando os dados ja foram preenchidos na origem.

## Solucao

### 1. Salvar metadados NFS-e ao criar fatura avulsa

**Arquivo:** `src/components/billing/nfse/NfseAvulsaDialog.tsx` (linha ~196-209)

Ao inserir a fatura na tabela `invoices`, incluir os dados de NFS-e no campo `processing_metadata` (jsonb, ja existe na tabela):

```text
.insert({
  client_id: clientId,
  contract_id: null,
  amount: valor,
  due_date: format(dataVencimento, "yyyy-MM-dd"),
  status: "pending",
  description: descricao,
  processing_metadata: {
    nfse_origin: "avulsa",
    service_code: serviceCode.codigo_tributacao,
    cnae: serviceCode.cnae_principal,
    aliquota: aliquotaIss,
    service_description: descricao,
    tributacao: {
      iss_retido: tributacao.issRetido,
      aliquota_iss: aliquotaIss,
      valor_pis: tributacao.valorPis,
      valor_cofins: tributacao.valorCofins,
      valor_csll: tributacao.valorCsll,
      valor_irrf: tributacao.valorIrrf,
      valor_inss: tributacao.valorInss,
    }
  }
})
```

### 2. Adaptar EmitNfseDialog para faturas sem contrato

**Arquivo:** `src/components/financial/EmitNfseDialog.tsx`

Mudancas:

| Aspecto | Atual | Novo |
|---------|-------|------|
| Validacao de contrato | Bloqueia se nao tem `contract_id` | Permite se tem `processing_metadata.nfse_origin === "avulsa"` |
| Codigo de servico | Vem do contrato | Vem do contrato OU de `processing_metadata` |
| Descricao | Fallback do contrato | Fallback de `processing_metadata.service_description` |
| Aliquota ISS | Do contrato | Do contrato OU de `processing_metadata.aliquota` |
| Tributacao inicial | Zerada | Pre-preenchida com valores de `processing_metadata.tributacao` |
| `canEmit` | `isConfigured && hasContract && isAsaasConfigured` | `isConfigured && isAsaasConfigured && (hasContract \|\| isStandaloneNfse)` |
| Action na API | Sempre `emit` | `emit` (com contrato) ou `emit_standalone` (avulsa) |
| Alerta de contrato | Sempre mostra para avulsas | Mostra apenas se nao e avulsa e nao tem contrato |

A logica de leitura dos metadados:

```text
const metadata = invoice.processing_metadata as any;
const isStandaloneNfse = metadata?.nfse_origin === "avulsa";

// Se avulsa, usar dados salvos
const serviceCode = isStandaloneNfse ? metadata.service_code : contract?.nfse_service_code;
const cnae = isStandaloneNfse ? metadata.cnae : contract?.nfse_cnae;
const aliquotaIss = isStandaloneNfse ? (metadata.aliquota ?? 0) : (contract?.nfse_service_codes?.aliquota_sugerida ?? 0);
```

### Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| `src/components/billing/nfse/NfseAvulsaDialog.tsx` | Salvar `processing_metadata` com dados NFS-e ao criar fatura |
| `src/components/financial/EmitNfseDialog.tsx` | Ler `processing_metadata` como fallback, remover bloqueio para avulsas, ajustar mutation para usar `emit_standalone` |

### Beneficios
- Dados preenchidos na origem sao preservados e reutilizados
- Nenhuma mudanca no banco de dados (usa campo `processing_metadata` existente)
- Compativel com faturas com contrato (comportamento atual mantido)
- Fluxo de reemissao funciona sem retrabalho manual

