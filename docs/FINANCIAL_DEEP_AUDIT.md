# 🔬 FINANCIAL_DEEP_AUDIT — Auditoria Profunda do Módulo Financeiro

**Data:** 2026-05-07
**Escopo:** Faturamento, Cobrança, Contratos, NFS-e, Cadastro de Clientes e fluxos relacionados
**Base:** Análise do código real em `main` pós-merges das sessões anteriores
**Objetivo:** Identificar tudo que está bagunçado, obsoleto, duplicado, sem regra clara — e elaborar plano de simplificação que maximize REUTILIZAÇÃO

> **Documento substitui:** A seção 4.6 do `COLMEIA_ROADMAP_MESTRE` (arquivado) e expande o `BILLING_AUDIT.md` com análise comparativa de mercado.

---

## 0. TL;DR — diagnóstico em 1 página

**Estado atual:** o módulo financeiro funciona, mas está **bagunçado por acumulação**. Cada feature foi adicionada como tab/coluna nova sem revisar o conjunto. Resultado:

| Sintoma | Evidência |
|---|---|
| **Tabela `invoices` virou tabela-deus** | 48 colunas misturando billing, NFSe, pagamento, parcelamento, ticket, serviço |
| **BillingPage tem 11 abas** | Faturas, A Receber, Boletos, NFS-e, Erros, Conciliação, Fiscal, Saúde, Contas, Serviços, Códigos Tributários |
| **"Faturas" e "Boletos" são quase a mesma coisa** | `BillingInvoicesTab` (1.134 LOC) + `BillingBoletosTab` (864 LOC) duplicam 70% da lógica |
| **3 tabs grandes ≈ 3.000 LOC** sem componentes compartilhados | `BillingNfseTab` (931) + os dois acima |
| **Status mapeado em 4 lugares diferentes** | `statusLabels`/`statusColors` em `BillingInvoicesTab`, `ContractsPage`, `ClientAssetsList`, `StatusBadge` |
| **Querys diretas espalhadas em 9 componentes** | `from("invoices")` sem hook centralizado |
| **`format(new Date(...))` 19x só em billing** | Sem `formatDate()` helper (existe `formatCurrency`) |
| **Schema sem separação de responsabilidades** | invoices guarda informação que deveria estar em `payments`, `payment_attempts`, `notifications_sent` |
| **38 arquivos em `components/clients/`** | Provável fragmentação excessiva |
| **Bug latente**: cobrança avulsa criava invoice fantasma sem boleto | Resolvido no PR-FIX-2 |
| **Cliente sem contrato vira "órfão" sem aviso** | Resolvido no PR-FIX-2 |
| **Mesma fatura mostra ações diferentes em telas diferentes** | Parcialmente resolvido no PR-D + PR-E (FSM); migração ainda gradual |

**Caminho proposto:** 5 fases incrementais, cada uma com critério de pronto e métricas, sem refator big-bang. **Princípio chave:** REUTILIZAR antes de criar — extrair UM componente novo só quando ele substitui ≥2 cópias do antigo.

---

## 1. Inventário do código atual

### 1.1 Frontend (`src/components/billing/` + `contracts/` + `clients/` + `financial/`)

**Total: 28.510 LOC distribuídas em ~80 componentes.**

Top 15 componentes por tamanho:

| Linhas | Arquivo | Responsabilidade |
|--:|---|---|
| 1.232 | `contracts/ContractForm.tsx` | Form de criar/editar contrato (30 campos) |
| 1.173 | `billing/nfse/NfseDetailsSheet.tsx` | Detalhes da NFSe |
| 1.134 | `billing/BillingInvoicesTab.tsx` | Tab "Faturas" |
| 931 | `billing/BillingNfseTab.tsx` | Tab "NFS-e" |
| 908 | `clients/ClientAssetsList.tsx` | Lista de assets (CMDB) |
| 864 | `billing/BillingBoletosTab.tsx` | Tab "Boletos" |
| 835 | `billing/BillingErrorsPanel.tsx` | Tab "Erros" |
| 775 | `clients/ClientForm.tsx` | Form de cliente (30 campos) |
| 760 | `clients/ClientUsersList.tsx` | Lista de usuários do cliente |
| 719 | `pages/contracts/ContractsPage.tsx` | Listagem de contratos |
| 657 | `pages/billing/DelinquencyReportPage.tsx` | Relatório de inadimplência |
| 589 | `clients/ClientBranchesList.tsx` | Filiais (CMDB-prep) |
| 578 | `financial/EmitNfseDialog.tsx` | Dialog de emitir NFSe (genérico, herdado) |
| 531 | `contracts/ContractHistorySheet.tsx` | Histórico do contrato |
| 477 | `billing/nfse/NfseAvulsaDialog.tsx` | Dialog de NFSe avulsa |

