# 📊 BILLING_AUDIT — Auditoria do Módulo Faturamento

**Data:** 2026-05-07 (criado) | 2026-05-07 (decisão Asaas-only registrada)
**Autor:** Claude (auditoria automática a partir do código real em `main`)
**Escopo:** Módulo `billing` (faturamento, boletos, NFSe, notificações de cobrança, conciliação)
**Base:** Commit atual de `main` pós-hotfix `fix/billing-pix-contamination`
**Substitui:** Seção 4.6 (Financeiro MSP) do `COLMEIA_ROADMAP_MESTRE`

> **📍 ATUALIZAÇÃO 2026-05-08:** este documento detalha PRs A-K específicos do billing.
> Para a **visão consolidada do módulo financeiro inteiro** (cobrança + contratos + NFSe + clientes)
> com plano em 5 fases e comparação de mercado, ver **`docs/FINANCIAL_DEEP_AUDIT.md`**.

> **🎯 DECISÃO ESTRATÉGICA REGISTRADA (2026-05-07):**
> Migração completa para **Asaas como único provedor de cobrança** (boleto, PIX, NFSe).
> Banco Inter desativado para novas faturas; boletos legados mantidos durante coexistência (~60-90 dias).
> Custo incremental: ~R$60-80/mês (0,34% da receita anual).
> Justificativa: bug crônico Inter (rate limit + escopo OAuth `cob.write` desabilitado), codebase Asaas ~80% pronto, resolve gap G1 (cobrança bimestral/trimestral) usando subscriptions nativas.
> Implementação: PR-A.5 (em curso na branch `feat/billing-asaas-migration`).

---

## 1. Resumo executivo

O módulo Billing tem **~10.000 linhas de código** distribuídas em **30+ componentes**, **19 edge functions**, **4 hooks** e **20+ entry points** de chamada para edges. **Não há documentação** de regras de negócio, fluxos ou contratos de API entre os módulos. As regras existem implícitas no código, **espalhadas em condições inline** (`status === "pending" && hasPaymentMethod && ...`) que se contradizem entre si.

**Sintomas observáveis em produção (2026-05-07):**

- 8 boletos marcados como erro (3 eram bug do catch cego, 5 eram rate limit Inter)
- Reenvio bloqueado para 5 faturas por bug no payload do botão Regenerar
- Botão "Reenviar email/WhatsApp" existe em 4 componentes diferentes, com lógica duplicada e condições incoerentes
- Operador (Jonatas) não consegue achar o botão de reenvio na UI principal
- Mensagens de erro enganosas (rate limit aparecendo como "escopo OAuth não configurado")
- Cobrança bimestral/trimestral/semestral inexistente no schema, mas exigida pelo negócio
- Zero alerta proativo: falhas só são descobertas quando cliente reclama

**Causa raiz:** acumulação de features sem refator. Cada feature nova foi colada ao lado da anterior, sem unificar fluxo, validação ou notificação.

**Veredito:** o módulo precisa de **refator estrutural**, não de patches. Patches não-coordenados é o que produziu o estado atual.

---

## 2. Inventário

### 2.1 Edge Functions (19)

| Função | Linhas | Função |
|---|--:|---|
| `asaas-nfse` | 2147 | Asaas NFS-e + cobrança (multi-action) |
| `generate-monthly-invoices` | 1133 | Cron diário gera faturas do mês |
| `banco-inter` | 880 | OAuth Inter + boleto/PIX (multi-action) |
| `webhook-asaas-nfse` | 605 | Recebe eventos Asaas |
| `batch-process-invoices` | 439 | Reprocessamento em lote |
| `resend-payment-notification` | 425 | Reenvio manual email/WhatsApp |
| `webhook-banco-inter` | 392 | Recebe eventos Inter |
| `notify-due-invoices` | 386 | Cron envia email da fatura |
| `generate-invoice-payments` | 372 | (helper de geração) |
| `send-nfse-notification` | 348 | Notificação específica NFSe |
| `batch-collection-notification` | 259 | Régua de cobrança em lote |
| `renegotiate-invoice` | 213 | Renegociação |
| `manual-payment` | 212 | Baixa manual |
| `calculate-invoice-penalties` | 123 | Multa/juros |

### 2.2 Componentes (30+ arquivos, 30 listados por tamanho)

