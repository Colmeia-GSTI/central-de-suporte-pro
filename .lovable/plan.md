

# CNAE Padrão da Empresa nas Notas Fiscais

## Problema

O CNAE cadastrado nas configurações da empresa (`company_settings.nfse_cnae_padrao`) não é utilizado como fallback na emissão de NFS-e. Quando o código de serviço selecionado não possui CNAE ou nenhum código é selecionado, o campo CNAE vai como `null`, podendo causar rejeição.

## Pontos afetados

1. **`EmitNfseAvulsaDialog`**: Não busca `nfse_cnae_padrao` da empresa. Envia apenas `selectedServiceCode.cnae_principal`, que pode ser `null`.
2. **`EmitNfseDialog`**: Não busca `nfse_cnae_padrao` da empresa. O `effectiveCnae` não tem fallback para o CNAE padrão.
3. **Edge Function `asaas-nfse`**: Na ação `emit_standalone`, recebe `cnae` do frontend mas não tem fallback. Na ação `emit`, o CNAE vem do contrato sem fallback.

## Solução

### Arquivo 1: `src/components/financial/EmitNfseAvulsaDialog.tsx`
- Adicionar `nfse_cnae_padrao` na query de `company_settings` (linha 112)
- Na mutation, usar fallback: `cnae: selectedServiceCode.cnae_principal || companyConfig?.nfse_cnae_padrao`

### Arquivo 2: `src/components/financial/EmitNfseDialog.tsx`
- Adicionar `nfse_cnae_padrao` na query de `company_settings` (linha 116)
- No `effectiveCnae`, adicionar fallback: `|| companyConfig?.nfse_cnae_padrao`

### Arquivo 3: `supabase/functions/asaas-nfse/index.ts`
- Na ação `emit_standalone`, expandir a query de `company_settings` (linha 1042) para incluir `nfse_cnae_padrao`
- Usar fallback: `cnae || companyData?.nfse_cnae_padrao || null` ao gravar no `nfse_history`
- Na ação `emit`, aplicar o mesmo fallback buscando `nfse_cnae_padrao` se o contrato não tiver CNAE

## Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `src/components/financial/EmitNfseAvulsaDialog.tsx` | Buscar `nfse_cnae_padrao`, usar como fallback no envio |
| `src/components/financial/EmitNfseDialog.tsx` | Buscar `nfse_cnae_padrao`, usar como fallback no `effectiveCnae` |
| `supabase/functions/asaas-nfse/index.ts` | Fallback para CNAE padrão da empresa em `emit` e `emit_standalone` |