### 1.2 Edge Functions

**Total: 18 edges relacionadas a financeiro = ~10.000 LOC.**

| Linhas | Edge | Status |
|--:|---|---|
| 2.150 | `asaas-nfse` | ✅ Multi-action (16 actions: emit, create_payment, get_status, etc) |
| 1.221 | `generate-monthly-invoices` | ✅ Cron mensal, ajustado pelo PR-C |
| 880 | `banco-inter` | 🟡 **Decommission em ~60-90d** (PR-DECOM) |
| 659 | `poll-services` | ✅ Polling de status |
| 605 | `webhook-asaas-nfse` | ✅ Webhook unificado |
| 439 | `batch-process-invoices` | 🟡 Pouco usado (revisar uso real) |
| 425 | `resend-payment-notification` | ✅ Reuso de envio |
| 392 | `webhook-banco-inter` | 🟡 Decommission junto com Inter |
| 386 | `notify-due-invoices` | ✅ Cron de notificação |
| 372 | `generate-invoice-payments` | 🟡 Sobrepõe com `asaas-nfse:create_payment`? Verificar |
| 348 | `send-nfse-notification` | ✅ |
| 221 | `generate-second-copy` | ✅ |
| 213 | `renegotiate-invoice` | 🟡 Fluxo não documentado |
| 212 | `manual-payment` | ✅ |
| 123 | `calculate-invoice-penalties` | ✅ |

### 1.3 Schema do banco

**Tabela `invoices`: 48 colunas (anti-pattern "tabela-deus")**

```
amount, asaas_invoice_url, asaas_payment_id, auto_nfse_emitted,
auto_payment_generated, billing_provider, boleto_barcode,
boleto_error_msg, boleto_sent_at, boleto_status, boleto_url,
client_id, contract_id, created_at, description, due_date,
email_error_msg, email_sent_at, email_status, fine_amount, id,
installment_number, interest_amount, invoice_number,
manual_payment, nfse_error_msg, nfse_generated_at, nfse_status,
notes, paid_amount, paid_date, parent_invoice_id, payment_method,
payment_notes, payment_proof_url, pix_code, processed_at,
processing_attempts, processing_metadata, reference_month,
service_id, status, ticket_id, total_installments,
total_with_penalties, updated_at
```

**Análise por categoria de coluna:**

| Categoria | Colunas | Deveria estar em |
|---|---|---|
| Identificação | `id`, `invoice_number`, `client_id`, `contract_id`, `reference_month` | ✅ `invoices` |
| Valor | `amount`, `description`, `notes`, `due_date` | ✅ `invoices` |
| Status principal | `status`, `created_at`, `updated_at` | ✅ `invoices` |
| **Boleto** (subprocess) | `boleto_url`, `boleto_barcode`, `boleto_status`, `boleto_error_msg`, `boleto_sent_at`, `pix_code`, `payment_method` | 🔴 `payment_attempts` (1:N) |
| **NFSe** (subprocess) | `nfse_status`, `nfse_error_msg`, `nfse_generated_at`, `auto_nfse_emitted` | 🔴 `nfse_history` (já existe!) — campos redundantes |
| **Email** (subprocess) | `email_status`, `email_error_msg`, `email_sent_at` | 🔴 `notifications_sent` (1:N) |
| **Pagamento recebido** | `paid_date`, `paid_amount`, `manual_payment`, `payment_notes`, `payment_proof_url` | 🔴 `payments` (1:N — tabela ainda não existe) |
| **Provider** | `billing_provider`, `asaas_payment_id`, `asaas_invoice_url` | 🔴 `payment_attempts.provider_data` (jsonb) |
| **Parcelamento** | `installment_number`, `total_installments`, `parent_invoice_id` | 🟡 manter mas usar pouco (verificar) |
| **Encargos** | `fine_amount`, `interest_amount`, `total_with_penalties` | 🟡 calculados (poderiam ser computed columns) |
| **Processamento** | `processing_attempts`, `processed_at`, `processing_metadata`, `auto_payment_generated` | 🔴 `processing_history` (1:N) |
| **Outros (desuso?)** | `service_id`, `ticket_id` | 🟡 raramente usados — verificar |

**Conclusão schema:** ~30 das 48 colunas são "subprocess data" que deveriam estar em tabelas filhas. Tabela invoices ideal = ~16 colunas.

**Tabelas existentes:** `clients` (30 cols), `contracts` (36 cols), `invoice_items`, `invoice_documents`, `nfse_history`, `nfse_event_logs`, `nfse_cancellation_log`, `nfse_service_codes`, `client_branches`, `client_contacts`, `client_external_mappings`, `client_history`, `client_notification_rules`, `contract_services`, `contract_history`, `contract_additional_charges`, `contract_adjustments`, `contract_service_history`.