| Componente | Linhas |
|---|--:|
| `nfse/NfseDetailsSheet.tsx` | 1173 |
| `BillingInvoicesTab.tsx` | 1134 |
| `BillingNfseTab.tsx` | 931 |
| `BillingErrorsPanel.tsx` | 877 |
| `BillingBoletosTab.tsx` | 864 |
| `nfse/NfseAvulsaDialog.tsx` | 454 |
| `InvoiceProcessingHistory.tsx` | 430 |
| `IntegrationHealthDashboard.tsx` | 414 |
| `BankReconciliationTab.tsx` | 406 |
| `BillingBatchProcessing.tsx` | 339 |
| `AccountsReceivableTab.tsx` | 313 |
| `BillingServicesTab.tsx` | 312 |
| `InvoiceActionsPopover.tsx` | 309 |
| ... (outros 20+) |

### 2.3 Hooks (4)

| Hook | Linhas | Concentra |
|---|--:|---|
| `useInvoiceActions.ts` | 453 | Reenvio, baixa manual, segunda via, marcar pago, etc |
| `useServiceCodeUsageStats.ts` | 99 | Stats de códigos NFSe |
| `useBatchProcessing.ts` | 83 | Reprocessamento em lote |
| `useBillingCounters.ts` | 65 | Contadores do dashboard |

### 2.4 Tabelas

**Core:** `invoices`, `invoice_items`, `contracts`, `clients`, `nfse_history`, `bank_accounts`, `financial_entries`, `cost_centers`

**Integração:** `application_logs` (logs gerais), `audit_logs` (mudanças sensíveis), `invoice_notification_logs` (logs específicos de notificação)

**Escopo:** payment providers (Asaas + Banco Inter v3), NFSe (Asaas), Resend (email), Evolution (WhatsApp)

### 2.5 Cron jobs ativos (8 reportados, gerenciados via Lovable Cloud Tab)

`generate-invoices-daily`, `notify-due-invoices-daily`, `update-overdue-status`, `check-adjustments-daily`, `poll-services-6h`, `check-doc-expiries-daily`, `unifi-sync-hourly`, `detect-auth-anomalies-daily`

---

## 3. Schema atual (campos relevantes)

### 3.1 `invoices`

```
-- Identidade
id uuid PK
invoice_number serial
client_id uuid FK → clients
contract_id uuid FK → contracts (nullable)

-- Valor / vencimento
amount numeric(10,2)
due_date date
paid_date date

-- Status macro
status invoice_status enum  -- 'pending', 'paid', 'overdue', 'cancelled'

-- Pagamento
payment_method text          -- 'boleto', 'pix', 'transferencia'
boleto_url text
boleto_barcode text
pix_code text
billing_provider text        -- 'banco_inter', 'asaas'
asaas_invoice_url text
asaas_payment_id text

-- Status granular do BOLETO (paralelo ao status macro)
boleto_status boleto_processing_status -- enum: 'pendente','processando','gerado','enviado','erro'
boleto_sent_at timestamptz
boleto_error_msg text

-- Status granular do EMAIL
email_status email_processing_status -- enum: 'pendente','processando','enviado','erro'
email_sent_at timestamptz
email_error_msg text

-- Status granular da NFSe
nfse_status nfse_processing_status   -- enum: 'pendente','processando','autorizada','rejeitada','erro'
nfse_generated_at timestamptz
nfse_error_msg text
nfse_history_id uuid FK → nfse_history

-- Pipeline de processamento
auto_payment_generated boolean DEFAULT false
processing_attempts integer DEFAULT 0
processing_metadata jsonb DEFAULT '{}'
processed_at timestamptz

-- Outras
notes text                   -- DUAL-PURPOSE: codigoSolicitacao Inter + observações livres
reference_month text
created_at, updated_at
```

**Problemas estruturais já no schema:**

1. **`notes` é dual-purpose** — Banco Inter usa para `codigoSolicitacao`, mas UI permite editar como observação livre. Risco constante de sobrescrita.
2. **Não há `pix_status`** análogo ao `boleto_status`. PIX cai como erro genérico ou contamina `boleto_status` (corrigido no hotfix de 2026-05-07).
3. **`boleto_sent_at` existe** mas pouco usado consistentemente — algumas funções marcam, outras não. Não há contrato claro de quando setar.
4. **Migrations duplicadas:** `20260205100000` e `20260205130319` adicionam as MESMAS colunas. Idempotente, mas é sintoma de descoordenação.

### 3.2 `contracts` (campos billing-relevantes)

