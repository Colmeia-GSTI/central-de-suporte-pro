# Revisões futuras e backlog de retomada

> **Última atualização:** 2026-05-08 (fim da sessão de Fase 3 + hotfixes)
> Documento curto e operacional. Para detalhes técnicos, ver `FINANCIAL_DEEP_AUDIT.md` e `PROJECT_REFACTOR_PLAN.md`.

## Estado atual (snapshot)

**Fases concluídas e em produção:**
- Auditoria profunda (`docs/FINANCIAL_DEEP_AUDIT.md`)
- Fase 1 — Helpers de data + Status Badges unificados
- Fase 2 — Hooks centralizados (`useInvoices`, `useInvoice`)
- Fase 3.A — Componentes reusáveis (`InvoiceStatusFilter`, `InvoiceTableRow`)
- Fase 3.B — Migração da tabela desktop do BillingInvoicesTab
- Fase 3.C.1 — Estender Faturas com filtros (payment_method, with_errors estendido)
- Fase 3.C.2 — Redirects de URLs antigas (compat layer)
- Fase 3.C.3 — Remoção efetiva de BillingBoletosTab + AccountsReceivableTab + BillingErrorsPanel (-2.031 LOC)
- 4 hotfixes (PR #30, #31, #32 + Lovable Agent) corrigindo bugs descobertos em produção

**Saldo:** ~-1.700 LOC líquidas, 11 → 8 tabs, 119 testes verdes.

**Última verificação visual pendente:** confirmar em `suporte.colmeiagsti.com/billing` que o card "Recebido" mostra R$ 8.990,68 (não R$ 9.021,68). Diferença de R$ 31,00 é imposto retido legítimo da Capasemu.

---

## Pendências para próxima sessão

### 1. Mudança operacional pendente (sem código)

- **Capasemu → mudar `payment_method` para `transferencia`** (depósito) na tela de cliente. Hoje paga via boleto e tem retenção de imposto que cria diferença entre `amount` e `paid_amount`. Decisão tomada em 08/05/2026.

### 2. Fase 4 — Cobrança Operacional Completa (5-7 dias, ainda não iniciada)

Documentação detalhada em `docs/FINANCIAL_DEEP_AUDIT.md` seção 5. Entrega:

- **4.1** Régua de cobrança configurável (tabela `billing_collection_steps`)
- **4.2** Dashboard de saúde (tab `/billing/health` + cron `notify-billing-health-daily`)
- **4.3** Email automático com anexos NFSe + boleto via Lovable Custom Emails ⭐ pedido prioritário do Jonatas
- **4.4** Reenvio manual com mensagem personalizada (Dialog `SendInvoiceDialog`)
- **4.5** Tracking de abertura via pixel + link wrapper (Lovable não tem webhooks nativos)

**Recomendação:** começar por 4.3 (visível para clientes da Colmeia, valor imediato).

### 3. Fase 5 — Schema Sane (5-7 dias, depois de Fase 4)

Refator estrutural — quebrar tabela-deus `invoices` em agregado normalizado (`payments`, `payment_attempts`, `notifications_sent`). 3 PRs com dual-write. Detalhes em `FINANCIAL_DEEP_AUDIT.md` seção 5.

### 4. Considerações para incorporar em fases futuras

#### 4.a — Coluna `tax_withheld` em invoices (nice-to-have, considerar na Fase 5)

Caso Capasemu evidenciou: `amount = paid_amount + tax_withheld + descontos` deveria ser invariante auto-conciliável. Hoje a diferença vai para o limbo (mostrada como "diff" sem categorização). Adicionar:

```sql
ALTER TABLE invoices
  ADD COLUMN tax_withheld NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN discount_amount NUMERIC(10,2) DEFAULT 0;
```

Permite construir DRE corretamente:
- Receita bruta = SUM(amount)
- Caixa = SUM(paid_amount)
- Despesa de imposto = SUM(tax_withheld)
- Auto-conciliação: amount - paid_amount - tax_withheld - discount_amount ≈ 0

#### 4.b — View `accounts_receivable` poderia ter cálculo dinâmico de status

A view atual só faz alias do enum (`pending` → `em_aberto`). Tem o campo `is_overdue` calculado dinamicamente mas não usado. Considerar trocar `ar_status` para olhar `is_overdue`:

```sql
CASE
  WHEN i.status::text = 'paid' THEN 'pago'
  WHEN i.status::text = 'cancelled' THEN 'cancelado'
  WHEN i.status::text IN ('renegotiated', 'lost') THEN i.status::text
  WHEN i.due_date < CURRENT_DATE THEN 'atrasado'  -- dinâmico
  ELSE 'em_aberto'
END as ar_status
```

Isso resolve o problema de "pending desatualizado" sem depender do cron rodar para mudar enum. Considerar quando refatorar schema (Fase 5).

#### 4.c — Mobile view do BillingInvoicesTab

Não foi tocada na Fase 3.B (que migrou só desktop para `<InvoiceTableRow>`). Mobile ainda usa markup próprio. Migrar quando alguém precisar.

#### 4.d — Outros componentes não migrados para `useInvoices`

Fase 2 deixou intencionalmente para migração gradual (princípio "REUTILIZAR ao tocar"):
- `useInvoiceActions` (já é hook, não precisa)
- `useBillingCounters` (já é hook, mas tem queries complexas — Lovable Agent corrigiu enum errado nele)
- `FinancialDashboard` (4 queries de count/sum específicas)
- `ContractForm` / `ContractHistorySheet` / `InvoiceForm` / `NfseAvulsaDialog` (mutations)

Migrar **só** quando alguém for tocar o arquivo por outro motivo. Não forçar.

---

## Lições registradas (recorrentes nesta sessão)

1. **Auditar componente-alvo COMPLETO antes de adicionar.** Em caso de novo somatório/totalizador, verificar primeiro se já existe um (violado na Fase 3.C.1, descoberto pelo usuário em produção).
2. **Quando view/RPC já existe no banco encapsulando regra, USAR a view** em vez de reproduzir em queries diretas. A view é fonte de verdade.
3. **Validar com SQL no banco real** os valores antes de assumir que a fonte está correta. Diferença `amount` vs `paid_amount` é semântica crítica (faturado vs recebido).
4. **PostgreSQL retorna `numeric` como string em JSON.** Sempre `Number(r.amount || 0)` antes de somar — `0 + "100"` = `"0100"`.
5. **queryKey de React Query precisa incluir TODAS as variáveis** que afetam o resultado, senão o cache não invalida ao mudar filtros.

---

## Como retomar

Próxima sessão deve começar com:

```bash
git checkout main && git pull origin main
npx tsc --noEmit  # esperado: 0 erros
npx vitest run    # esperado: 119/119
```

E olhar este arquivo + `docs/FINANCIAL_DEEP_AUDIT.md` (seção 5 — Fase 4) para alinhar próximo passo.

Pergunta-chave para abrir Fase 4: **"Começar por qual sub-fase: 4.1, 4.2, 4.3, 4.4 ou 4.5?"** — recomendação minha: **4.3** (email com anexos via Lovable Custom Emails).