**Funções DB (RPCs):** 13 funções relacionadas a invoices, incluindo 4 validação (`validate_invoice_has_client`, `validate_invoice_items_sum`, `validate_invoice_number_uniqueness`, `validate_invoice_status_transition`) — **boa fundação**, falta usar consistentemente.

---

## 2. Problemas concretos detectados

### 2.1 Sobreposição funcional entre Tabs

**Problema:** `BillingInvoicesTab` e `BillingBoletosTab` listam **a mesma coisa** (invoices) com filtros levemente diferentes.

| `BillingInvoicesTab` (1.134 LOC) | `BillingBoletosTab` (864 LOC) |
|---|---|
| Lista TODAS as invoices | Lista invoices que TÊM boleto gerado |
| Coluna: cliente, valor, status, ações | Coluna: cliente, valor, **boleto_status**, ações |
| Ações: emitir NFSe, baixa manual, editar | Ações: regenerar boleto, polling, baixa |

Em sistemas modernos (Asaas, Vindi, Iugu) **não existe essa separação**. Existe **1 listagem de "Cobranças"** com filtros: status, método, vencimento, etc.

**Impacto:**
- ~870 LOC duplicadas
- Confusão UX: "abre em qual aba?"
- Bugs: ação "regenerar boleto" só aparece em Boletos, "emitir NFSe" só em Faturas
- Testes ausentes em ambos

### 2.2 Tab "A Receber" também sobrepõe

Aba `AccountsReceivableTab.tsx` (313 LOC) lista "invoices não pagas". É um **filtro** de Faturas, não uma entidade nova. Em ferramentas modernas é um **chip/preset de filtro**, não uma tab.

### 2.3 Status mapeado em 4 lugares

```
src/components/billing/BillingInvoicesTab.tsx     → statusLabels + statusColors locais
src/components/clients/ClientAssetsList.tsx       → próprio mapeamento
src/components/clients/documentation/shared/StatusBadge.tsx → outro mapeamento
src/pages/contracts/ContractsPage.tsx             → outro mapeamento
```

Mesmo enum (`invoice_status` = paid, pending, overdue, cancelled, lost, renegotiated) tem cores e labels diferentes em telas diferentes. Bug de inconsistência visual.

### 2.4 Querys diretas espalhadas (sem hook)

`from("invoices")` aparece em **9 componentes diferentes**, cada um:
- Define seu próprio `useQuery` key
- Define seus próprios filters
- Define sua própria invalidação após mutations
- Não compartilha cache entre si

**Resultado:** após uma mutation, **algumas telas atualizam, outras não** (você já viu isso na race condition do `ManualPaymentDialog` antes do PR-FIX).

### 2.5 Date formatting inconsistente

Cada componente faz `format(new Date(value), "dd/MM/yyyy")` ou `"dd/MM/yy"` ou `"dd MMM"` — sem padrão. **`formatCurrency` existe** (`src/lib/currency.ts`); falta `formatDate`/`formatDateTime`.

### 2.6 Tabelas-deus

- `invoices` (48 colunas) — análise detalhada na seção 1.3
- `clients` (30 colunas) — provável: dados pessoais + endereço + comerciais + integrações + flags
- `contracts` (36 colunas) — provável: idem

Cada coluna nova adicionada quando precisou. Falta separação por agregado.

### 2.7 Decisões de UX sem regra clara

- **"Cobrança avulsa"** → criava invoice fantasma SEM boleto (resolvido em PR-FIX-2)
- **"Cliente sem contrato"** → ficava órfão, sem aviso (resolvido em PR-FIX-2)
- **"Contrato com end_date passado"** → cobrança continuava (resolvido em PR-PROTECTION)
- **"Race condition webhook×UI"** → erro genérico em vez de mensagem real (resolvido em PR-FIX)

Padrão dos bugs: **falta de guard explícito** + **mensagem de erro genérica**. A FSM (PR-E) e o helper `extractEdgeFunctionError` (PR-FIX) começaram a resolver isso, mas migração é gradual.

### 2.8 Edges com sobreposição

Edges que parecem fazer coisa similar:

| Edge | O que faz | Sobrepõe com |
|---|---|---|
| `asaas-nfse:create_payment` | Cria boleto/PIX no Asaas | `generate-invoice-payments` (372 LOC) |
| `generate-invoice-payments` | ??? — provável legado | precisa investigar |
| `batch-process-invoices` | Processa N invoices em lote | `generate-monthly-invoices` (cron já faz isso) |

Não há documentação clara de quando usar cada uma.

### 2.9 Componentes mortos detectados anteriormente (já limpados)