```
billing_day integer DEFAULT 10            -- dia do mês para faturar
days_before_due integer DEFAULT 5         -- antecedência da notificação
first_billing_month text                  -- ex: '2026-03'
billing_provider text                     -- 'banco_inter' | 'asaas'
payment_preference text DEFAULT 'boleto'  -- 'boleto' | 'pix' | 'both'
notification_message text                 -- template do email
adjustment_percentage numeric             -- reajuste anual (não usado plenamente)

-- NFSe
nfse_enabled boolean DEFAULT true
nfse_cnae text
nfse_service_code text DEFAULT '010701'
nfse_service_code_id uuid FK
nfse_descricao_customizada text
nfse_aliquota numeric DEFAULT 0
nfse_iss_retido boolean DEFAULT false
```

**O que NÃO existe (gap funcional crítico):**

- `billing_frequency` (mensal | bimestral | trimestral | semestral | anual)
- `last_billed_month` ou similar para controlar pulos de geração quando frequência > mensal
- `installment_count` para parcelamento

---

## 4. Fluxos como existem hoje

### 4.1 Fluxo 1 — Geração mensal automática (cron `generate-monthly-invoices`)

```
[CRON 11h diário]
   ↓
loop contracts WHERE status='active'
   ↓
SE billing_day = hoje E first_billing_month <= mês atual E não existe invoice no mês
   ↓
INSERT invoice (status=pending, amount=monthly_value, due_date=hoje+days_before_due)
   ↓
SE billing_provider preenchido E payment_preference preenchido:
    SE preference='boleto' → invoke('banco-inter' OU 'asaas-nfse', payment_type='boleto')
    SE preference='pix'    → invoke('banco-inter' OU 'asaas-nfse', payment_type='pix')
    SE preference='both'   → invoca AMBOS em loop sequencial
   ↓
SE nfse_enabled E aliquota > 0 → invoke('asaas-nfse', action='emit')
   ↓
fim
```

**Problemas conhecidos do fluxo:**

- Hard-coded mensal — sem suporte a outras frequências
- Loop `["boleto","pix"]` com try/catch que envolve o LOOP INTEIRO (corrigido em 2026-05-07: agora separa `lastPaymentType` e diferencia falha)
- Nenhum retry quando rate limit Inter (HTTP 429)
- Cron pula faturas com vencimento retroativo apenas se já existe — não recria automaticamente
- Erro de NFSe não bloqueia geração de fatura, mas erro de geração de boleto na UI esconde botão de reenvio (`hasPaymentMethod=false`)

### 4.2 Fluxo 2 — Reenvio manual de notificação

**Existe em 4 lugares** com lógicas duplicadas:

| Onde | Componente | Trigger UI |
|---|---|---|
| Lista principal de faturas | `InvoiceActionsPopover` (chamado por `BillingInvoicesTab`) | menu ⋮ → "Enviar por Email/WhatsApp/Ambos" |
| Lista mobile | `InvoiceInlineActions` | ícone email |
| Painel de Erros | `BillingErrorsPanel` | botões Email/WhatsApp |
| Dentro de contrato | `ContractInvoiceActionsMenu` | menu na linha de fatura |

Todos chamam `useInvoiceActions.handleResendNotification()` que invoca a edge `resend-payment-notification`. **Mas as condições para o botão APARECER são diferentes em cada lugar:**

- `InvoiceActionsPopover`: `status='pending'|'overdue'` E (`boleto_url` OU `pix_code`)
- `BillingErrorsPanel`: só se a fatura já está na lista de erros
- `ContractInvoiceActionsMenu`: condições próprias

Resultado: dependendo da tela, o usuário acha ou não acha o botão.

**Bloqueio adicional:** `checkArtifactReadiness()` impede reenvio se NFSe vinculada está `autorizada` mas sem PDF/XML, ou se boleto está `pendente`/`processando` sem dados. Bloqueio bem-intencionado mas a UI não comunica claramente o motivo (toast amarelo "Envio bloqueado: ...").

### 4.3 Fluxo 3 — Cron de notificação de vencimento (`notify-due-invoices`)

```
[CRON 12h diário]
   ↓
loop invoices WHERE status='pending' E due_date entre [hoje, hoje+days_before_due]
   ↓
SE email_status NÃO IN ('enviado'):
    download boleto + signed URL
    invoke('send-email-resend', template=contract.notification_message)
    SE sucesso: UPDATE email_status='enviado', email_sent_at=now()
    SE erro:    UPDATE email_status='erro', email_error_msg=...
```

