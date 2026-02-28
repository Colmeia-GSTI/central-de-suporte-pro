

# Plano Combinado: Respeitar `days_before_due` + Validar alíquota ISS antes de emitir NFS-e

## Problemas Identificados

### Problema 1: Faturas geradas fora da janela de antecedência
A rotina `generate-monthly-invoices` busca o campo `days_before_due` do contrato mas **nunca o utiliza**. Resultado: o CRON gera faturas para TODOS os contratos ativos toda vez que roda, mesmo quando faltam semanas para o vencimento.

**Exemplo:** Contrato com vencimento dia 10 e `days_before_due = 5` deveria gerar fatura apenas a partir do dia 5. Mas hoje a fatura é gerada a qualquer momento.

### Problema 2: NFS-e emitida com alíquota zero
O contrato "Cloud BSSoft" tem `nfse_aliquota: 0`. O Asaas rejeita com o erro "Necessário informar os impostos da nota fiscal". O sistema não valida a alíquota antes de chamar a API, causando erro e tentativas repetidas desnecessárias.

---

## Solução

### Arquivo: `supabase/functions/generate-monthly-invoices/index.ts`

**Correção 1 -- Janela de geração antecipada (após linha 355, antes de buscar cobranças adicionais):**

Adicionar verificação usando `days_before_due`:
- Calcular `generateAfterDate = dueDate - days_before_due` (default 5 dias)
- Se a data atual for anterior a `generateAfterDate` **e** não for geração manual (`manualContractId`), pular o contrato com log descritivo
- Geração manual (via UI) ignora essa verificação

**Correção 2 -- Validar alíquota antes de emitir NFS-e (linha 549, bloco `if (contract.nfse_enabled)`):**

Antes de invocar `asaas-nfse`, verificar se `nfse_aliquota > 0`. Se for zero ou null:
- Registrar erro descritivo na fatura (`nfse_status: "erro"`, `nfse_error_msg: "Alíquota ISS não configurada..."`)
- Logar no `application_logs` com instrução de correção
- NÃO chamar a API do Asaas

**Correção 3 -- Atualizar interface Contract (linha 8):**

Adicionar os campos `nfse_aliquota` e `nfse_iss_retido` à interface TypeScript `Contract`, que já são buscados na query mas não estão tipados.

---

## Detalhes Técnicos

```text
Para cada contrato ativo:
  1. Verificar fatura existente para a competência -> skip se sim
  2. Calcular dueDate baseado no billing_day
  3. Se dueDate já passou -> avançar competência
  4. [NOVO] Calcular generateAfterDate = dueDate - days_before_due
  5. [NOVO] Se hoje < generateAfterDate E não é manual -> skip + log
  6. Buscar cobranças adicionais, criar fatura
  7. Gerar pagamento (boleto/pix)
  8. [NOVO] Verificar nfse_aliquota > 0 antes de emitir NFS-e
  9. Enviar notificações
```

## Impacto

| Cenário | Antes | Depois |
|---|---|---|
| Contrato vence dia 10, days_before_due=5, CRON roda dia 1 | Fatura gerada | Pulada (fora da janela) |
| Contrato vence dia 10, days_before_due=5, CRON roda dia 5 | Fatura gerada | Fatura gerada (dentro da janela) |
| Geração manual pelo usuário | Funciona | Continua funcionando (bypass) |
| NFS-e com alíquota 0 | Erro do Asaas, sem contexto | Erro local claro, sem chamada à API |
| NFS-e com alíquota 6% | Funciona | Continua funcionando |

## Arquivo Modificado

| Arquivo | Alterações |
|---|---|
| `supabase/functions/generate-monthly-invoices/index.ts` | Tipar interface Contract, adicionar verificação days_before_due, validar alíquota ISS |