Já tratado nos PR-CLEAN/PR-CLEAN-2. Mas a limpeza foi superficial — provável que existam mais 1.500-3.000 LOC mortas em sub-componentes específicos (precisa varredura semântica, não só "sem-import").

### 2.10 Validações inconsistentes

Frontend valida X, backend valida Y, banco valida Z. Por exemplo:

- **CNPJ/CPF**: validação no `ClientForm`, na edge `asaas-nfse` ao criar customer, e CHECK no banco? (verificar)
- **Email**: idem
- **Data de vencimento futura**: nem todo lugar valida
- **Valor > 0**: alguns lugares aceitam zero, outros não

---

## 3. Comparação com o mercado

### 3.1 Asaas (provider que já usamos)

**Modelo:**
- `Customers` (1)
- `Subscriptions` (1:N) — recorrência nativa
- `Payments` (1:N) — cobranças individuais geradas pela subscription OU avulsas
- `Invoices` (1:1 com Payment) — só fiscal (NFSe/NFCe)
- `Webhooks` granulares por evento

**Diferença chave:** Asaas separa **cobrança** (Payment) de **fiscal** (Invoice). Nosso sistema misturou tudo em `invoices`.

### 3.2 Vindi / Iugu / Pagar.me

Padrão semelhante ao Asaas:
- `customers` → `subscriptions` → `charges` (com transactions de tentativa) → `nfse` separada
- Régua de cobrança configurável por etapa (D-3, D, D+3, D+10...)
- Métricas como MRR, ARR, churn, LTV são computadas a partir do schema separado

### 3.3 Bling / ContaAzul / Conta Simples (ERPs BR)

- Foco em emissão de **documento fiscal** (NFSe/NFCe) primeiro, cobrança depois
- "Lançamentos financeiros" é abstração genérica (receita, despesa, transferência)
- "Faturas" como conceito BR != "invoices" do gringo

### 3.4 O que copiar (e o que NÃO copiar)

✅ **Copiar:**
- Separação `invoices` ↔ `payments` ↔ `nfse_history` ↔ `notifications` (já temos nfse_history!)
- Régua de cobrança como tabela configurável
- Relatórios (MRR, churn, aging) como views/RPCs (não cálculos client-side)
- Status enum reduzido (4-5 valores no máximo, depois subprocess statuses)
- Hook único `useInvoices()` com filtros parametrizados (1 fonte da verdade)

❌ **Não copiar:**
- Múltiplas APIs por funcionalidade (a gente já está OK com Asaas único)
- Subscription nativa do Asaas para AGORA (já decidido na sessão anterior — Estratégia B do PR-C)
- Funcionalidades exóticas: split de pagamento, marketplace, cartão tokenizado (não é o caso da Colmeia)

---

## 4. Estratégias de reutilização (princípio: extrair quando substitui ≥2 cópias)

### 4.1 Hooks centralizados (camada de dados)

| Hook proposto | Substitui |
|---|---|
| **`useInvoices(filters)`** | 9 cópias atuais de `from("invoices")` |
| **`useInvoice(id)`** | Vários `useQuery` específicos |
| **`useContracts(filters)`** | Cópias atuais |
| **`useClients(filters)` (já parcial)** | Expandir o existente |
| **`useNfse(invoiceId)`** | Lógica espalhada de buscar NFSe |
| **`useBillingMutations()`** | Centraliza markAsPaid, cancel, regenerate (alguns já estão em `useInvoiceActions`) |

### 4.2 Componentes de UI reutilizáveis

| Componente | Onde reutilizar |
|---|---|
| **`<InvoiceStatusBadge>`** + `<NfseStatusBadge>` + `<BoletoStatusBadge>` | Substituir 4 mapeamentos atuais |
| **`<InvoiceListTable>`** parametrizada | Reusada por `BillingInvoicesTab`, `BillingBoletosTab`, `ClientPortalFinancialTab`, `DelinquencyReportPage` |
| **`<InvoiceFiltersBar>`** | 1 barra de filtros usada em N tabs |
| **`<InvoiceActionsMenu>`** (já existe parcial: `InvoiceActionsPopover`) | Migrar todos os usos para 1 só |
| **`<ClientSearchCombobox>`** (já criado em PR-UX-Combobox) | Espalhar para outros dialogs que selecionem cliente |
| **`<ContractCard>`** | Reusar em ClientDetailPage + ContractsPage |
| **`<DerivedStateBadge>`** (usar `getDerivedStateDisplay` da FSM) | Status visual unificado |

### 4.3 Helpers/utils

| Helper proposto | Onde |
|---|---|
| **`formatDate(value, variant)`** | `lib/date.ts` (variants: 'short', 'long', 'with-time') |
| **`formatCurrency(value)`** | já existe — auditar uso |
| **`computeInvoiceDerivedState`** + permissões | já existe (FSM, PR-E) — migrar telas |
| **`extractEdgeFunctionError`** | já existe (PR-FIX) — migrar handlers |
| **`monthsBetweenReferences`** | extrair lógica de PR-C que está inline na edge |