**Problemas:**

- Sem retry automático em falha
- Sem envio escalonado (D-5, D-2, D+0, D+1, D+5...) — apenas 1 ciclo
- Não considera `client_notification_preferences` (tabela não existe — gap)
- WhatsApp não é disparado automaticamente, só por reenvio manual

### 4.4 Fluxo 4 — Webhook Asaas / Banco Inter

```
[Asaas/Inter dispara POST /webhook-{provider}]
   ↓
verifica HMAC do header
   ↓
parse evento (PAYMENT_CONFIRMED, PAYMENT_OVERDUE, BOLETO_GERADO, etc)
   ↓
match com invoice via asaas_payment_id ou codigoSolicitacao
   ↓
UPDATE status, paid_date, etc conforme o evento
   ↓
trigger lateral: notify_on_payment_confirmed (G3 do Lote B)
```

**Problemas:**

- Idempotência fraca em alguns eventos
- Sem dead-letter queue para webhooks que chegam fora de ordem
- Logs em `application_logs` mas sem dashboard

### 4.5 Fluxo 5 — Pagamento manual / conciliação

`ManualPaymentDialog` → invoke `manual-payment` → atualiza status, paid_date, registra em `financial_entries`.

`BankReconciliationTab` permite cruzar OFX com invoices. Implementação parcial.

### 4.6 Fluxo 6 — Renegociação / 2ª via

`RenegotiateInvoiceDialog` → invoke `renegotiate-invoice` (gera nova invoice substitutiva).
`InvoiceActionsPopover` → "Segunda via" → invoke `banco-inter` com `action='generate_second_copy'` (já existe na edge).

### 4.7 Fluxo 7 — NFSe (emissão + reenvio)

Cron + manual via `BillingNfseTab` + edge `asaas-nfse` (action `emit` ou `emit_standalone`). Histórico em `nfse_history`. Reenvio de email da NFSe via `send-nfse-notification`.

### 4.8 Fluxo 8 — Pipeline visual de processamento

`InvoiceProcessingHistory` mostra steps (Geração → Boleto → NFSe → Email) por fatura, com estado granular. Boa ideia conceitualmente, mas o estado é derivado de N campos descorrelacionados (`boleto_status`, `email_status`, `nfse_status`, `processing_attempts`) em vez de uma máquina de estado real.

---

## 5. Regras de negócio implícitas (extraídas do código)

| # | Regra | Onde está implementada | Gap |
|--:|---|---|---|
| 1 | Faturas são geradas no `billing_day` do mês | `generate-monthly-invoices` | Hard-coded mensal |
| 2 | `due_date = billing_day + days_before_due` | mesmo | OK |
| 3 | `payment_preference='both'` gera boleto E PIX | mesmo | Bug do catch cego (corrigido) |
| 4 | NFSe só é emitida se `nfse_enabled=true` E `nfse_aliquota > 0` | mesmo | OK |
| 5 | Reenvio de boleto bloqueado se NFSe autorizada sem PDF/XML | `checkArtifactReadiness` | OK mas mensagem confusa |
| 6 | Boleto vence retroativamente → ajuste de data automático | `banco-inter/index.ts` | OK |
| 7 | Token Inter usa OAuth `client_credentials` com fallback de escopo combinado | `banco-inter/tryGetTokenWithFallback` | Sem cache → consome rate limit |
| 8 | Webhook valida HMAC | `webhook-{provider}` | OK |
| 9 | Cron notify-due-invoices é executado 1x ao dia no horário fixo | cron Lovable Cloud | Sem fallback se falhar |
| 10 | Notificação por email respeita `contract.notification_message` como template | `notify-due-invoices` | Sem variáveis dinâmicas documentadas |
| 11 | WhatsApp só é enviado por reenvio manual | `resend-payment-notification` | Não há cron WhatsApp |
| 12 | Status macro (`status`) e granular (`boleto_status`) coexistem sem sincronização | invoices schema | **Falta máquina de estado** |
| 13 | `notes` da invoice é usado pelo Inter para `codigoSolicitacao` | `banco-inter` | **Conflito com observações livres** |

**Regras inexistentes mas necessárias** (gap):

