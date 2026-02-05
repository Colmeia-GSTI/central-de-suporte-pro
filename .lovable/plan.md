
# Plano de Acao - Fase 1: Correcoes Criticas do Sistema de Cobranca

Baseado no documento REVIEW_SISTEMA_COBRANCA.md, este plano implementa as correcoes da **Fase 1** (itens 1-8) que tem impacto imediato na receita e integridade dos dados.

---

## 0. Corrigir Build Error (Bloqueante)

O build esta falhando porque `esm.sh` retorna erro 500 para imports de `@supabase/supabase-js`. Isso e um problema transiente do CDN, mas para maior estabilidade, vamos padronizar o import em `apply-contract-adjustment/index.ts` para usar `@2` (sem versao especifica pinada como `@2.95.1`).

**Arquivo:** `supabase/functions/apply-contract-adjustment/index.ts`
- Alterar import para `https://esm.sh/@supabase/supabase-js@2`

---

## 1. Preencher `payment_method` na geracao de faturas (Review 1.1)

**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`

Na linha 300-312, o insert de invoices nao inclui `payment_method`. Adicionar:
```
payment_method: contract.payment_preference || 'boleto'
```

Sem isso, o `poll-boleto-status` nunca encontra faturas para atualizar (filtra por `payment_method = 'boleto'`).

---

## 2. Incluir `contract_services` na geracao de faturas (Review 1.2)

**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`

Apos criar a fatura, buscar `contract_services` do contrato e gerar `invoice_items` correspondentes. Atualmente so considera `additional_charges`.

Adicionar apos linha 370:
- Query `contract_services` pelo `contract_id`
- Para cada servico, inserir em `invoice_items` com `description`, `quantity`, `unit_value`, `total_value`

---

## 3. Recriar indices criticos removidos (Review 1.7)

**Migracao SQL:**
```sql
CREATE INDEX IF NOT EXISTS idx_nfse_history_contract ON nfse_history(contract_id);
CREATE INDEX IF NOT EXISTS idx_nfse_history_invoice ON nfse_history(invoice_id);
CREATE INDEX IF NOT EXISTS idx_nfse_history_client ON nfse_history(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_active ON contracts(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_invoices_reference_month ON invoices(reference_month);
CREATE INDEX IF NOT EXISTS idx_financial_entries_client ON financial_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_financial_entries_created ON financial_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_client_contacts_user_client ON client_contacts(user_id, client_id);
```

---

## 4. Corrigir webhook para atualizar faturas "overdue" (Review 1.4)

**Arquivo:** `supabase/functions/webhook-asaas-nfse/index.ts` (linha 378)

Alterar:
```
.eq("status", "pending")
```
Para:
```
.in("status", ["pending", "overdue"])
```

Isso garante que um cliente que paga um boleto vencido tenha a fatura atualizada corretamente.

---

## 5. Corrigir campo `mensagem_erro` no webhook (Review 4.1.5)

**Arquivo:** `supabase/functions/webhook-asaas-nfse/index.ts`

O codigo usa `mensagem_erro` mas a coluna no banco e `mensagem_retorno`. Buscar e substituir todas as ocorrencias.

---

## 6. Remover FK bidirecional invoice-nfse (Review 1.8)

**Migracao SQL:**
```sql
ALTER TABLE invoices DROP COLUMN IF EXISTS nfse_history_id;
```

A relacao correta e `nfse_history.invoice_id -> invoices.id` (1:N). O campo `invoices.nfse_history_id` cria dependencia circular desnecessaria.

---

## 7. Verificacao de duplicatas mais robusta (Review 2.1.1)

**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts` (linha 254)

Alterar:
```
.neq("status", "cancelled")
```
Para:
```
.not("status", "in", '("cancelled","voided")')
```

---

## 8. Deteccao de duplicidade em `contract_services.name` (Review 5.1.3)

**Verificacao:** A tabela `contract_services` ja tem a coluna `name` (confirmado no schema). Este item do review ja foi resolvido -- a coluna existe.

---

## Resumo de Arquivos a Modificar

| # | Arquivo | Mudanca |
|---|---------|---------|
| 0 | `supabase/functions/apply-contract-adjustment/index.ts` | Fix import esm.sh |
| 1 | `supabase/functions/generate-monthly-invoices/index.ts` | Adicionar `payment_method` + `invoice_items` de `contract_services` + duplicata check |
| 2 | `supabase/functions/webhook-asaas-nfse/index.ts` | Fix status filter "overdue" + campo `mensagem_retorno` |
| 3 | Migracao SQL | Recriar indices + remover `nfse_history_id` |

## Ordem de Execucao

1. Fix build error (import esm.sh)
2. Migracao SQL (indices + remover FK circular)
3. Edge function `generate-monthly-invoices` (payment_method + contract_services + duplicata)
4. Edge function `webhook-asaas-nfse` (overdue + mensagem_retorno)

## Detalhes Tecnicos

### Contract Services -> Invoice Items

Adicionar ao `generate-monthly-invoices`, apos a criacao da fatura:

```typescript
// Fetch contract services
const { data: services } = await supabase
  .from("contract_services")
  .select("name, description, quantity, unit_value, value")
  .eq("contract_id", contract.id);

if (services && services.length > 0) {
  const items = services.map(s => ({
    invoice_id: newInvoice.id,
    description: s.description || s.name,
    quantity: s.quantity || 1,
    unit_value: s.unit_value || s.value,
    total_value: s.value,
  }));
  await supabase.from("invoice_items").insert(items);
}
```

### Webhook Fix - Multiplos Locais

No `webhook-asaas-nfse/index.ts`, existem pelo menos 2 locais onde `.eq("status", "pending")` precisa ser alterado para `.in("status", ["pending", "overdue"])`:
- Processamento de pagamento confirmado
- Processamento de fatura vencida (ja correto - muda para "overdue")