### 4.4 Schema (médio prazo, romper tabela-deus)

**Migrar `invoices` para schema agregado:**

```
invoices (16 colunas):
  id, invoice_number, client_id, contract_id, amount, due_date,
  reference_month, status, description, notes, fine_amount,
  interest_amount, total_with_penalties, created_at, updated_at, ...

payments (NOVA — 1:N com invoice):
  id, invoice_id, amount, paid_date, method, manual,
  notes, proof_url, asaas_payment_id, created_at

payment_attempts (NOVA — 1:N — tentativas de cobrar):
  id, invoice_id, type ('boleto'|'pix'), provider, status,
  url, barcode, code, error_msg, sent_at, created_at

notifications_sent (NOVA — 1:N — emails/WhatsApps enviados):
  id, invoice_id, channel, status, error_msg, sent_at

(nfse_history já existe — só remover campos redundantes de invoices)
```

**Benefício:** queries explicam-se sozinhas. Histórico de tentativas auditável. Funcionalidades como "régua de cobrança" e "métricas" ficam triviais.

**Custo:** migração com snapshot de backup + DUAL-WRITE durante transição (~2-3 PRs separados).

---

## 5. Plano em 5 fases

> Cada fase é independente, com critério de pronto, métricas, e pode ser deployada isoladamente. **Princípio constante:** REUTILIZAR antes de criar; LIMPAR ao tocar; OTIMIZAR ao migrar.

### **Fase 1 — Helpers + Status Unificado (1-2 dias)** ⚡ ganho rápido

**Objetivo:** unificar exibição visual de status em todas as telas. Resolve dor #2.3.

**Entregáveis:**
- `src/lib/date.ts` com `formatDate(value, 'short' | 'long' | 'with-time')` + `formatRelative()`
- `src/components/billing/InvoiceStatusBadge.tsx` (novo) reutilizando `getDerivedStateDisplay` da FSM
- `src/components/billing/BoletoStatusBadge.tsx` + `NfseStatusBadge.tsx`
- Substituir 4 mapeamentos espalhados pelos novos componentes
- Migrar 19 ocorrências de `format(new Date(...))` em billing/ para `formatDate()`

**Critério de pronto:**
- Mesma fatura mostra mesmo badge (cor + label) em qualquer tela
- TS 0 erros, vitest 100/100
- Nenhum cálculo `statusColors[status]` inline em src/components/billing/

**Risco:** ZERO (puramente visual)

### **Fase 2 — Hooks centralizados (2-3 dias)**

**Objetivo:** ÚNICA fonte de verdade para queries de invoices/contracts/clients. Resolve dor #2.4 (race conditions, cache desincronizado).

**Entregáveis:**
- `src/hooks/useInvoices.ts` com filtros parametrizados (status, dateRange, clientId, etc)
- `src/hooks/useInvoice.ts` (single)
- `src/hooks/useContract.ts` + `useContracts.ts` (expandir)
- `src/hooks/useNfse.ts`
- Migrar 9 ocorrências de `from("invoices")` para usar os hooks
- Invalidação automática centralizada

**Critério de pronto:**
- Após qualquer mutation (mark-as-paid, cancel, etc), TODAS as telas que mostram aquela invoice atualizam
- Cache compartilhado (mesma invoice em duas telas = 1 fetch)
- TS 0 erros, vitest 100/100

**Risco:** BAIXO (refator de leitura, sem mudar comportamento)

### **Fase 3 — Consolidação de Tabs (3-4 dias)** 🎯 maior ganho de UX

**Objetivo:** colapsar tabs sobrepostos em 1 tab parametrizado. Resolve dor #2.1, #2.2.

**Entregáveis:**
- `<InvoiceListTable>` componente único parametrizado
- `<InvoiceFiltersBar>` componente único
- Tab **"Cobranças"** (substitui Faturas + Boletos + A Receber):
  - Filtros: status (chips), método de pagamento (chip), vencimento (range), cliente (combobox)
  - Cada linha mostra TODAS as ações disponíveis (via FSM canXxx)
- Tab **"NFS-e"** simplificada (foco em emissão e histórico)
- Tab **"Erros"** vira **filtro chip** ("apenas com erro")
- Removidas 3 tabs (Boletos, A Receber, Erros) — viram filtros de Cobranças

**Métricas:**
- BillingPage: 11 tabs → ~7 tabs
- ~3.000 LOC consolidadas (Faturas+Boletos+Erros) → 1 componente + N filtros
- Saldo estimado: **-2.000 LOC líquidas**

