
# Melhorias 3-6: Adicionais, Retry, Monitoramento e Conciliacao

Estas quatro melhorias serao implementadas em sequencia, abrangendo frontend, edge functions e banco de dados.

---

## 3. UI para Cadastro e Gestao de Adicionais Pontuais

### Situacao Atual
- O componente `ContractAdditionalChargeDialog` ja existe com formulario de cadastro e listagem
- Porem **nao e usado em nenhum lugar** (nunca importado)
- A edge function `generate-monthly-invoices` ja consome `contract_additional_charges` e marca como `applied`
- Falta: botao na listagem de contratos, validacao de duplicidade, preview de impacto, auditoria (campo `created_by` ja existe)

### Alteracoes

**`src/pages/contracts/ContractsPage.tsx`**
- Adicionar estado `additionalChargeDialog` (similar aos outros dialogs)
- Adicionar botao de acao "Adicionais" (icone `Receipt`) na coluna de acoes de cada contrato
- Importar e renderizar `ContractAdditionalChargeDialog`
- Incluir badge com contagem de adicionais pendentes no botao (query leve por contrato)

**`src/components/contracts/ContractAdditionalChargeDialog.tsx`**
- Adicionar validacao de duplicidade: ao tentar adicionar, verificar se ja existe registro com mesma `reference_month` + `description` para o contrato
- Adicionar preview de impacto: exibir um resumo "Na proxima fatura (competencia X), o valor sera: R$ valor_mensal + R$ total_pendente = R$ total"
- Exibir nome do criador (`created_by`) na tabela consultando `profiles` (join ou query separada)
- Adicionar filtro por competencia (Select com meses disponiveis)
- Melhorar layout responsivo do formulario (stack em mobile)

**Migracao SQL**
- Indice unico parcial em `contract_additional_charges` para evitar duplicidade: `CREATE UNIQUE INDEX ... ON contract_additional_charges (contract_id, reference_month, description) WHERE applied = false`

---

## 4. Padronizar Retries e Backoff para Envios e Integracoes

### Situacao Atual
- Nenhuma biblioteca centralizada de retry
- Cada edge function faz sua propria logica de tentativas (ou nenhuma)
- Sem registro de contagem de tentativas

### Alteracoes

**`supabase/functions/_shared/retry-utils.ts`** (novo arquivo auxiliar -- sera copiado inline pois edge functions nao suportam imports de pasta compartilhada; em vez disso, criar como funcao utilitaria inline em cada function que precise)

Na pratica, criar uma funcao `withRetry` que sera copiada para as functions que precisam:

```text
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts: 3, delays: [60000, 300000, 1200000], label: string }
): Promise<{ result?: T; attempts: number; success: boolean; lastError?: string }>
```

**Edge functions a atualizar:**
- `send-email-smtp/index.ts` -- envolver chamada SMTP com `withRetry` (3 tentativas, delays 1m/5m/20m)
- `send-whatsapp/index.ts` -- envolver chamada Evolution API
- `send-nfse-notification/index.ts` -- envolver envio de email/whatsapp
- `resend-payment-notification/index.ts` -- envolver envios

**Registro de metricas:**
- Apos cada execucao com retry, inserir em `application_logs` com `module: "retry"`, incluindo `attempts`, `success`, `label` e `duration_ms`

**Nota:** Como edge functions Deno nao suportam `import` entre pastas, a funcao `withRetry` sera definida como utility dentro de cada function. Para manter DRY ao maximo, sera um bloco de ~30 linhas copiado nas 4 functions afetadas.

---

## 5. Monitoramento, Alertas e Dashboards de Falhas

### Situacao Atual
- `MessageMetricsDashboard` mostra metricas de mensagens (email/whatsapp/telegram)
- `useBillingCounters` mostra contadores de faturas vencidas, boletos pendentes, NFS-e pendentes
- Nao existe dashboard de latencia de integradores ou alertas automaticos

### Alteracoes

**`src/components/billing/IntegrationHealthDashboard.tsx`** (novo)
- Card "Boletos Pendentes > 1h" -- query `invoices` com `boleto_status = 'pendente'` e `created_at < now() - 1h`
- Card "NFS-e Processando > 2h" -- query `nfse_history` com status `processando` e `created_at < now() - 2h`
- Card "Tempo Medio de Retorno Banco" -- RPC ou query calculando `avg(boleto_updated_at - created_at)` para faturas com boleto_status = 'registrado'
- Card "Taxa de Falha Ultimas 24h" -- query `application_logs` com level = 'error' e module in ('billing', 'nfse', 'banco_inter')
- Grafico de barras: falhas por hora nas ultimas 24h (dados de `application_logs`)