- Frequência de cobrança (bimestral/trimestral/semestral/anual)
- Política de retry em rate limit (429)
- Política de escalonamento de cobrança (D-5, D-2, D+0, D+1, D+5)
- Política de inadimplência (a partir de N dias, qual ação?)
- Política de baixa automática via webhook
- Política de notificação ao admin quando cron falha
- Critério de "fatura sem ação" (quando deve gerar alerta)

---

## 6. Gaps funcionais (priorizados)

| # | Gap | Impacto | Prioridade |
|--:|---|---|---|
| G1 | Cobrança bimestral/trimestral/semestral/anual ausente | Bloqueia onboarding de novos clientes que pediram | **CRÍTICA** |
| G2 | Sem token cache OAuth Inter | Rate limit em uso normal | **CRÍTICA** |
| G3 | Sem retry em 429 | Falha de boleto vira erro permanente | **CRÍTICA** |
| G4 | Sem alerta proativo de falha do cron | Erros só descobertos quando cliente reclama | **ALTA** |
| G5 | Botão de reenvio fragmentado em 4 componentes | Operador se perde | **ALTA** |
| G6 | Mensagens de erro enganosas (rate limit aparece como erro de escopo) | Diagnóstico errado | **ALTA** |
| G7 | Sem `pix_status` separado | PIX falha contamina boleto (corrigido), mas painel não tem visibilidade dedicada | **MÉDIA** |
| G8 | Cron de notificação roda 1x sem retry | Falhas transitórias viram permanentes | **MÉDIA** |
| G9 | `notes` dual-purpose | Risco de sobrescrita de codigoSolicitacao Inter | **MÉDIA** |
| G10 | Sem máquina de estado (FSM) clara da fatura | Fluxos divergem entre tabs/painéis | **MÉDIA** |
| G11 | Régua de cobrança incompleta (apenas D-X via cron) | Inadimplência não é trabalhada | **MÉDIA** |
| G12 | `client_notification_preferences` não existe | Cliente não pode desabilitar notificações específicas | **BAIXA** |
| G13 | Sem dashboard de saúde do billing (taxa de sucesso, erros do dia) | Sem visibilidade operacional | **BAIXA** |
| G14 | Sem export contábil estruturado | Contador pede planilha manual | **BAIXA** |

---

## 7. Dívidas técnicas estruturais

| # | Dívida | Evidência |
|--:|---|---|
| D1 | `BillingInvoicesTab.tsx` 1134 linhas concentra muita lógica | precisa quebrar em sub-componentes |
| D2 | `asaas-nfse/index.ts` 2147 linhas é multi-action gigante | candidato a separar (nfse vs payment) |
| D3 | `BillingErrorsPanel.tsx` duplica lógica de regenerar/reenviar | reaproveitar `useInvoiceActions` integralmente |
| D4 | `InvoiceProcessingHistory` duplica `handleRegenerateBoleto` | mesma raiz |
| D5 | 4 implementações distintas de "botão de reenvio" | unificar em `useInvoiceActions` + 1 popover canônico |
| D6 | `useInvoiceActions` 453 linhas com 11+ funções | quebrar em hooks especializados |
| D7 | Migrations duplicadas (`20260205100000` e `20260205130319` adicionam mesmas colunas) | falta processo de revisão |
| D8 | `notes` dual-purpose | extrair `inter_codigo_solicitacao` para coluna própria |
| D9 | Validador `action="test"` da edge `banco-inter` faz 6 chamadas OAuth seguidas | bate rate limit ao testar |
| D10 | Mensagem de erro "Falha ao autenticar com Banco Inter para BOLETO" é genérica e enganosa | erros tipados por categoria (auth/scope/rate-limit/network) |
| D11 | `boleto_sent_at` existe mas é setado inconsistentemente | contrato claro: setar APÓS confirmação Resend |
| D12 | Edges não usam `_shared/auth-helpers.ts` (existe mas billing não importa) | reaproveitar `requireRole`, `rateLimit`, `logAudit`, `jsonResponse` |
| D13 | Sem testes E2E para fluxo de geração+envio | risco de regressão |
| D14 | `invoice_notification_logs` mantido (4 edges escrevem, 1 painel lê) | OK por enquanto, revisar em refator final |

---

## 8. Lixo identificado para remoção