**Critério de pronto:**
- Operador encontra qualquer fatura em < 5s
- Mesma ação aparece com mesmo nome em qualquer estado
- TS 0 erros, vitest 100/100, nenhum teste E2E quebrado
- Mantém retrocompatibilidade de URL (deep link `?tab=boletos` → `?tab=cobrancas&filter=boleto`)

**Risco:** MÉDIO (mudança de UX visível)

### **Fase 4 — Cobrança Operacional Completa (5-7 dias)** 💰 reduz inadimplência + comprova entrega

**Objetivo:** régua de cobrança + dashboard de saúde + **email com anexos + tracking de abertura + reenvio manual com mensagem personalizada**. Resolve gaps G8, G11, G4, G13 do BILLING_AUDIT + novos requisitos operacionais.

#### 4.1 — Régua de Cobrança Configurável

- Nova tabela `billing_collection_steps` (PR-F do BILLING_AUDIT) com colunas: `id`, `days_relative_due` (-5, -2, 0, +1, +5...), `channel` (email/whatsapp), `template_key`, `enabled`, `order`
- Cron `notify-due-invoices` itera essa tabela em vez de hardcoded
- Admin altera régua na UI sem mexer em código

#### 4.2 — Dashboard de Saúde

- Tab **"Saúde"** (já tem placeholder em `BillingPage`) com:
  - Taxa de sucesso 7/30 dias (boleto, NFSe, email)
  - Fila de retry com botão "executar agora"
  - Latência da última geração do cron
  - Inadimplência consolidada (reusa view existente)
- Cron `notify-billing-health-daily` envia email para admin se taxa de erro > X%

#### 4.3 — Email Automático com Anexos (NFSe + Boleto) ⭐ NOVO

**Estado atual:** anexos JÁ existem em `resend-payment-notification` (linhas 250-256, anexa boleto + NFSe PDFs em base64). Mas o cron `notify-due-invoices` envia **só link**, não anexa.

**Entregáveis:**
- **Decisão de provider de email**: usar **Lovable Custom Emails (nativo do Lovable Cloud)** em vez de Resend direto. Razão: provedor já embutido na plataforma (Lovable cuida de DNS/SPF/DKIM/DMARC), 50.000 emails/mês incluídos no plano pago, rate limit 100/hora suficiente.
- **Migrar `send-email-resend`** para `send-email-lovable` (ou refatorar a edge atual para chamar API do Lovable Cloud em vez de Resend). Mantém mesma interface (subject, html, attachments) — UPSTREAM mudou, contrato com restante do código preservado.
- **Modificar cron `notify-due-invoices`** para usar mesmo padrão de attachments do `resend-payment-notification`:
  - Buscar `nfse_history.pdf_url` da invoice
  - Buscar boleto PDF (Asaas API: `bankSlipUrl` do payment)
  - Anexar ambos no email enviado via `send-email-lovable`
- Quando NFSe não foi emitida ainda: enviar só boleto + log de aviso
- Quando boleto não foi gerado ainda: pular envio + log warn (não cobrar sem boleto)
- Template HTML do email referenciando os anexos + pixel tracking embed

**Critério:** todos os emails de cobrança automática (régua) saem com NFSe + boleto anexos via Lovable Custom Emails. Cliente recebe tudo no mesmo email.

#### 4.4 — Reenvio Manual com Mensagem Personalizada ⭐ NOVO

**Entregáveis:**
- Botão "Enviar cobrança" na linha de cada invoice (substitui múltiplos botões "reenviar email", "regerar boleto", etc.)
- Dialog `SendInvoiceDialog`:
  - Preview dos anexos que serão enviados (NFSe + boleto, com ícone)
  - Campo de **mensagem personalizada** (opcional, default vem do template)
  - Toggle "Atualizar boleto antes de enviar?" (regera boleto via Asaas se vencido)
  - Botão "Enviar agora" → chama `send-email-lovable` com `{ custom_message: "...", regenerate_boleto: true/false }`
- Reuso de `<ClientSearchCombobox>` se houver caso de envio para outro cliente (ex: cobrança avulsa)
- FSM `canResendNotification` já valida se pode enviar (PR-E)

**Critério:** operador clica 1 botão, escreve mensagem personalizada se quiser, e o cliente recebe email com NFSe + boleto + texto custom.

#### 4.5 — Confirmação de Recebimento (Tracking custom) ⭐ NOVO

**Importante:** Lovable Custom Emails **não expõe webhooks de eventos** como Resend faz. Para detectar abertura precisamos de **tracking custom via pixel + link wrapper** (técnica padrão de email marketing pré-webhooks).

**Entregáveis técnicos:**