**`src/pages/billing/BillingPage.tsx`**
- Adicionar nova aba "Saude" (icone `Activity`) ao `BILLING_TABS`
- Renderizar `IntegrationHealthDashboard` nesta aba

**Migracao SQL**
- Criar funcao RPC `get_integration_health_stats` que retorna as metricas agregadas em uma unica chamada (boletos pendentes, NFS-e lentas, taxa de falha, tempo medio)

---

## 6. Automacao e Regras de Conciliacao Bancaria

### Situacao Atual
- `BankReconciliationTab` e puramente visual/read-only
- Tabela `bank_reconciliation` tem campos `invoice_id`, `matched_at`, `matched_by` mas nenhuma logica de matching
- Nenhuma funcao de matching automatico existe

### Alteracoes

**Migracao SQL**
- Criar funcao RPC `auto_reconcile_bank_entries` que:
  1. Para cada entrada `bank_reconciliation` com status `pending`
  2. Busca faturas com `amount` igual a `bank_amount` (tolerancia de R$ 0.01)
  3. Cruza por `bank_reference` contendo `invoice_number` ou `boleto_barcode`
  4. Atribui score: valor exato = 50pts, referencia match = 40pts, data proxima (+/-3 dias) = 10pts
  5. Se score >= 90: auto-match (status = 'matched', invoice_id vinculado)
  6. Se score 50-89: status = 'suggested' (novo status)
  7. Retorna contagem de matched e suggested

**Migracao SQL adicional**
- Adicionar status `suggested` ao campo `status` de `bank_reconciliation` (CHECK constraint ou validacao)
- Adicionar coluna `match_score` (integer) e `match_candidates` (jsonb) para armazenar sugestoes

**`src/components/billing/BankReconciliationTab.tsx`**
- Adicionar botao "Conciliar Automaticamente" que chama a RPC
- Adicionar status `suggested` ao `statusConfig` (cor azul, icone `Sparkles`)
- Para entradas com status `suggested`: exibir botoes "Aprovar" e "Rejeitar" inline
- "Aprovar" atualiza para `matched` e vincula `invoice_id`
- "Rejeitar" atualiza para `unmatched`
- Exibir `match_score` como badge no tooltip
- Adicionar acoes manuais: selecionar fatura para vincular manualmente (combobox com faturas pendentes/pagas)

**`src/components/billing/ReconciliationMatchDialog.tsx`** (novo)
- Dialog para match manual: busca faturas por numero, valor ou cliente
- Permite selecionar fatura e confirmar vinculacao
- Atualiza `bank_reconciliation` com `invoice_id`, `matched_by`, `matched_at`, `status = 'matched'`

---

## Resumo de Arquivos

| Arquivo | Acao |
|---------|------|
| `src/pages/contracts/ContractsPage.tsx` | Adicionar botao e dialog de adicionais |
| `src/components/contracts/ContractAdditionalChargeDialog.tsx` | Validacao duplicidade, preview impacto, filtro, auditoria |
| `supabase/functions/send-email-smtp/index.ts` | Adicionar `withRetry` |
| `supabase/functions/send-whatsapp/index.ts` | Adicionar `withRetry` |
| `supabase/functions/send-nfse-notification/index.ts` | Adicionar `withRetry` |
| `supabase/functions/resend-payment-notification/index.ts` | Adicionar `withRetry` |
| `src/components/billing/IntegrationHealthDashboard.tsx` | Novo dashboard de saude |
| `src/pages/billing/BillingPage.tsx` | Adicionar aba "Saude" |
| `src/components/billing/BankReconciliationTab.tsx` | Matching automatico, sugestoes, acoes |
| `src/components/billing/ReconciliationMatchDialog.tsx` | Novo dialog de match manual |
| Migracoes SQL | Indice unico adicionais, RPC health stats, RPC auto-reconcile, coluna match_score |

## Ordem de Implementacao

1. Migracoes SQL (indice unico, novas colunas, RPCs)
2. Adicionais pontuais (item 3) -- frontend puro
3. Retry centralizado (item 4) -- edge functions
4. Dashboard de saude (item 5) -- frontend + RPC
5. Conciliacao automatica (item 6) -- RPC + frontend
