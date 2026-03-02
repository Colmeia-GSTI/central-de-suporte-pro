
# Correção Definitiva: Alíquota ISS nos Contratos (Existentes + Futuros)

## Problema

4 contratos ativos com `nfse_enabled = true` possuem `nfse_aliquota = 0`, causando rejeição do Asaas ao emitir NFS-e. A causa raiz está em dois pontos:

1. **Schema do formulário**: O default de `nfse_aliquota` no Zod schema é `0` em vez de usar a alíquota padrão da empresa (`6%`)
2. **Validação ausente**: O formulário permite salvar contrato com NFS-e habilitada e alíquota zero, sem qualquer aviso
3. **Dados existentes**: 4 contratos já salvos com valor `0` precisam ser corrigidos no banco

## Solução

### 1. Corrigir os 4 contratos existentes no banco de dados

Atualizar diretamente os registros com `nfse_aliquota = 0` para usar a alíquota padrão da empresa (`6.00`):

- Cloud BSSoft
- CVR COMERCIO DE CONFECCOES LTDA
- Gestão de TI - Remoto
- RUARO COMERCIO DE CONFECCOES LTDA

**Ferramenta**: Insert/Update tool (dados, não schema)

### 2. ContractForm: Carregar alíquota padrão da empresa

No `ContractForm.tsx`, buscar `nfse_aliquota_padrao` da tabela `company_settings` e usar como valor default quando o contrato for novo (sem `contractData`).

**Mudanças**:
- Adicionar `useQuery` para buscar `company_settings` (campos: `nfse_aliquota_padrao`, `nfse_cnae_padrao`, `nfse_codigo_tributacao_padrao`)
- No `defaultValues` do form, substituir o default fixo `0` pela alíquota da empresa
- Usar `useEffect` para atualizar os valores do form quando os dados da empresa carregarem (apenas para contratos novos)

### 3. ContractForm: Validação obrigatória quando NFS-e habilitada

Adicionar validação Zod condicional (via `refine`/`superRefine`): quando `nfse_enabled = true`, `nfse_aliquota` deve ser maior que `0`.

**Mudança no schema**:
```text
contractSchema com .superRefine:
  - Se nfse_enabled === true e nfse_aliquota <= 0:
    -> Adicionar erro no campo nfse_aliquota: "Alíquota ISS obrigatória quando NFS-e está habilitada"
  - Se nfse_enabled === true e nfse_service_code está vazio:
    -> Adicionar erro: "Código de serviço obrigatório quando NFS-e está habilitada"
```

### 4. Fallback no motor de faturamento (já implementado)

A validação de alíquota no `generate-monthly-invoices` já está em produção (implementação anterior). Ela serve como rede de segurança caso um contrato passe sem alíquota.

## Arquivos Modificados

| Arquivo | Alteração |
|---|---|
| Banco de dados (UPDATE) | Atualizar 4 contratos: `nfse_aliquota = 6.00` |
| `src/components/contracts/ContractForm.tsx` | Buscar alíquota padrão da empresa, aplicar como default, validação condicional no schema |

## Fluxo Corrigido

```text
Novo Contrato:
  1. Formulário abre com nfse_aliquota = 6% (da empresa)
  2. Ao selecionar código de serviço, alíquota sugerida substitui
  3. Se NFS-e habilitada e alíquota = 0, form BLOQUEIA submissão
  4. Motor de faturamento valida novamente (rede de segurança)

Contrato Existente (edição):
  1. Carrega alíquota salva no contrato
  2. Se era 0, validação impede salvar com NFS-e habilitada
```