| Item | Razão |
|---|---|
| Lógica duplicada de `handleRegenerateBoleto` em 2 componentes | Mover para `useInvoiceActions` |
| Lógica duplicada de `handleResendNotification` em 4 componentes | Mover para 1 popover canônico |
| Migration `20260205130319` (re-adiciona colunas idempotentemente) | Manter (idempotente) mas marcar como dívida |
| Strings de erro hard-coded espalhadas | Centralizar em `src/lib/billing-errors.ts` |
| Validações ad-hoc de `payment_preference` espalhadas | Centralizar em `src/lib/billing-rules.ts` |
| `BillingBoletosTab` (864 linhas) e `BillingNfseTab` (931 linhas) com seções repetidas | Compor por um componente `BillingArtifactList<T>` genérico |

---

## 9. Plano de refator faseado

> **REVISADO em 2026-05-07** após decisão de migrar para Asaas-only.
> PRs marcados ❌ foram cancelados. PRs marcados ✏️ foram simplificados. PRs marcados 🆕 foram adicionados.

Cada PR é independente, com critério de pronto explícito. Ordem otimizada para **não bloquear produção** (cada PR pode ser deployado isoladamente).

### 🆕 PR-A.5 — Migração Inter → Asaas (1 dia) ⏳ EM CURSO

**Branch:** `feat/billing-asaas-migration`

**Escopo:**
- Edge `generate-monthly-invoices`: forçar `provider='asaas'` (remover lookup Inter, dead code)
- Edge `asaas-nfse`: corrigir bug `boleto_status='enviado'` → `'gerado'` ao criar (mentia sobre estado real)
- `ContractForm.tsx`: remover opção "Banco Inter" do select (Asaas único)
- Migration: snapshot de backup + UPDATE `contracts.billing_provider='asaas'` para os 31 contratos active
- CHANGELOG + docs

**Coexistência:**
- Boletos Inter já emitidos (cobrança maio/2026) **continuam ativos** até serem pagos ou vencerem
- `webhook-banco-inter` **mantém-se funcional** para receber `PAYMENT_CONFIRMED` dos legados
- Edges `banco-inter` e `webhook-banco-inter` **NÃO removidas neste PR**

**Critério de pronto:**
- TS 0 erros
- Próximas faturas geradas pelo cron usam Asaas
- Migration aplicada com snapshot intacto para reversão
- Boletos Inter legados continuam acessíveis para o cliente pagar

**Resolve gaps:** parcialmente G2/G3 (Inter sai de cena para novas faturas)

---

### ❌ PR-B — Hardening edge `banco-inter` — CANCELADO

Substituído por PR-A.5 (Inter sai inteiro). Não faz sentido investir tempo hardening de algo que vai morrer.

---

### ✏️ PR-C — Frequência de cobrança via lógica de pulo (Estratégia B) ✅ CONCLUÍDO

**Decisão estratégica (2026-05-07):** após análise comparativa entre Estratégia A (Asaas Subscriptions nativas) e Estratégia B (cron local com pulo), optamos pela B. Razões: princípio do projeto de REUTILIZAR código existente; risco menor; reversibilidade fácil; mantém autoridade local sobre quando gerar; não bloqueia migração futura para Subscriptions.

**Branch:** `feat/billing-frequency-pr-c`

**Escopo realizado:**
- Schema: `contracts.billing_frequency text NOT NULL DEFAULT 'monthly'` com `CHECK` aceitando `monthly`/`bimonthly`/`quarterly`/`semiannual`/`yearly`
- Migration `20260507204537` com snapshot de backup em `_billing_pr_c_backup_billing_frequency`
- Edge `generate-monthly-invoices`: lógica de pulo (~30 LOC) que busca última invoice do contrato e calcula meses entre referências. Se `monthsSince < intervalMonths`, pula com `status='skipped'`
- UI `ContractForm.tsx`: dropdown "Periodicidade" com 5 opções; schema Zod, defaultValues e payload do save atualizados
- TS 0 erros, vitest 59/59 ✅

**Resolve gaps:** G1 (cobrança em frequências diferentes de mensal)

**Estratégia A (Subscriptions Asaas) descartada por hora.** Registrada como opção futura quando Colmeia virar SaaS multi-tenant ou quiser delegar régua de cobrança ao Asaas.

---

### ✅ PR-D — Unificar fluxo de reenvio/regenerar/polling ✅ CONCLUÍDO

**Branch:** `feat/billing-unify-actions-pr-d`

**Diagnóstico:** Auditoria revelou que `handleResendNotification` tinha 4 implementações (1 no hook + 3 duplicadas), `handleRegenerateBoleto` tinha 2 cópias idênticas (e ainda com dead branch Inter), e `handleForcePolling` 2 cópias.

