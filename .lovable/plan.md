

## Diagnóstico: Fatura Bocchese gerada no mês errado

### Causa Raiz

O contrato **Bocchese & Simonetti** (Suporte mensal site) foi criado em 27/03/2026 com:
- `start_date`: 2026-03-15
- `billing_day`: 14
- `days_before_due`: 7

O CRON de geração de faturas (`generate-monthly-invoices`) rodou em 07/04 e calculou o vencimento como 14/04. Como 07/04 está dentro da janela de 7 dias antes do vencimento, a fatura de competência 2026-04 foi gerada normalmente.

**O problema**: A função `generate-monthly-invoices` **não possui nenhum campo ou lógica para definir a partir de qual mês o faturamento deve começar**. Ela simplesmente gera para todos os contratos ativos que estejam dentro da janela de emissão. Se o contrato deveria começar a faturar apenas em maio, não havia como o sistema saber disso.

O campo `start_date` indica o início do acordo, não o início do faturamento. Não existe um campo `first_billing_month` na tabela `contracts`.

### Plano de Correção

#### 1. Migração: Adicionar campo `first_billing_month` à tabela `contracts`

```sql
ALTER TABLE contracts ADD COLUMN first_billing_month text;
-- Formato: "YYYY-MM" (ex: "2026-05")
-- Quando NULL, fatura normalmente a partir do mês vigente
```

#### 2. Atualizar `generate-monthly-invoices` Edge Function

Após a verificação de duplicatas e antes da janela `days_before_due`, adicionar:

```text
Se contract.first_billing_month existir E referenceMonth < first_billing_month:
  → Pular contrato (log: "Faturamento inicia em {first_billing_month}")
```

#### 3. Atualizar `ContractForm.tsx`

Quando o usuário seleciona a "Data do Primeiro Pagamento" (`first_payment_date`), calcular e salvar automaticamente o `first_billing_month` (substring 0-7 da data). Isso garante que contratos novos com data de primeiro pagamento futura não sejam faturados antes do tempo.

#### 4. Cancelar a fatura indevida do Bocchese

Cancelar a fatura #102 (competência 2026-04) e setar `first_billing_month = "2026-05"` no contrato, para que o CRON só gere a fatura quando chegar a janela de maio.

### Arquivos a editar

| Arquivo | Mudança |
|---|---|
| Migração SQL | Adicionar coluna `first_billing_month` em `contracts` |
| `supabase/functions/generate-monthly-invoices/index.ts` | Verificar `first_billing_month` antes de gerar |
| `src/components/contracts/ContractForm.tsx` | Salvar `first_billing_month` ao definir data do primeiro pagamento |

### Resultado

- Contratos com `first_billing_month` definido só terão faturas geradas a partir daquele mês
- O formulário de contratos calcula isso automaticamente a partir da "Data do Primeiro Pagamento"
- Contratos existentes sem o campo continuam funcionando normalmente (sem restrição)

