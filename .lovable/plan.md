

# Correção E2E: Tributação Simples Nacional na Emissão de NFS-e

## Problemas Identificados

### 1. Limite de alíquota ISS hardcoded em 5%
Em `NfseTributacaoSection.tsx` (linha 58), a alíquota ISS está limitada a `Math.max(numValue, 0), 5)`. Embora o Simples Nacional tenha teto de 5% para ISS, outros regimes (Lucro Presumido/Real) podem ter valores diferentes. Além disso, o componente não exibe nenhuma informação contextual sobre o regime tributário ativo.

### 2. Regime tributário NÃO enviado ao Asaas
A Edge Function `asaas-nfse` **não envia** os campos `optanteSimplesNacional` e `incentivadorCultural` no payload da API. A documentação do Asaas exige esses campos no objeto raiz da NFS-e para calcular corretamente os impostos.

### 3. `EmitNfseAvulsaDialog` não envia dados de tributação
O diálogo de NFS-e avulsa (linha 145-157) envia apenas `aliquota` do código de serviço ao Edge Function, mas **não envia** `retain_iss`, `iss_rate`, `pis_value`, `cofins_value`, `csll_value`, `irrf_value`, `inss_value`. Os campos existem na Edge Function (`emit_standalone` aceita todos), mas o frontend não os popula.

### 4. `EmitNfseDialog` não busca regime tributário
O diálogo de emissão vinculada a fatura busca `company_settings` apenas para CNPJ e Inscrição Municipal (linha 114-121), ignorando `nfse_regime_tributario`, `nfse_optante_simples`, `nfse_incentivador_cultural` e `nfse_aliquota_padrao`.

### 5. Alíquota padrão não aplicada automaticamente
Quando `aliquotaIss` é 0 (sem contrato ou sem código de serviço configurado), nenhum fallback busca a alíquota padrão da empresa (`company_settings.nfse_aliquota_padrao`).

## Solução

### Arquivo 1: `supabase/functions/asaas-nfse/index.ts`

**Ambas as ações `emit` e `emit_standalone`**: Buscar `company_settings` para obter `nfse_optante_simples` e `nfse_incentivador_cultural`, e adicionar ao payload:

```text
invoicePayload.optanteSimplesNacional = companySettings.nfse_optante_simples ?? true;
invoicePayload.culturalProjectContributor = companySettings.nfse_incentivador_cultural ?? false;
```

A query de `company_settings` já existe parcialmente (para buscar `endereco_cidade`). Expandir para incluir os campos fiscais.

### Arquivo 2: `src/components/billing/nfse/NfseTributacaoSection.tsx`

- Remover o limite hardcoded de 5% na alíquota. Usar limite de 100% (validação genérica).
- Adicionar prop opcional `regimeTributario` para exibir badge informativo ("Simples Nacional", etc.).
- Quando regime = `simples_nacional`, exibir nota de que tributos federais estão inclusos no DAS e não devem ser retidos separadamente (exceto quando o tomador é órgão público).

### Arquivo 3: `src/components/financial/EmitNfseAvulsaDialog.tsx`

- Adicionar `NfseTributacaoSection` ao formulário, entre o campo de descrição e a seção "Gerar Fatura".
- Buscar `company_settings` para `nfse_aliquota_padrao`, `nfse_regime_tributario`, `nfse_optante_simples`.
- Inicializar `tributacao` com a alíquota sugerida do código de serviço selecionado (ou a padrão da empresa).
- Enviar todos os campos de tributação no body da mutation: `retain_iss`, `iss_rate`, `pis_value`, `cofins_value`, `csll_value`, `irrf_value`, `inss_value`, `valor_liquido`.

### Arquivo 4: `src/components/financial/EmitNfseDialog.tsx`

- Expandir a query de `company_settings` para incluir `nfse_regime_tributario`, `nfse_optante_simples`, `nfse_aliquota_padrao`.
- Usar `nfse_aliquota_padrao` como fallback quando nem o contrato nem os metadados fornecem alíquota.
- Passar `regimeTributario` para o `NfseTributacaoSection`.

### Arquivo 5: `src/components/billing/nfse/NfseDetailsSheet.tsx`

- Buscar `company_settings` para `nfse_regime_tributario` e `nfse_aliquota_padrao`.
- Usar a alíquota padrão como fallback quando o registro NFS-e tem alíquota 0.
- Passar `regimeTributario` ao `NfseTributacaoSection` no diálogo de edição.

## Detalhes Técnicos

### Payload Asaas Corrigido (emit/emit_standalone)
```text
{
  customer: "...",
  value: 420.00,
  effectiveDate: "2026-03-01",
  serviceDescription: "...",
  municipalServiceId: "...",
  municipalServiceName: "...",
  observations: "",
  deductions: 0,
  optanteSimplesNacional: true,          // NOVO
  culturalProjectContributor: false,     // NOVO
  taxes: {
    retainIss: false,
    iss: 6.00,
    pis: 0,
    cofins: 0,
    csll: 0,
    ir: 0,
    inss: 0
  }
}
```

### Regras do Simples Nacional para NFS-e
- Empresas optantes pelo Simples Nacional geralmente **não retêm** PIS, COFINS, CSLL, IR e INSS separadamente (esses tributos já estão inclusos no DAS).
- A exceção é quando o **tomador** é órgão público ou empresa de grande porte que retém na fonte.
- A alíquota ISS no Simples Nacional varia de 2% a 5% conforme a faixa de faturamento (Anexo III, IV ou V da LC 123/2006).
- O campo `optanteSimplesNacional: true` no payload do Asaas sinaliza o regime correto para cálculo.

### Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/asaas-nfse/index.ts` | Adicionar `optanteSimplesNacional` e `culturalProjectContributor` ao payload de emit e emit_standalone |
| `src/components/billing/nfse/NfseTributacaoSection.tsx` | Remover limite de 5%, adicionar prop `regimeTributario`, exibir nota informativa do Simples |
| `src/components/financial/EmitNfseAvulsaDialog.tsx` | Adicionar `NfseTributacaoSection`, buscar company_settings, enviar tributação completa |
| `src/components/financial/EmitNfseDialog.tsx` | Expandir query de company_settings, usar alíquota padrão como fallback |
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | Buscar regime tributário, usar alíquota padrão como fallback |