- **Nova tabela `email_events`** (sem dependência de webhook externo):
  ```sql
  CREATE TABLE public.email_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    tracking_token TEXT NOT NULL UNIQUE,  -- token único por envio (UUID)
    event_type TEXT NOT NULL,             -- sent, opened, clicked, bounced (manual)
    recipient_email TEXT NOT NULL,
    user_agent TEXT,                      -- captado no momento da abertura
    ip_address TEXT,                      -- captado no momento da abertura (LGPD: anonimizar)
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw_payload JSONB,                    -- contexto extra
    created_at TIMESTAMPTZ DEFAULT now()
  );
  CREATE INDEX ON email_events (invoice_id, event_type);
  CREATE INDEX ON email_events (tracking_token);
  ```

- **Edge function `track-email-open`** (nova, ~80 LOC) — pixel tracking:
  - Endpoint: `GET /functions/v1/track-email-open?t=<tracking_token>`
  - Retorna 1x1 PNG transparente (24 bytes hardcoded)
  - Antes do retorno: registra evento `opened` em `email_events` (apenas se ainda não houver registro com mesmo token)
  - Captura User-Agent e IP (anonimizado: hash dos últimos octetos)
  - Header `Cache-Control: no-store` para evitar pixel cacheado em servidores do cliente

- **Edge function `track-email-click`** (nova, ~60 LOC) — link wrapper:
  - Endpoint: `GET /functions/v1/track-email-click?t=<tracking_token>&url=<encoded_url>`
  - Registra evento `clicked` em `email_events`
  - Faz redirect 302 para `url` original

- **Modificar `send-email-lovable`** para:
  - Gerar `tracking_token` UUID por envio
  - Inserir registro `event_type='sent'` em `email_events` ao despachar
  - Embed pixel no HTML do email: `<img src="https://<supabase>/functions/v1/track-email-open?t=<token>" width="1" height="1" style="display:none" />`
  - Wrap todos os links do email: `https://<supabase>/functions/v1/track-email-click?t=<token>&url=<encoded>`

- **UI: Status de entrega visual** em qualquer linha de invoice:
  - View `invoice_email_latest_event` (joinada com `email_events`)
  - Badge `<EmailDeliveryBadge>`:
    - 📧 **Enviado** (event=sent, sem outros)
    - 👁️ **Aberto pelo cliente** (qualquer event=opened) ← **principal foco do pedido**
    - 🖱️ **Clicou no boleto/anexo** (event=clicked, mais forte que opened)
    - ⚠️ **Devolvido** (event=bounced) — **inferido por fallback**: se tentar enviar de novo e Lovable retornar erro de email inválido, marcamos manualmente como bounced
  - Tooltip: timestamp do último event + email destinatário
  - Modal "Histórico de comunicação" → timeline completa de envios e eventos

- **Reuso na FSM**: novo helper `getEmailDeliveryState(invoice)` que olha em `email_events` e retorna o estado mais "alto" (clicked > opened > sent > none). Não substitui `email_processing_status` (que é envio); é complementar.

**Limitações conhecidas (vs Resend webhooks):**
- ❌ **Não detecta "delivered" sem abertura** — pixel só dispara se cliente carregar imagens
- ❌ **Clientes corporativos com bloqueio de imagens externas** (Outlook empresarial) não disparam o pixel
- ✅ **Detecta clique mesmo sem imagem** (link wrapper sempre dispara)
- ✅ **Cliente pessoal (Gmail, iPhone Mail, Outlook web) — taxa de detecção de abertura > 80%**

**Critério:** operador vê na lista de cobranças se o cliente abriu o email **ou** clicou no link/boleto. Em caso de tentativa de envio que falhe (email inválido), marcamos `bounced` e geramos alerta proativo.

**Métricas-alvo Fase 4:**
- 100% dos emails automáticos com NFSe + boleto anexos via Lovable Custom Emails
- Taxa de abertura visível por cliente (>80% dos clientes pessoais)
- Falhas de envio geram alerta proativo

**Pré-requisitos:**
- Plano Lovable pago (Custom Emails só em paid plans — provavelmente já é o caso da Colmeia)
- Domínio próprio configurado no Lovable Cloud (DNS gerenciado pelo Lovable)
- Subdomínio dedicado para envio (ex: `notificacoes.colmeiagsti.com.br`) — recomendação Lovable

**Risco:** BAIXO. Tracking é "best effort" — se pixel não disparar, email continua entregue normalmente. Lovable Custom Emails é nativo da plataforma, sem chave externa para gerenciar.

### **Fase 5 — Schema Sane (5-7 dias)** 🏗️ refator estrutural — fazer por último

**Objetivo:** quebrar tabela-deus `invoices` em agregado normalizado. Resolve dor #2.6.

**Entregáveis (em 3 PRs sequenciais com dual-write):**