**Refator:**
- `useInvoiceActions` ganha `handleRegenerateBoleto` + `handleForcePolling` (extraídos)
- `BillingErrorsPanel` e `InvoiceProcessingHistory` passam a usar tudo via hook
- Dead branch Inter removido das 2 cópias de regenerar boleto
- Estados locais redundantes (`resendingId`, `pollingId` em ErrorsPanel; parte do `actionLoading` em ProcessingHistory) eliminados

**Resultado:** UX consistente nas 3 telas, validação prévia (`checkArtifactReadiness`) agora aplicada universalmente, tratamento de `data.blocked` e `errorCode` específicos ganho de graça.

**Saldo:** -78 linhas, TS 0 erros, vitest 59/59.

**Resolve gaps:** G5 | **Reduz dívida:** D3, D4, D5

**Fora do escopo (registrado para PR futuro):** `handleReprocessNfse` (específico NFSe), `handleRetryNfse`, `handleClearFailedNfse` no ErrorsPanel — também tem duplicação mas em menor grau, podem ir num PR-D.5 se virar problema.

---

### ✅ PR-E — Máquina de estado da fatura (FSM) ✅ CONCLUÍDO

**Branch:** `feat/billing-fsm-pr-e`

**Implementado:**
- `src/lib/billing-fsm.ts` (193 LOC) — FSM central com:
  - `InvoiceDerivedState` (8 estados consolidados)
  - `computeInvoiceDerivedState(invoice)` — algoritmo com prioridade explícita
  - 7 helpers de permissão (`canMarkAsPaid`, `canResendNotification`, `canRegenerateBoleto`, `canEmitNfse`, `canCancelInvoice`, `canCancelBoleto`, `canForcePolling`) retornando `{ allowed, reason? }`
  - `getDerivedStateDisplay(state)` — metadados (label, variant, toneClass)
- `src/lib/billing-fsm.test.ts` (210 LOC) — **41 testes** cobrindo todos estados + helpers + prioridades
- `InvoiceActionsPopover.tsx` refatorado para usar FSM (demonstração do padrão)

**Resultado:** Total de testes do projeto: 59 → **100 testes** (+41).

**Migração futura sem urgência:** demais componentes (`BillingErrorsPanel`, `BillingInvoicesTab`, `InvoiceProcessingHistory`) podem migrar gradualmente. A FSM é aditiva — não quebra nada existente.

**Resolve gaps:** G10 | **Reduz dívida:** D1, D6

---

### ✅ PR-F — Régua de cobrança escalonada (2 dias) — MANTIDO

**Bônus:** Asaas tem régua de cobrança nativa via WhatsApp (R$ 0,55/msg). Avaliar usar a régua deles em vez de implementar a nossa.

---

### ✅ PR-G — Dashboard de saúde + alerta proativo (1 dia) — MANTIDO

---

### ❌ PR-H — Limpar lixo + extrair `inter_codigo_solicitacao` — CANCELADO

`inter_codigo_solicitacao` era específico do Inter. Sem Inter, não precisa. Demais limpezas (centralizar errors/rules) movidas para PR-K.

---

### ✏️ PR-I — `payment_errors` estruturado (1 dia)

**Mudou:** sem precisar de `pix_status` separado (Asaas tem status unificado). Foco só em estruturar histórico de erros.

**Escopo:**
- Coluna `invoices.payment_errors jsonb` para histórico de erros tipados
- Edge `generate-monthly-invoices` grava erros estruturados
- Painel de Erros mostra cada erro com tipo + timestamp

**Resolve gaps:** G7 (parcialmente, integrado com Asaas)

---

### ✅ PR-J — Testes E2E billing (2 dias) — MANTIDO

---

### ✅ PR-K — Documentação consolidada + limpeza geral (1-2 dias)

**Escopo expandido:**
- Tudo do plano original
- + Centralizar strings de erro em `src/lib/billing-errors.ts`
- + Centralizar regras em `src/lib/billing-rules.ts`
- + Quebrar `BillingInvoicesTab` em sub-componentes
- + Quebrar `useInvoiceActions` em hooks especializados

---

### 🆕 PR-DECOM — Decommission Banco Inter (1h, daqui ~60-90 dias)

**Pré-requisito:** todos os boletos Inter legados devem ter sido pagos ou cancelados. Validar via:

