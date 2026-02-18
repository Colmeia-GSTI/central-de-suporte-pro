
# Tela de Contas a Receber

## Resumo

Criar uma nova aba "A Receber" no modulo de Faturamento que consulta diretamente a view `accounts_receivable` do banco. A tela oferece uma visao consolidada de todas as faturas com filtros por status de negocios (em_aberto, atrasado, pago, renegociado, perdido) e por cliente, alem de resumo financeiro e exportacao.

---

## O que ja existe

- View `accounts_receivable` no banco com campos: id, invoice_number, client_id, client_name, contract_id, amount, due_date, paid_date, paid_amount, ar_status, days_overdue, is_overdue
- Tipos TypeScript gerados automaticamente na secao Views do types.ts
- Padroes de tabs, tabelas, filtros e paginacao ja consolidados no modulo de Billing
- Componente `ExportButton` reutilizavel para exportacao CSV/Excel/JSON
- Utilitario `formatCurrency` para formatacao BRL

## O que sera criado

### 1. Componente `AccountsReceivableTab`

Novo arquivo `src/components/billing/AccountsReceivableTab.tsx`:

- **Query**: Consulta a view `accounts_receivable` via Supabase SDK, ordenada por `due_date` descendente, limite 500
- **Filtro por status**: Select com opcoes mapeadas para os valores da view (em_aberto, atrasado, pago, renegociado, perdido, todos)
- **Filtro por cliente**: Select populado dinamicamente a partir dos clientes distintos retornados na query
- **Busca por texto**: Input para filtrar por nome do cliente ou numero da fatura
- **Resumo financeiro**: Chips compactos mostrando total em aberto, total atrasado, total pago (mesmo padrao da BillingInvoicesTab)
- **Tabela desktop**: Colunas -- Nº Fatura, Cliente, Valor, Vencimento, Dias Atraso, Status, Dt. Pagamento
- **Cards mobile**: Layout compacto para telas pequenas
- **Paginacao**: Frontend, 15 itens por pagina (padrao existente)
- **Exportacao**: Botao ExportButton com colunas mapeadas
- **Badge de status**: Cores diferenciadas por ar_status (em_aberto=amarelo, atrasado=vermelho, pago=verde, renegociado=azul, perdido=cinza)

### 2. Integracao no BillingPage

- Adicionar entrada `{ id: "receivable", label: "A Receber", icon: DollarSign }` ao array BILLING_TABS (posicao apos "invoices")
- Adicionar TabsContent correspondente renderizando `AccountsReceivableTab`
- Permissao: visivel para quem pode ver financial (mesma regra das faturas, sem restricao extra)
- Atualizar grid de tabs de 10 para 11 colunas no desktop

---

## Secao Tecnica

### Arquivo a criar:
- `src/components/billing/AccountsReceivableTab.tsx`

### Arquivo a editar:
- `src/pages/billing/BillingPage.tsx` -- adicionar tab "receivable" e importar componente

### Query principal:
```typescript
supabase
  .from("accounts_receivable")
  .select("*")
  .order("due_date", { ascending: false })
  .limit(500)
```

A filtragem por ar_status sera feita no frontend (via useMemo) para manter o padrao existente e evitar multiplas queries. Filtragem por cliente tambem no frontend.

### Mapeamento de status para UI:
- `em_aberto` -> "Em Aberto" (amarelo/warning)
- `atrasado` -> "Atrasado" (vermelho/destructive)
- `pago` -> "Pago" (verde/emerald)
- `renegociado` -> "Renegociado" (azul/info)
- `perdido` -> "Perdido" (cinza/muted)

### Colunas de exportacao:
- invoice_number (Nº Fatura)
- client_name (Cliente)
- amount (Valor)
- due_date (Vencimento)
- days_overdue (Dias Atraso)
- ar_status (Status)
- paid_date (Dt. Pagamento)
- paid_amount (Valor Pago)