**PR-S1: Criar tabelas novas + dual-write**
- Tabelas `payments`, `payment_attempts`, `notifications_sent`
- Triggers que mantêm consistência: ao escrever em invoices.boleto_status, espelha em payment_attempts
- Migration cuidadosa com snapshot

**PR-S2: Migrar leitura para tabelas novas**
- Hooks de billing leem das novas tabelas
- UI continua usando os mesmos campos (compatibilidade)

**PR-S3: Remover campos redundantes de invoices**
- Drop colunas `boleto_status`, `email_status`, `nfse_status` de invoices (movidas para tabelas filhas)
- Atualizar FSM para ler de relations

**Critério de pronto:**
- `invoices` tem ≤ 20 colunas
- Triggers de espelhamento removidos no fim
- Nenhuma regressão (validação E2E)
- TS 0 erros, vitest 100/100, +20 testes novos

**Risco:** ALTO (mexer em schema de produção). Por isso é a última fase, depois de tudo estar coberto por testes.

---

## 6. Roadmap consolidado (atualiza `PROJECT_REFACTOR_PLAN.md`)

### 6.1 Backlog priorizado

| Prioridade | Item | Tempo | Risco | Categoria |
|:--:|---|--:|:--:|---|
| 🔴 1 | **Mesclar 4 PRs aguardando** (E, UX-Combobox, PROTECTION, audit) | 10 min | - | merge |
| 🟠 2 | **Monitoring fix** (0 alertas lifetime — bug crítico fora de billing) | 1 dia | M | bug |
| 🟡 3 | **Fase 1** — Helpers + status badges unificados | 1-2 dias | Z | refator |
| 🟡 4 | **Fase 2** — Hooks centralizados | 2-3 dias | B | refator |
| 🟢 5 | **Fase 3** — Consolidação de tabs (UX win grande) | 3-4 dias | M | refator |
| 🟢 6 | **Fase 4** — Cobrança operacional completa (régua + saúde + email com anexos + tracking + reenvio) | 5-7 dias | B | feature |
| 🔵 7 | **PR-J** — Testes E2E billing | 2 dias | B | qualidade |
| 🔵 8 | **Fase 5** — Schema sane (quebrar tabela-deus) | 5-7 dias | A | refator |
| 🔵 9 | **PR-DECOM** — Deletar Banco Inter (~60-90d) | 1h | Z | limpeza |
| ⚫ | CMDB Section 4.5 (próximo módulo grande, fora deste audit) | dias | M | feature |
| ⚫ | Banking BASE+CAMADA 2 | dias | M | feature |

**Total das fases 1-5: ~14-20 dias úteis** (ritmo "1 fase por semana" se trabalhar 4-5h/dia).

### 6.2 Métricas de sucesso

| Métrica | Antes (hoje) | Meta pós-Fase 5 |
|---|--:|--:|
| LOC totais (src + edges) | ~104.000 | ~95.000 |
| Tabelas com >40 colunas | 1 (invoices) | 0 |
| Tabs no BillingPage | 11 | 6-7 |
| Lugares com `from("invoices")` | 9 | 0 (só hooks) |
| Mapeamentos de status duplicados | 4 | 0 |
| Componentes >800 LOC | 8 | ≤4 |
| Testes vitest | 100 | 130+ |
| Bugs de inconsistência UI conhecidos | ~5 | 0 |

### 6.3 Princípios não negociáveis durante todas as fases

1. **REUTILIZAR**: extrair só quando substitui ≥2 cópias do antigo
2. **LIMPAR**: ao tocar em arquivo, deletar imports não usados, refatorar inline duplicado
3. **OTIMIZAR**: query nova ≥30% mais barata que a antiga (cache, hook compartilhado)
4. **VALIDAR**: TS 0 erros + vitest 100% antes de cada push
5. **BACKUP TÁTICO**: snapshot table com nome `_FASE_X_backup_DESCRIPTION` antes de qualquer DELETE/UPDATE
6. **PR REVIEW**: nunca merge direto na main em mudança de runtime
7. **DUAL-WRITE em schema changes**: nunca quebrar caminho legado sem decommission planejado

---

## 7. Próxima ação concreta

**Recomendação:** começar pela **Fase 1** depois de mesclar os PRs pendentes.

Razão: Fase 1 é **risco zero** (puramente visual), entrega ganho imediato (UX consistente), e estabelece o padrão de helpers/components que as Fases 2-3 vão reusar fortemente. Não tem dependência de schema.

Alternativa: se Monitoring (0 alertas) é mais urgente para o negócio, atacar isso primeiro. Mas é orthogonal ao financeiro — pode ser feito em paralelo por um técnico ou em sprint à parte.

---

**FIM DO DOCUMENTO** — auditoria gerada a partir do código real em main, 2026-05-07.