```sql
SELECT count(*) FROM invoices
WHERE billing_provider = 'banco_inter'
  AND status IN ('pending', 'overdue');
-- Esperado: 0
```

**Escopo:**
- Arquivar (NÃO deletar) edges `banco-inter` e `webhook-banco-inter` em `supabase/functions/_deprecated/`
- Remover secrets Inter do Lovable Cloud
- Cancelar webhook configurado no portal Inter
- Encerrar conta Inter (decisão do usuário)

---

### Total estimado revisado

```
PR-A.5  Migração Inter → Asaas        1 dia    (em curso)
PR-B    Hardening Inter               ❌ CANCELADO
PR-C    Frequência via Subscriptions  2-3 dias
PR-D    Unificar reenvio              1 dia
PR-E    FSM da fatura                 1-2 dias
PR-F    Régua de cobrança             2 dias
PR-G    Saúde + alertas               1 dia
PR-H    Lixo + codigoSolicitacao      ❌ CANCELADO (movido p/ PR-K)
PR-I    payment_errors                1 dia
PR-J    E2E                           2 dias
PR-K    Docs + limpeza geral          1-2 dias
PR-DECOM Decommission Inter           1h (em ~60-90 dias)
─────────────────────────────────────────
TOTAL                                 12-15 dias úteis
```

---

## 10. Comparação com `COLMEIA_ROADMAP_MESTRE`

| Roadmap atual | Status | Como fica neste plano |
|---|---|---|
| Seção 4.6 (Financeiro MSP — BASE+CAMADA 2) | aberta, sem detalhamento | **Substituída** por PRs B–K acima |
| Seção 4.6.1 (recibo) | listada genericamente | Vira parte de PR-K (template + edge) |
| Seção 4.11.1 (mapear Vault+pg_net) | aberta, "diagnóstico" | **Mantida fora de billing** (problema sistêmico) |
| Seção 4.11.2 (notify_on_monitoring_alert quebrada) | aberta | **Mantida fora de billing** |
| Seção 5/6/7 (limpeza/consolidação/hardening geral) | abertas | **Mantidas** — billing é apenas 1 módulo, há débitos em outros |
| Bug-2 (IP RMM) | aberto | **Independente** de billing |

**Conclusão:** este plano executa a **Seção 4.6 inteira** com mais detalhe e profundidade do que o roadmap atual previa. As outras seções continuam válidas para outros módulos.

---

## 11. Métricas de progresso

A partir da próxima sessão, cada PR fechado atualiza:

| Métrica | Hoje | Meta pós-refator |
|---|--:|--:|
| Linhas de código billing | ~10.000 | ≤ 7.000 |
| Edge functions billing | 19 | 14 (consolidadas) |
| Componentes > 800 linhas | 5 | 0 |
| Lugares com lógica de reenvio | 4 | 1 |
| Gaps funcionais críticos | 3 (G1, G2, G3) | 0 |
| Dívidas técnicas estruturais | 14 | ≤ 5 |
| Cobertura de testes E2E billing | 0% | ≥ 80% |
| Tempo médio de diagnóstico de erro | ~30 min (caso a caso) | ≤ 5 min (via dashboard) |
| Falhas em produção sem alerta | 100% | 0% |

---

## 12. Como manter este documento vivo

- **Atualizar a cada PR** (seção 9 marca PR fechado, seção 11 atualiza métricas)
- **Não deletar** — apenas adicionar entrada `### Histórico — YYYY-MM-DD` quando algo mudar
- **Fonte da verdade** sobre regras de negócio e fluxos do billing
- Revisão trimestral para garantir alinhamento com produto

---

## Apêndice A — Comandos úteis para auditoria contínua

```bash
# Re-rodar inventário de tamanhos
find src/components/billing -type f -name "*.tsx" | xargs -I{} bash -c 'echo "$(wc -l < {}) {}"' | sort -rn

# Detectar invokes de edges billing
grep -rhn "supabase.functions.invoke" src/components/billing/ src/hooks/ | grep -oE '"[a-z][a-z-]+[a-z]"' | sort | uniq -c | sort -rn

# Detectar componentes com lógica duplicada de reenvio
grep -rln "handleResendNotification\|resend-payment-notification" src/

# Validar TS 0 erros
npx tsc --noEmit
```

---

**FIM DO DOCUMENTO** — gerado em 2026-05-07 a partir do código real.
