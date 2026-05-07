# Colmeia HD Pro — Documentação Técnica Completa

> **Versão:** 2026-02-13  
> **Plataforma:** React + Vite + TypeScript + Tailwind CSS + Lovable Cloud (Supabase)  
> **Arquitetura:** SPA com Edge Functions serverless, Row-Level Security e automação via pg_cron

---

## Sumário

1. [Visão Geral do Sistema](#1-visão-geral-do-sistema)
2. [Módulo de Contratos](#2-módulo-de-contratos)
3. [Módulo Financeiro](#3-módulo-financeiro)
4. [Emissão de Nota Fiscal (NFS-e)](#4-emissão-de-nota-fiscal-nfs-e)
5. [Emissão de Boleto / Link de Pagamento](#5-emissão-de-boleto--link-de-pagamento)
6. [Envio Automático ao Cliente](#6-envio-automático-ao-cliente)
7. [Serviços Adicionais Pontuais](#7-serviços-adicionais-pontuais)
8. [Notas Fiscais Avulsas](#8-notas-fiscais-avulsas)
9. [Módulo de Clientes](#9-módulo-de-clientes)
10. [Módulo de Usuários e Permissões](#10-módulo-de-usuários-e-permissões)
11. [Módulo de Chamados (Tickets)](#11-módulo-de-chamados-tickets)
12. [Módulo de Monitoramento](#12-módulo-de-monitoramento)
13. [Módulo de Inventário](#13-módulo-de-inventário)
14. [Módulo de Agenda / Calendário](#14-módulo-de-agenda--calendário)
15. [Portal do Cliente](#15-portal-do-cliente)
16. [Base de Conhecimento](#16-base-de-conhecimento)
17. [Gamificação](#17-gamificação)
18. [TV Dashboard](#18-tv-dashboard)
19. [Relatórios](#19-relatórios)
20. [Auditoria e Logs](#20-auditoria-e-logs)
21. [Fluxos Completos do Sistema](#21-fluxos-completos-do-sistema)
22. [Regras Gerais do Sistema](#22-regras-gerais-do-sistema)
23. [Integrações Externas](#23-integrações-externas)
24. [Infraestrutura e Automação](#24-infraestrutura-e-automação)

---

## 1. Visão Geral do Sistema

### 1.1 Propósito

O **Colmeia HD Pro** é uma plataforma unificada de gestão para empresas de suporte de TI (MSP — Managed Service Provider). Centraliza operações de helpdesk, gestão de clientes, contratos recorrentes, faturamento automático, emissão fiscal, monitoramento de infraestrutura e inventário de ativos em uma única interface.

### 1.2 Público-Alvo

- **Equipe interna (staff):** Administradores, gerentes, técnicos e financeiro
- **Clientes:** Acesso ao Portal do Cliente para abertura de chamados e consulta financeira

### 1.3 Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Tailwind CSS + shadcn/ui + Framer Motion |
| Estado | TanStack React Query v5 (cache 5min, GC 15min) |
| Roteamento | React Router v6 |
| Backend | Lovable Cloud (Supabase) — PostgreSQL + Edge Functions (Deno) |
| Autenticação | Supabase Auth (email/senha) |
| Realtime | Supabase Realtime (PostgreSQL changes via WebSocket) |
| Armazenamento | Supabase Storage (nfse-files, certificates, etc.) |
| PWA | vite-plugin-pwa com Service Worker para push notifications |

### 1.4 Mapa Funcional

O sistema possui **18 módulos principais**: Dashboard, Chamados, Clientes, Contratos, Faturamento (7 sub-abas), Monitoramento, Inventário, Agenda, Base de Conhecimento, Gamificação, TV Dashboard, Relatórios, Portal do Cliente, Configurações (15 abas), Certificados Digitais, Perfil/Notificações, Autenticação e Notificações em Tempo Real.

### 1.5 Design System

- **Fonte primária:** Orbitron (títulos, destaque tecnológico)
- **Fonte secundária:** Montserrat (textos, labels, UI)
- **Cor principal (Brand-500):** `#F5B700` (Honey Gold) — CTAs e ações primárias
- **Cor de texto (Neutral-900):** `#212529`
- **Cores de apoio:** Sucesso `#2F9E44`, Erro `#E03131`, Aviso `#F08C00`, Informativo `#1C7ED6`
- **Espaçamentos:** Múltiplos de 4px/8px

---

## 2. Módulo de Contratos

### 2.1 Estrutura de Dados

**Tabela:** `contracts`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Identificador único |
| `client_id` | UUID (FK → clients) | Cliente vinculado |
| `name` | TEXT | Nome descritivo do contrato |
| `description` | TEXT | Descrição de escopo |
| `status` | ENUM (`active`, `suspended`, `cancelled`, `expired`) | Estado atual |
| `monthly_value` | NUMERIC | Valor mensal recorrente |
| `billing_day` | INTEGER (1-31) | Dia de vencimento das faturas (default: 10) |
| `days_before_due` | INTEGER | Dias de antecedência para lembrete (default: 5) |
| `start_date` | DATE | Início da vigência |
| `end_date` | DATE (nullable) | Término (null = indeterminado) |
| `auto_renew` | BOOLEAN | Renovação automática (default: true) |
| `support_model` | ENUM (`unlimited`, `hourly`, `block`) | Modelo de atendimento |
| `hours_included` | INTEGER | Horas incluídas (para modelos `hourly`/`block`) |
| `payment_preference` | TEXT (`boleto`, `pix`, `both`) | Preferência de pagamento |
| `billing_provider` | TEXT (`banco_inter`, `asaas`) | Provedor de cobrança (default: `banco_inter`) |
| `adjustment_index` | TEXT (`IGPM`, `IPCA`, `INPC`, `FIXO`) | Índice de reajuste anual |
| `adjustment_percentage` | NUMERIC | Percentual fixo (quando `FIXO`) |
| `adjustment_date` | DATE | Data do próximo reajuste |
| `nfse_enabled` | BOOLEAN | Emissão automática de NFS-e (default: true) |
| `nfse_service_code` | TEXT | Código LC 116/2003 (ex: `010701`) |
| `nfse_service_code_id` | UUID (FK → nfse_service_codes) | Referência ao catálogo de serviços |
| `nfse_descricao_customizada` | TEXT | Descrição personalizada para NFS-e |
| `nfse_cnae` | TEXT | CNAE vinculado |
| `notification_message` | TEXT | Template de mensagem personalizada para cobrança |
| `internal_notes` | TEXT | Notas internas (não visíveis ao cliente) |

### 2.2 Tipos de Contrato (por Modelo de Suporte)

1. **Ilimitado (`unlimited`):** Sem limite de horas de atendimento. Valor fixo mensal.
2. **Por hora (`hourly`):** Horas incluídas definidas em `hours_included`. Excedentes são cobrados separadamente via cobranças adicionais.
3. **Pacote de horas (`block`):** Banco de horas pré-pago. O controle de consumo é feito via registro de tempo nos chamados (`ticket_time_entries`).

### 2.3 Regras de Ativação, Suspensão e Cancelamento

#### Ativação
- Status inicial ao criar: `active`
- Contratos ativos com `monthly_value > 0` são elegíveis para faturamento automático
- A data `start_date` é populada automaticamente com `CURRENT_DATE` se não informada

#### Suspensão
- Mudança manual de status para `suspended`
- Contratos suspensos são **excluídos** da geração automática de faturas
- O histórico de suspensão é registrado em `contract_history`
- Ao reativar, o sistema retoma o faturamento no próximo ciclo mensal

#### Cancelamento
- Mudança de status para `cancelled`
- Faturas já geradas permanecem válidas e cobráveis
- Faturas com status `cancelled` ou `voided` são ignoradas na validação de unicidade (prevenção de duplicatas)
- Registro obrigatório em `contract_history` com motivo

### 2.4 Serviços do Contrato (`contract_services`)

Cada contrato pode ter N serviços itemizados:

| Campo | Descrição |
|---|---|
| `name` | Nome do serviço |
| `description` | Detalhamento |
| `service_id` | FK para catálogo de serviços (`services`) |
| `quantity` | Quantidade (default: 1) |
| `unit_value` | Valor unitário |
| `value` | Valor total (quantity × unit_value) |
| `multiplier_override` | Multiplicador opcional |

**Regra:** A soma de `value` dos serviços deve coincidir com `monthly_value` do contrato. Alterações nos serviços são rastreadas em `contract_service_history`.

### 2.5 Fluxo de Faturamento Automático

Detalhado na [Seção 21.1](#211-fluxo-do-faturamento-mensal).

### 2.6 Regras de Reajuste Anual

O sistema suporta reajuste automático e semiautomático de contratos baseado em índices econômicos.

#### Índices Suportados
- **IGPM** (Índice Geral de Preços — Mercado)
- **IPCA** (Índice Nacional de Preços ao Consumidor Amplo)
- **INPC** (Índice Nacional de Preços ao Consumidor)
- **FIXO** (Percentual fixo definido no contrato)

#### Fluxo de Verificação (CRON diário às 10h — `check-contract-adjustments`)

1. Busca contratos com `status = 'active'` e `adjustment_date = TODAY`
2. **Se `adjustment_index = 'FIXO'` e `adjustment_percentage` definido:**
   - Aplica automaticamente via Edge Function `apply-contract-adjustment`
   - Calcula `new_value = monthly_value × (1 + adjustment_percentage / 100)`
   - Atualiza `contract_services` proporcionalmente
   - Registra em `contract_adjustments` e `contract_history`
   - Define `adjustment_date` para 1 ano à frente
   - Notifica staff (admin/financial)
3. **Se índice econômico (IGPM, IPCA, INPC):**
   - NÃO aplica automaticamente
   - Cria notificação tipo `warning` para staff (admin/financial)
   - Aguarda aplicação manual com valor do índice atualizado
   - Os índices são atualizados via Edge Function `fetch-economic-indices` (dados do Banco Central)

#### Edge Function `apply-contract-adjustment`

**Entrada:** `{ contract_id, index_value, index_used?, notes? }`

**Processamento:**
1. Busca contrato atual com valor mensal
2. Calcula novo valor: `monthly_value × (1 + index_value / 100)`
3. Registra em `contract_adjustments`: data, índice, valor anterior, valor novo
4. Atualiza `contracts.monthly_value` e `contracts.adjustment_date` (+1 ano)
5. Atualiza proporcionalmente cada `contract_services.unit_value` e `contract_services.value`
6. Registra em `contract_history` (action: `adjustment`)
7. Notifica staff via `notifications`

#### Índices Econômicos (`economic_indices`)
- Tabela com valores mensais de IGPM, IPCA, INPC
- Campos: `index_type`, `reference_date`, `value`, `accumulated_12m`
- Atualizada via CRON `fetch-economic-indices` com dados do BCB (Banco Central do Brasil)
- Widget visual na tela de Faturamento (`EconomicIndicesWidget`)

### 2.7 Geração de Cobrança Inicial (Bootstrap)

Ao criar um novo contrato com a opção "Geração de Cobrança Inicial" habilitada, o sistema executa automaticamente:

1. Criação da primeira fatura (calculando vencimento pelo `billing_day` e mês corrente)
2. Registro da cobrança no provedor (Asaas ou Banco Inter)
3. Emissão da NFS-e (se `nfse_enabled = true`)
4. Disparo da notificação por e-mail

Tudo em um único fluxo de execução após o salvamento do contrato.

---

## 3. Módulo Financeiro

### 3.1 Estrutura de Faturas

**Tabela:** `invoices`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `invoice_number` | SERIAL | Número sequencial automático |
| `client_id` | UUID (FK) | Cliente |
| `contract_id` | UUID (FK, nullable) | Contrato vinculado |
| `amount` | NUMERIC | Valor total |
| `due_date` | DATE | Data de vencimento |
| `status` | TEXT (`pending`, `paid`, `overdue`, `cancelled`, `voided`) | Status |
| `paid_date` | TIMESTAMP | Data de pagamento |
| `reference_month` | TEXT (`YYYY-MM`) | Competência |
| `payment_method` | TEXT (`boleto`, `pix`) | Método de pagamento |
| `billing_provider` | TEXT | Provedor usado |
| `boleto_barcode` | TEXT | Linha digitável |
| `boleto_url` | TEXT | URL do PDF do boleto |
| `boleto_status` | TEXT (`pendente`, `processando`, `gerado`, `enviado`, `erro`) | Status do boleto |
| `boleto_error_msg` | TEXT | Mensagem de erro do boleto |
| `pix_code` | TEXT | Código PIX Copia e Cola |
| `auto_payment_generated` | BOOLEAN | Se cobrança foi gerada automaticamente |
| `nfse_status` | TEXT (`processando`, `autorizada`, `erro`) | Status da NFS-e vinculada |
| `nfse_error_msg` | TEXT | Erro da NFS-e |
| `email_status` | TEXT (`enviado`, `erro`) | Status do envio de email |
| `email_sent_at` | TIMESTAMP | Data/hora do envio |
| `email_error_msg` | TEXT | Erro no envio de email |
| `notes` | TEXT | Observações (inclui `codigoSolicitacao` do Banco Inter) |

### 3.2 Geração de Cobranças

A geração de cobranças ocorre em dois cenários:

#### A) Automática (CRON `generate-monthly-invoices` — diário às 11h)

Processamento sequencial de todos os contratos ativos com `monthly_value > 0`:

1. **Validação de unicidade:** Verifica se já existe fatura para `(contract_id, reference_month)` com status diferente de `cancelled` ou `voided`. Se existir, pula (status: `skipped`).
2. **Cálculo do vencimento:** `billing_day` limitado ao último dia do mês. Ex: dia 31 em fevereiro → dia 28/29.
3. **Cobranças adicionais:** Busca `contract_additional_charges` com `reference_month` correspondente e `applied = false`. Soma ao `monthly_value`.
4. **Criação da fatura:** Insere em `invoices` com `payment_method` da preferência do contrato (fallback: `boleto`).
5. **Itemização:** Cria `invoice_items` a partir de `contract_services` (nome, quantidade, valor unitário, valor total).
6. **Marcação de adicionais:** Atualiza `contract_additional_charges.applied = true` e vincula `applied_invoice_id`.
7. **Log de geração:** Registra em `invoice_generation_log` (status: `success` ou `error`).
8. **Geração de pagamento:** Se o provedor (Banco Inter ou Asaas) estiver ativo, invoca a Edge Function correspondente para gerar boleto/PIX. Atualiza `boleto_status`.
9. **Emissão NFS-e:** Se `nfse_enabled = true`, invoca `asaas-nfse` com action `emit`. Atualiza `nfse_status`.
10. **Notificação email:** Envia email ao cliente via `send-email-smtp` com template customizável.
11. **Notificação staff:** Cria registros em `notifications` para usuários com role `admin` ou `financial`.

#### B) Manual (via interface — "Emitir Completo")

O hook `useInvoiceActions.handleEmitComplete` executa sequencialmente:

1. Gera boleto (se `boleto_url` não existe)
2. Gera PIX (se `pix_code` não existe)
3. Emite NFS-e (se contrato vinculado e NFS-e não autorizada/processando)
4. Envia notificações por email e WhatsApp

### 3.3 Regras de Negócio

1. **Unicidade:** Não pode existir mais de uma fatura ativa por contrato/competência. Faturas `cancelled` e `voided` são excluídas da verificação.
2. **Transições de status:** Controladas via trigger no banco de dados:
   - `pending` → `paid`, `overdue`, `cancelled`, `voided`
   - `overdue` → `paid`, `cancelled`, `voided`
   - `paid` → (imutável)
   - `cancelled` → (imutável)
   - `voided` → (imutável)
3. **Idempotência de webhooks:** A tabela `webhook_events` armazena eventos processados para evitar duplicação.
4. **Cálculo de multas e juros:** Edge Function `calculate-invoice-penalties` calcula penalidades para faturas vencidas.
5. **Fatura com adicionais:** O campo `notes` detalha cada cobrança adicional incluída.

### 3.4 Contas a Receber

**Tabela:** `financial_entries`

Lançamentos financeiros manuais ou automáticos:
- `type`: `income` ou `expense`
- Vinculáveis a `client_id`, `invoice_id`, `cost_center_id`
- `is_reconciled`: Flag de conciliação bancária
- `category`: Categoria livre (ex: "Serviços de TI", "Suporte")

### 3.5 Conciliação Bancária

**Tabela:** `bank_reconciliation`

| Campo | Descrição |
|---|---|
| `bank_date` | Data da transação bancária |
| `bank_amount` | Valor |
| `bank_description` | Descrição do extrato |
| `bank_reference` | Referência bancária |
| `invoice_id` | FK para fatura vinculada |
| `financial_entry_id` | FK para lançamento financeiro |
| `status` | `pending`, `matched`, `unmatched` |
| `matched_at` | Timestamp da conciliação |
| `matched_by` | Usuário que conciliou |

### 3.6 Baixa Automática via Retorno Bancário

#### Banco Inter — Webhook (`webhook-banco-inter`)
- Recebe eventos de pagamento via webhook configurado no portal Inter
- Valida assinatura HMAC-SHA256
- Identifica a fatura pelo `seuNumero` (invoice_number) ou `codigoSolicitacao`
- Atualiza `invoices.status = 'paid'` e `paid_date`
- Cria lançamento financeiro em `financial_entries`
- Suporta faturas com status `pending` e `overdue`
- Registra evento em `webhook_events` para idempotência

#### Asaas — Webhook (`webhook-asaas-nfse`)
- Recebe eventos de cobrança do Asaas
- Eventos tratados: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`
- Atualiza status da fatura correspondente
- Processa faturas `overdue` para permitir baixas de pagamentos atrasados

#### Polling Fallback (`poll-boleto-status`)
- Executa a cada 6 horas via CRON
- Processa apenas registros com mais de **1 hora** de criação (webhooks devem resolver os recentes)
- Busca até 20 faturas com `payment_method = 'boleto'`, `boleto_barcode IS NULL`, `status = 'pending'`
- Para cada fatura, extrai `codigoSolicitacao` das `notes` e consulta a API Inter
- Se obtiver `linhaDigitavel`, atualiza a fatura e envia notificações
- Se `situacao = CANCELADO/EXPIRADO`, limpa dados do boleto

### 3.7 Relatório de Inadimplência (Aging Report)

**Widget:** `AgingReportWidget`

Categoriza faturas vencidas por faixas:
- 1-30 dias
- 31-60 dias
- 61-90 dias
- 90+ dias

**Página dedicada:** `DelinquencyReportPage` com detalhamento por cliente.

---

## 4. Emissão de Nota Fiscal (NFS-e)

### 4.1 Padrão Adotado

**NFS-e Nacional 2026 (DPS v1.0)** — Conformidade com o Ambiente de Dados Nacional (ADN).

### 4.2 Provedor de Integração

**Asaas** — Intermediário exclusivo para comunicação com o ADN. O sistema NÃO se comunica diretamente com prefeituras.

### 4.3 Estrutura de Dados

**Tabela:** `nfse_history`

| Campo | Descrição |
|---|---|
| `id` | UUID, PK |
| `client_id` | FK → clients |
| `invoice_id` | FK → invoices (nullable — avulsas não têm fatura) |
| `contract_id` | FK → contracts (nullable) |
| `competencia` | DATE (YYYY-MM-DD, normalizado) |
| `valor_servico` | NUMERIC |
| `descricao_servico` | TEXT |
| `provider` | TEXT (`asaas`) |
| `status` | TEXT (`processando`, `autorizada`, `erro`, `cancelada`) |
| `ambiente` | TEXT (`producao`, `homologacao`) |
| `asaas_invoice_id` | TEXT — ID no Asaas |
| `asaas_status` | TEXT — Status bruto do Asaas |
| `numero_nfse` | TEXT — Número da nota fiscal |
| `codigo_verificacao` | TEXT |
| `data_autorizacao` | TIMESTAMP |
| `aliquota` | NUMERIC (0-5%) |
| `iss_retido` | BOOLEAN |
| `valor_iss_retido` | NUMERIC |
| `valor_pis` | NUMERIC |
| `valor_cofins` | NUMERIC |
| `valor_csll` | NUMERIC |
| `valor_irrf` | NUMERIC |
| `valor_inss` | NUMERIC |
| `valor_liquido` | NUMERIC |
| `pdf_url` | TEXT — Caminho no Storage |
| `xml_url` | TEXT — Caminho no Storage |
| `mensagem_retorno` | TEXT — Retorno da prefeitura |
| `codigo_retorno` | TEXT — Código do erro |
| `motivo_cancelamento` | TEXT |
| `data_cancelamento` | TIMESTAMP |

### 4.4 Edge Function `asaas-nfse` — Ações

#### `emit` — Emissão vinculada a contrato
1. **Validação de reemissão:** Se `nfse_history_id` fornecido, verifica status no Asaas. Se `AUTHORIZED`, atualiza local e retorna. Se `ERROR` com código `E0014` (DPS duplicada), bloqueia reemissão.
2. **Sincronização de cliente:** `ensureCustomerSync()` — cria ou atualiza o cliente no Asaas com dados completos (nome, email, endereço, CEP — todos obrigatórios).
3. **Resolução do serviço municipal:** Busca `municipalServiceId` no Asaas a partir do `service_code` do contrato. Se não fornecido, **rejeita** com erro `MISSING_MUNICIPAL_SERVICE_CODE` (sem fallback genérico).
4. **Criação do registro local:** Insere em `nfse_history` com status `processando`.
5. **Chamada API Asaas:** `POST /invoices` com payload incluindo retenções (PIS, COFINS, CSLL, IRRF, INSS, ISS).
6. **Atualização:** Salva `asaas_invoice_id`, `asaas_status` e `numero_nfse` (se imediato).
7. **Log de eventos:** Registra em `nfse_event_logs` para rastreabilidade completa.

#### `emit_standalone` — NFS-e Avulsa
- Mesma lógica de `emit`, mas sem vínculo obrigatório com contrato
- Detalhado na [Seção 8](#8-notas-fiscais-avulsas)

#### `cancel` — Cancelamento
- Requer justificativa de **15 a 500 caracteres**
- **Idempotência:** Verifica em `nfse_cancellation_log` se já existe cancelamento com status `CANCELLED` para o mesmo `nfse_history_id`
- Cria registro de auditoria com status `REQUESTED` antes da chamada à API
- Chama `DELETE /invoices/{id}` no Asaas
- Atualiza status do log para `CANCELLED` ou `FAILED`
- Atualiza `nfse_history.status = 'cancelada'`
- Registra evento em `nfse_event_logs`

#### `check_single_status` — Verificação Individual
- Consulta `GET /invoices/{id}` no Asaas
- Mapeia status: `AUTHORIZED` → `autorizada`, `ERROR` → `erro`, `SCHEDULED/SYNCHRONIZED/AUTHORIZATION_PENDING` → `processando`
- Se `AUTHORIZED`: baixa PDF e XML para Supabase Storage (`nfse-files/{client_id}/{history_id}/`)
- Se `ERROR`: captura `statusDescription` da prefeitura com parsing de códigos conhecidos (E0014, E0001, E0002)

#### `link_external` — Vincular Nota Externa
- Para notas já emitidas diretamente no Portal Nacional
- Atualiza registro local com número da NFS-e e status `autorizada`

#### `get_status` — Consulta Simples
- Retorna dados brutos da API Asaas para um `invoice_id`

#### `create_customer` — Criação de Cliente no Asaas
- Sincroniza dados do cliente local com o Asaas

#### `create_payment` — Criação de Cobrança
- Gera boleto ou PIX via API Asaas
- Atualiza fatura com dados de pagamento

### 4.5 Regras de Retorno (PDF + XML)

- **PDF:** Baixado automaticamente quando status muda para `AUTHORIZED`. Armazenado em `nfse-files/{client_id}/{history_id}/nfse.pdf`.
- **XML:** Mesmo fluxo, armazenado como `nfse.xml`.
- Se download falhar, registra warning no log mas não bloqueia o processo.
- Arquivos acessíveis via Supabase Storage com políticas de acesso por role.

### 4.6 Tratamento de Falhas

| Código | Descrição | Ação do Sistema |
|---|---|---|
| `E0014` | DPS Duplicada — Nota já existe no Portal Nacional | Bloqueia reemissão, sugere "Vincular Nota Existente" |
| `E0001` | Certificado digital inválido | Orienta verificação do certificado |
| `E0002` | Dados incompletos do prestador/tomador | Orienta atualização do cadastro |
| `MISSING_MUNICIPAL_SERVICE_CODE` | Código de serviço não configurado no contrato | Rejeita emissão, orienta configuração |
| `CLIENT_INCOMPLETE_DATA` | E-mail, endereço ou CEP faltando no cliente | Lista campos faltantes |
| `ASAAS_NOT_CONFIGURED` | Integração Asaas desativada | Orienta ativação em Configurações |

Em todos os casos de erro:
1. O status do `nfse_history` é atualizado para `erro`
2. A `mensagem_retorno` e `codigo_retorno` são populados
3. Um evento é registrado em `nfse_event_logs`
4. O erro é retornado ao frontend com `correlation_id` para rastreamento

### 4.7 Série e Numeração

- **Série padrão:** `1` (para manter consistência com emissões anteriores no Portal Nacional)
- **Numeração:** Controlada pelo Asaas/ADN (não pelo sistema local)

### 4.8 Tributação

Configuração disponível por emissão:
- **ISS:** Alíquota editável (0% a 5%), ISS retido (sim/não)
- **Retenções federais:** PIS, COFINS, CSLL, IRRF, INSS (valores absolutos)
- **Valor líquido:** Calculado automaticamente: `valor_servico - retenções`
- **Regime tributário:** Configurável em `company_settings` (Simples Nacional, Lucro Presumido, etc.)
- **Optante Simples:** Flag em `company_settings.nfse_optante_simples`

### 4.9 Polling de Status NFS-e (`poll-asaas-nfse-status`)

- CRON periódico que busca registros com status `processando` e `asaas_invoice_id` preenchido
- Consulta API Asaas para cada registro
- Atualiza status local e baixa PDF/XML quando autorizado

---

## 5. Emissão de Boleto / Link de Pagamento

### 5.1 Provedores Suportados

| Provedor | Boleto | PIX | mTLS | Webhook |
|---|---|---|---|---|
| **Banco Inter** | ✅ API v3 | ✅ | ✅ (certificados .crt/.key) | ✅ |
| **Asaas** | ✅ | ✅ | ❌ (API Key) | ✅ |

A escolha do provedor é feita no contrato (`billing_provider`) ou individualmente na fatura.

### 5.2 Banco Inter — Fluxo Completo

#### Configuração (`integration_settings.banco_inter`)
```json
{
  "client_id": "...",
  "client_secret": "...",
  "pix_key": "...",
  "certificate_crt": "base64...",
  "certificate_key": "base64...",
  "environment": "production"
}
```

#### Autenticação OAuth 2.0 com mTLS
1. Cria `Deno.HttpClient` com certificados mTLS (CRT + KEY em base64)
2. Solicita token via `POST /oauth/v2/token` com escopo específico:
   - **Criação boleto:** `boleto-cobranca.write`
   - **Consulta boleto:** `boleto-cobranca.read`
   - **Criação PIX:** `cob.write`
   - **Consulta PIX:** `cob.read`
3. **Fallback:** Se escopo individual falhar, tenta combinado (ex: `boleto-cobranca.read boleto-cobranca.write`)

#### Geração de Boleto
1. Monta payload com dados do pagador (CPF/CNPJ, endereço), valor e vencimento
2. `POST /cobranca/v3/cobrancas` — Retorna `codigoSolicitacao` (processamento assíncrono)
3. **Polling imediato (até 30s):**
   - Obtém token de LEITURA (`boleto-cobranca.read`) — separado do token de escrita
   - Loop de 6 tentativas × 5 segundos
   - `GET /cobranca/v3/cobrancas/{codigoSolicitacao}` com `readToken`
   - Se obtiver `codigoBarras` + `linhaDigitavel` → atualiza fatura com dados completos
4. **Se timeout no polling:**
   - Salva `codigoSolicitacao` nas `notes` da fatura
   - Define `boleto_status = 'pendente'`
   - Confia no `poll-boleto-status` (fallback a cada 6h) para completar

#### Geração de PIX
1. `POST /pix/v2/cob` com chave PIX, valor e expiração (3 dias)
2. Retorno síncrono com `pixCopiaECola`
3. Atualiza `invoices.pix_code`

#### Cancelamento de Boleto
1. Busca `codigoSolicitacao` nas `notes` da fatura ou consulta por `seuNumero`
2. `POST /cobranca/v3/cobrancas/{id}/cancelar` com motivo
3. Limpa `boleto_barcode` e `boleto_url` da fatura

#### Teste de Conexão
- Testa cada escopo individualmente (read/write para boleto e PIX)
- Retorna lista de escopos disponíveis e erros específicos

### 5.3 Asaas — Fluxo

1. Criação de cobrança via `POST /payments` (dentro de `asaas-nfse` action `create_payment`)
2. `billing_type`: `BOLETO` ou `PIX`
3. Retorno inclui URL do boleto e código PIX
4. Webhooks para baixa automática

### 5.4 Regras de Armazenamento Obrigatório

Após a geração bem-sucedida, os seguintes campos **devem** ser preenchidos na fatura:

| Tipo | Campos obrigatórios |
|---|---|
| Boleto | `boleto_barcode` (linha digitável), `boleto_url` (PDF), `payment_method = 'boleto'`, `boleto_status = 'enviado'` |
| PIX | `pix_code` (copia e cola), `payment_method = 'pix'` |

Se os dados não forem obtidos no polling imediato:
- `boleto_status = 'pendente'`
- `notes` contém `codigoSolicitacao:{uuid}` para rastreamento

---

## 6. Envio Automático ao Cliente

### 6.1 Canais de Comunicação

| Canal | Integração | Configuração |
|---|---|---|
| **E-mail** | SMTP próprio (Edge Function `send-email-smtp`) | `integration_settings.smtp` |
| **WhatsApp** | Evolution API (Edge Function `send-whatsapp`) | `integration_settings.evolution_api` |
| **Push** | Web Push via Service Worker | `push_subscriptions` |
| **Notificações internas** | Tabela `notifications` + Realtime | Automático |
| **Telegram** | Bot API (Edge Function `send-telegram`) | `integration_settings.telegram` |

### 6.2 E-mail — Detalhamento

#### Edge Function `send-email-smtp`
- Implementação SMTP nativa em Deno (sem bibliotecas externas)
- Suporta STARTTLS e TLS implícito (porta 465)
- Autenticação `AUTH LOGIN`
- Formato multipart/alternative (text + HTML)
- **Rate limiting:** 10 requisições/segundo por IP
- **Sanitização:** Remove scripts, event handlers, iframes do HTML
- **Validação:** Regex de email, limite de 50 destinatários, subject ≤ 200 chars, HTML ≤ 50KB
- **Logging:** Registra em `message_logs` (sucesso e falha)

#### Templates de E-mail
- Tabela `email_templates` com tipos: `invoice_payment`, `invoice_reminder`, `ticket_notification`, etc.
- Sistema de variáveis: `{{client_name}}`, `{{invoice_number}}`, `{{amount}}`, `{{due_date}}`, etc.
- Condicionais: `{{#boleto_url}}...{{/boleto_url}}`
- Layout wrapper com logo, cores e footer configuráveis via `email_settings`
- Fallback para template padrão se nenhum template ativo encontrado

### 6.3 WhatsApp — Detalhamento

#### Edge Function `send-whatsapp`
- Integra com **Evolution API** (instância auto-hospedada)
- Endpoint: `POST /message/sendText/{instance_name}`
- **Rate limiting:** 10 requisições/segundo por IP
- **Timeout:** 5 segundos
- **Validação:** Número de 10-15 dígitos (apenas números), mensagem ≤ 4096 chars
- **Logging:** Registra em `message_logs` com `external_message_id`
- **Webhooks de status:** `webhook-whatsapp-status` recebe confirmações de entrega

### 6.4 Regras de Envio

#### Na geração automática de faturas (`generate-monthly-invoices`):
1. Email é enviado se SMTP ativo e `clients.financial_email` ou `clients.email` disponível
2. Template personalizado via `contracts.notification_message` (variáveis: `{cliente}`, `{valor}`, `{vencimento}`, `{fatura}`, `{competencia}`)
3. Atualiza `invoices.email_status` e `invoices.email_sent_at`

#### No reenvio manual (`resend-payment-notification`):
1. Aceita array de canais: `["email", "whatsapp"]`
2. Verifica se fatura tem boleto/PIX gerado OU está em processamento
3. Monta mensagem com dados de pagamento (boleto + PIX se disponíveis)
4. Retorna resultados por canal com códigos de erro específicos

#### Lembretes de vencimento (`notify-due-invoices` — CRON diário às 12h):
1. Busca faturas `pending` com vencimento nos próximos N dias (default: 3)
2. **Deduplicação:** Verifica `invoice_notification_logs` para evitar reenvio
3. Envia por email e WhatsApp simultaneamente
4. Cria notificações para staff (admin, financial, manager)
5. Registra em `invoice_notification_logs` com `notification_type = 'payment_reminder'`

### 6.5 Tratamento de Falhas

| Código de Erro | Canal | Descrição |
|---|---|---|
| `WHATSAPP_INTEGRATION_DISABLED` | WhatsApp | Integração desativada |
| `WHATSAPP_NOT_CONFIGURED` | WhatsApp | Configuração incompleta |
| `CLIENT_NO_WHATSAPP` | WhatsApp | Cliente sem número cadastrado |
| `WHATSAPP_SEND_ERROR` | WhatsApp | Falha na API Evolution |
| (sem email) | Email | Cliente sem email cadastrado |
| SMTP error | Email | Erro de conexão, autenticação ou rejeição do servidor |

**Comportamento:** Falha em um canal não impede envio no outro. O resultado retorna `success: true` se ao menos um canal teve sucesso.

---

## 7. Serviços Adicionais Pontuais

### 7.1 Estrutura de Dados

**Tabela:** `contract_additional_charges`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID | PK |
| `contract_id` | UUID (FK) | Contrato vinculado |
| `description` | TEXT | Descrição do serviço adicional |
| `amount` | NUMERIC | Valor da cobrança |
| `reference_month` | TEXT (`YYYY-MM`) | Mês de competência |
| `applied` | BOOLEAN | Se já foi incluído em fatura (default: false) |
| `applied_invoice_id` | UUID (FK, nullable) | Fatura onde foi incluído |
| `created_by` | UUID | Usuário que cadastrou |

### 7.2 Como São Cadastrados

1. Via interface (`ContractAdditionalChargeDialog`) pelo usuário com role admin, manager ou financial
2. Campos obrigatórios: descrição, valor, mês de competência
3. O contrato deve estar ativo

### 7.3 Como Entram no Faturamento

1. Na geração de faturas (automática ou manual), o sistema busca `contract_additional_charges` com:
   - `contract_id` correspondente
   - `reference_month` correspondente
   - `applied = false`
2. O valor total dos adicionais é **somado** ao `monthly_value` do contrato
3. Cada adicional é detalhado nas `notes` da fatura
4. Após a inclusão:
   - `applied = true`
   - `applied_invoice_id = {fatura_id}`

### 7.4 Regras e Exceções

- Adicionais já aplicados (`applied = true`) nunca são incluídos novamente
- Se o contrato for cancelado antes da fatura ser gerada, o adicional permanece com `applied = false` (pode ser excluído manualmente)
- Adicionais não geram fatura sozinhos — sempre são agregados à fatura mensal do contrato
- A itemização dos adicionais aparece nos `invoice_items` junto com os serviços regulares

---

## 8. Notas Fiscais Avulsas

### 8.1 Quando Usar

- Serviços pontuais não vinculados a contrato recorrente
- Consultoria ou projetos one-shot
- Correção/complemento de notas anteriores
- Qualquer serviço que necessite documento fiscal sem vínculo contratual

### 8.2 Fluxo Completo

**Interface:** `NfseAvulsaDialog`

1. **Seleção do cliente:** Combobox com busca por nome
2. **Dados do serviço:**
   - Descrição do serviço (obrigatória)
   - Valor (obrigatório, > 0)
   - Código de serviço LC 116 (`NfseServiceCodeCombobox`)
   - CNAE (opcional)
   - Data de competência (seleção via Calendar)
3. **Tributação (`NfseTributacaoSection`):**
   - Alíquota ISS (0-5%)
   - ISS retido (checkbox)
   - Retenções federais: PIS, COFINS, CSLL, IRRF, INSS
   - Valor líquido calculado automaticamente
4. **Cobrança opcional:**
   - Toggle "Gerar cobrança"
   - Se ativo: cria fatura vinculada com boleto/PIX
5. **Emissão:**
   - Chama `asaas-nfse` com action `emit_standalone`
   - Cria registro em `nfse_history` com status `processando`
   - Retorna `history_id` e `correlation_id`

### 8.3 Regras de Cobrança Opcional

Quando "Gerar cobrança" está ativo:
1. Uma fatura é criada em `invoices` com `contract_id = null` e `invoice_id` vinculado ao `nfse_history`
2. A cobrança (boleto/PIX) é gerada no provedor configurado
3. A fatura pode ser processada normalmente (notificações, baixa automática)
4. Se desativado: apenas a NFS-e é emitida, sem registro financeiro

### 8.4 Validações Específicas

- O cliente DEVE ter e-mail, endereço e CEP válidos (exigência do Asaas para emissão)
- O código de serviço municipal é obrigatório (sem fallback genérico)
- Retenções não podem exceder o valor do serviço
- Valor líquido deve ser > 0

---

## 9. Módulo de Clientes

### 9.1 Estrutura de Dados

**Tabela:** `clients`

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `name` | TEXT | ✅ | Razão social ou nome |
| `trade_name` | TEXT | ❌ | Nome fantasia |
| `document` | TEXT | ❌ | CPF ou CNPJ |
| `email` | TEXT | ❌ | Email principal |
| `financial_email` | TEXT | ❌ | Email financeiro (prioridade para cobranças) |
| `phone` | TEXT | ❌ | Telefone fixo |
| `whatsapp` | TEXT | ❌ | WhatsApp (para notificações) |
| `address` | TEXT | ❌ | Endereço completo |
| `city` | TEXT | ❌ | Cidade |
| `state` | TEXT | ❌ | UF |
| `zip_code` | TEXT | ❌ | CEP |
| `state_registration` | TEXT | ❌ | Inscrição estadual |
| `documentation` | TEXT | ❌ | Campo livre para documentação técnica |
| `notes` | TEXT | ❌ | Observações internas |
| `is_active` | BOOLEAN | ✅ | Ativo/inativo (default: true) |
| `asaas_customer_id` | TEXT | ❌ | ID no Asaas (sincronizado automaticamente) |
| `whatsapp_validated` | BOOLEAN | ❌ | Se o WhatsApp foi validado |
| `whatsapp_validated_at` | TIMESTAMP | ❌ | Data da validação |

### 9.2 Dados Obrigatórios

- **Para cadastro:** Apenas `name`
- **Para emissão de NFS-e:** `name`, `email` (ou `financial_email`), `address`, `zip_code` (8 dígitos)
- **Para envio de cobrança por email:** `email` ou `financial_email`
- **Para envio por WhatsApp:** `whatsapp`

### 9.3 Regras de Validação

1. **CNPJ/CPF:** Validado via `validateCNPJ()` e `validateCPF()` em `src/lib/security.ts`
2. **Email:** Validado por regex
3. **CEP:** 8 dígitos numéricos
4. **WhatsApp:** 10-15 dígitos. Validação opcional via Edge Function `validate-whatsapp`
5. **CNPJ Lookup:** Edge Function `cnpj-lookup` busca dados da Receita Federal automaticamente

### 9.4 Contatos do Cliente (`client_contacts`)

Cada cliente pode ter N contatos:
- `name`, `email`, `phone`, `whatsapp`, `role`
- `is_primary`: Contato principal
- `is_active`: Ativo/inativo
- `user_id`: Vínculo com usuário do portal (se aplicável)
- `notify_whatsapp`: Se recebe notificações por WhatsApp
- `username`: Login para portal do cliente

### 9.5 Técnicos Responsáveis (`client_technicians`)

- Vinculação de técnicos específicos a clientes
- Campos: `client_id`, `user_id`, `notes`, `assigned_by`
- Usado para roteamento de chamados

### 9.6 Mapeamentos Externos (`client_external_mappings`)

Vinculação com sistemas externos:
- `external_source`: `checkmk`, `tactical_rmm`, etc.
- `external_id`: ID no sistema externo
- `external_name`: Nome no sistema externo
- Permite sincronização de dispositivos e alertas

### 9.7 Acesso Granular por Role

| Role | Acesso |
|---|---|
| admin, financial | Acesso total a todos os campos |
| technician | Apenas VIEW `clients_contact_only` (oculta CPF/CNPJ, IDs externos, email financeiro) |
| client, client_master | Apenas próprio registro (via `client_contacts.user_id = auth.uid()`) |

**Trigger de proteção:** Clientes não podem editar `document`, `asaas_customer_id` e outros campos sensíveis.

### 9.8 Histórico do Cliente (`client_history`)

Registra alterações no cadastro com `action`, `changes` (JSON diff), `comment` e `user_id`.

---

## 10. Módulo de Usuários e Permissões

### 10.1 Perfis (Roles)

| Role | Label | Descrição |
|---|---|---|
| `admin` | Administrador | Acesso total ao sistema |
| `manager` | Gerente | Gestão de equipe e operações |
| `technician` | Técnico | Atendimento e suporte técnico |
| `financial` | Financeiro | Gestão financeira e faturamento |
| `client` | Cliente | Portal do cliente — apenas próprios chamados |
| `client_master` | Cliente Master | Portal do cliente — visão consolidada com aba financeira |

### 10.2 Matriz de Permissões (Padrão)

| Módulo | admin | manager | technician | financial | client | client_master |
|---|---|---|---|---|---|---|
| Dashboard (view) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tickets (view/create) | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Tickets (edit) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Tickets (delete/manage) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Clients (view) | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Clients (create/edit) | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Contracts (view) | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Contracts (create/edit) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Financial (view) | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Financial (manage) | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Monitoring | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Inventory | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Calendar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reports | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Knowledge | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| Settings | ✅ | ✅(view) | ❌ | ❌ | ❌ | ❌ |
| Users | ✅ | ✅(view) | ❌ | ❌ | ❌ | ❌ |

### 10.3 Sistema de Overrides

**Tabela:** `role_permission_overrides`

Permite sobrescrever permissões padrão por role+módulo+ação:
- Gerenciado via Settings > Regras de Permissões (`RolePermissionsTab`)
- Override `true` concede permissão não padrão
- Override `false` remove permissão padrão
- Lógica: Se qualquer role do usuário tem override `true`, permite. Se todas têm `false`, bloqueia.

### 10.4 Camadas de Segurança

1. **Frontend — `PermissionGate`:** Componente React que oculta/mostra UI baseado em permissões. **Apenas UX — nunca segurança.**
2. **Frontend — `usePermissions`:** Hook que verifica permissões com suporte a overrides.
3. **Frontend — `useSecureAction`:** Hook que valida permissões antes de executar mutations.
4. **Backend — RLS:** Todas as tabelas têm Row-Level Security com funções `has_role()`, `is_staff()`, `is_financial_admin()`, `is_technician_only()`, `client_owns_record()`.
5. **Edge Functions:** Validam Authorization header e roles antes de processar.

### 10.5 Criação de Usuários

- **Staff:** Edge Function `create-user` (admin only) — cria usuário no Auth + atribui roles
- **Clientes:** Edge Function `create-client-user` — cria usuário vinculado a `client_contacts`
- **Self-register:** Via página `/register` (se habilitado)
- **Setup inicial:** Edge Function `bootstrap-admin` para primeiro administrador

---

## 11. Módulo de Chamados (Tickets)

### 11.1 Estrutura Principal

**Tabela:** `tickets`

Campos principais: `id`, `ticket_number` (serial), `title`, `description`, `status` (open, in_progress, paused, resolved, closed), `priority` (low, medium, high, critical, urgent), `category_id`, `subcategory_id`, `client_id`, `requester_contact_id`, `assigned_to`, `department_id`, `created_by`, `resolved_at`, `closed_at`, `first_response_at`, `resolution_notes`, `sla_config_id`.

### 11.2 Fluxo de Vida do Chamado

1. **Abertura:** Por staff ou pelo portal do cliente
2. **Triagem:** Atribuição de técnico, prioridade e categoria
3. **Atendimento:** Registro de comentários, time tracking
4. **Pausa:** Com motivo obrigatório (`TicketPauseDialog`) — congela SLA
5. **Resolução:** Com notas obrigatórias (`TicketResolveDialog`)
6. **Fechamento:** Manual ou automático após período configurado
7. **Avaliação:** Cliente pode avaliar o atendimento (`TicketRatingDialog`)

### 11.3 SLA (Service Level Agreement)

**Cálculo:** `src/lib/sla-calculator.ts`

- **SLA de Resposta:** Tempo até o primeiro comentário do técnico
- **SLA de Resolução:** Tempo até a resolução
- **Horário comercial:** Considerado via `business_hours` em `company_settings`
  - Turnos configuráveis (ex: 08:30-11:45, 13:30-18:00)
  - Dias da semana habilitáveis (seg-sex padrão)
- **Pausas:** Tempo de pausa é descontado do SLA
- **Indicador visual (`SLAIndicator`):** Verde (>75%), amarelo (50-75%), laranja (25-50%), vermelho (<25%), "Expirado"

### 11.4 Funcionalidades Adicionais

- **Time tracking:** `ticket_time_entries` com timer em tempo real (`TicketTimeTracker`)
- **Comentários:** `ticket_comments` com suporte a privados (visíveis apenas para staff)
- **Histórico:** `ticket_history` com registro de todas as alterações
- **Tags:** Sistema de tags livre (`tags` + `ticket_tags`)
- **Ativos:** Vinculação de ativos do inventário ao chamado
- **Transferência:** Entre técnicos e departamentos (`TicketTransferDialog`)
- **No-contact check:** Verificação automática de chamados sem contato (`check-no-contact-tickets`)

---

## 12. Módulo de Monitoramento

### 12.1 Integrações

#### CheckMK (`checkmk-sync`)
- Sincroniza hosts e serviços via REST API
- Detecção automática de tipo de dispositivo (server, printer, switch, firewall, etc.)
- Mapeamento de estados: `0=UP`, `1=DOWN`, `2=UNREACHABLE`
- Alertas por nível: critical, warning, info
- Armazena em `monitored_devices`, `monitoring_alerts`
- Mapeamento de cliente via `client_external_mappings`

#### Tactical RMM (`tactical-rmm-sync`)
- Sincroniza agentes e métricas via API
- Importa: hardware info, CPU/RAM/disco, status de reboot
- Timeout de 15 segundos por requisição
- Mapeamento de cliente via `client_external_mappings`

### 12.2 Alertas e Escalação

- **Tabela:** `monitoring_alerts` com níveis critical, warning, info
- **Escalação automática:** `alert_escalation_settings` + Edge Function `escalate-alerts`
  - Configurável por cliente e tempo (default: 30 min)
  - Escala para role configurável (default: manager)
- **Notificações:** Email + Push + Notificação interna por regras em `client_notification_rules`
- **Agrupamento:** `GroupedAlertsTable` agrupa alertas por dispositivo/cliente

### 12.3 Uptime Charts

Componente `UptimeCharts` com visualização de disponibilidade histórica.

---

## 13. Módulo de Inventário

### 13.1 Ativos (`assets`)

| Campo | Descrição |
|---|---|
| `asset_type` | ENUM: computer, laptop, server, printer, switch, router, firewall, ups, camera, phone, tablet, other |
| `name` | Nome do ativo |
| `brand`, `model`, `serial_number` | Identificação |
| `client_id` | FK → clients |
| `status` | ENUM: active, maintenance, retired, disposed |
| `location` | Localização física |
| `purchase_date`, `purchase_value` | Dados de aquisição |
| `responsible_contact` | FK → client_contacts |

### 13.2 Licenças de Software

- Gerenciamento de licenças com chave, validade e quantidade
- VIEW `software_licenses_safe`: Mascara chaves de licença para não-admins
- Formulário: `LicenseForm`

### 13.3 Métricas de Dispositivos

- CPU, RAM, Disco via `DeviceDetailsPanel`
- Gauge visual: `MetricGauge`
- Dados provenientes de CheckMK ou Tactical RMM

---

## 14. Módulo de Agenda / Calendário

### 14.1 Implementação

- **Biblioteca:** FullCalendar React (views: month, week, day, list)
- **Componente:** `FullCalendarWrapper`

### 14.2 Tipos de Evento (`event_type`)

- `visit`: Visita técnica
- `meeting`: Reunião
- `maintenance`: Manutenção programada
- `deadline`: Prazo
- `reminder`: Lembrete
- `other`: Outros

### 14.3 Vinculações

- Eventos podem ser vinculados a: `client_id`, `ticket_id`, `invoice_id`
- Badges de vencimento de faturas no calendário (`InvoiceDueBadge`)

### 14.4 Google Calendar Sync

- Integração bidirecional via OAuth 2.0
- Tabela `google_calendar_integrations` com tokens de acesso
- Edge Function `google-calendar` para sincronização

---

## 15. Portal do Cliente

### 15.1 Níveis de Acesso

| Role | Funcionalidades |
|---|---|
| `client` | Abertura e consulta de **próprios** chamados apenas |
| `client_master` | Tudo acima + aba **Financeiro** (faturas, boletos, NFS-e da empresa) |

### 15.2 Isolamento de Dados

- RLS baseada em `client_contacts.user_id = auth.uid()` → determina `client_id`
- `client_owns_record()` função PL/pgSQL para verificação
- Chamados filtrados por `client_id` do contato logado

### 15.3 Aba Financeira (client_master)

- Listagem de faturas com status, vencimento e valor
- Download de boletos (PDF)
- Visualização de NFS-e autorizadas
- Código PIX Copia e Cola

---

## 16. Base de Conhecimento

### 16.1 Estrutura

- **Tabela:** `knowledge_articles`
- Campos: `title`, `content` (rich text), `category`, `tags`, `is_published`, `view_count`
- Criação por staff (admin, manager, technician)
- Visualização por todos (incluindo clientes)
- Componentes: `ArticleForm`, `ArticleViewer`

---

## 17. Gamificação

### 17.1 Estrutura

- **Tabela:** `badges` — Conquistas com ícone, critério e descrição
- **Tabela:** `gamification_goals` — Metas com período, valor alvo e recompensa em pontos
- **Página:** `GamificationPage` com ranking de técnicos
- Gerenciamento apenas por admins

---

## 18. TV Dashboard

### 18.1 Funcionalidade

- **Página:** `TVDashboardPage`
- Rotação automática de slides a cada **15 segundos**
- Métricas em tempo real: chamados abertos, SLA, alertas
- Otimizado para telas grandes (TV corporativa)

---

## 19. Relatórios

### 19.1 Tipos

- **Tempo por técnico:** `TimeReportTab` — horas trabalhadas por período
- **Fiscal:** `FiscalReportTab` — NFS-e emitidas com exportação
- **Inadimplência:** `DelinquencyReportPage` — aging report detalhado
- **BI geral:** `ReportsPage` com filtros por período, cliente e técnico

### 19.2 Exportação

- **Formatos:** CSV, PDF
- Componente reutilizável: `ExportButton`
- Utilitário: `src/lib/export.ts`

---

## 20. Auditoria e Logs

### 20.1 Tabelas de Auditoria

| Tabela | Propósito | Imutável |
|---|---|---|
| `audit_logs` | Alterações em registros (INSERT/UPDATE/DELETE por trigger) | ✅ (sem UPDATE/DELETE) |
| `application_logs` | Logs de execução de Edge Functions | ✅ (sem UPDATE/DELETE) |
| `nfse_event_logs` | Eventos detalhados de emissão/cancelamento NFS-e | ✅ |
| `nfse_cancellation_log` | Auditoria de cancelamentos NFS-e | ✅ |
| `invoice_notification_logs` | Registro de notificações enviadas | ✅ (sem UPDATE/DELETE) |
| `invoice_generation_log` | Log de geração de faturas (sucesso/erro) | ✅ (sem UPDATE/DELETE) |
| `contract_history` | Alterações em contratos | ✅ (sem UPDATE/DELETE) |
| `contract_service_history` | Alterações em serviços de contratos | ✅ (sem UPDATE/DELETE) |
| `client_history` | Alterações em cadastro de clientes | ✅ (sem UPDATE/DELETE) |
| `ticket_history` | Alterações em chamados | ✅ |
| `message_logs` | Log de mensagens enviadas (email, WhatsApp) | ❌ |
| `webhook_events` | Eventos de webhook processados (idempotência) | ✅ |

### 20.2 Eventos Obrigatórios

- Toda criação/edição/exclusão de contrato, fatura, cliente e chamado
- Toda emissão e cancelamento de NFS-e
- Todo envio de notificação (email, WhatsApp, push)
- Todo webhook processado
- Toda geração de cobrança (boleto/PIX)
- Todo reajuste de contrato
- Todo login/logout (via Supabase Auth)

### 20.3 Registros Imutáveis

As tabelas de auditoria com "✅ (sem UPDATE/DELETE)" têm RLS que bloqueia operações de UPDATE e DELETE:
```sql
-- Exemplo: audit_logs
-- Não há policy para UPDATE ou DELETE
-- Apenas INSERT (por admin/system) e SELECT (por admin)
```

### 20.4 Visualização

- **Interface:** `AuditLogsTab` em Configurações
- **Logs de aplicação:** `LogsViewerTab`
- **Métricas de mensagens:** `MessageMetricsDashboard`
- **Logs de mensagens:** `MessageLogsTab`

---

## 21. Fluxos Completos do Sistema

### 21.1 Fluxo do Faturamento Mensal

```
┌─────────────────────┐
│ CRON 11:00 diário   │
│ generate-monthly-   │
│ invoices             │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Buscar contratos    │
│ status=active       │
│ monthly_value > 0   │
└────────┬────────────┘
         │
    ┌────▼────┐
    │ Para    │
    │ cada    │◄──────────────────────┐
    │ contrato│                       │
    └────┬────┘                       │
         │                            │
         ▼                            │
┌─────────────────┐   Sim   ┌────────┴──────┐
│ Fatura existe   │────────►│ Skip (pular)  │
│ para este mês?  │         └───────────────┘
└────────┬────────┘
         │ Não
         ▼
┌─────────────────────┐
│ Calcular vencimento │
│ billing_day + mês   │
│ Somar adicionais    │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Criar fatura        │
│ + invoice_items     │
│ + marcar adicionais │
└────────┬────────────┘
         │
    ┌────▼────┐
    │ Provedor│
    │ ativo?  │
    └────┬────┘
         │ Sim
         ▼
┌─────────────────────┐
│ Gerar boleto/PIX    │
│ (banco-inter ou     │
│  asaas-nfse)        │
└────────┬────────────┘
         │
    ┌────▼────┐
    │ NFS-e   │
    │ enabled?│
    └────┬────┘
         │ Sim
         ▼
┌─────────────────────┐
│ Emitir NFS-e        │
│ (asaas-nfse: emit)  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Enviar email        │
│ (send-email-smtp)   │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Notificar staff     │
│ (notifications)     │
└────────┬────────────┘
         │
         ▼
    Próximo contrato ──────────────────┘
```

### 21.2 Fluxo da Emissão de NFS-e

```
┌──────────────────┐
│ Trigger          │
│ (auto ou manual) │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────┐
│ ensureCustomerSync()     │
│ - Validar email/CEP/end  │
│ - Criar/atualizar Asaas  │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Validar código serviço   │
│ municipal (LC 116)       │
│ ❌ Sem fallback genérico │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Criar nfse_history       │
│ status: "processando"    │
│ + retenções tributárias  │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ POST /invoices (Asaas)   │
│ Com taxes, customer,     │
│ municipalServiceId       │
└────────┬─────────────────┘
         │
    ┌────▼────┐
    │Sucesso? │
    ├─Sim─────▼──────────────┐
    │ Atualizar nfse_history │
    │ asaas_invoice_id       │
    │ status: processando    │
    │ ou autorizada          │
    └────────────────────────┘
    │
    ├─Não─────▼──────────────┐
    │ Atualizar nfse_history │
    │ status: erro           │
    │ mensagem_retorno       │
    │ codigo_retorno         │
    └────────────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Log em nfse_event_logs   │
└──────────────────────────┘
```

### 21.3 Fluxo da Emissão de Boleto (Banco Inter)

```
┌─────────────────────┐
│ Request: invoice_id │
│ + payment_type      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│ Verificar config    │
│ mTLS + credenciais  │
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Token ESCRITA               │
│ scope: boleto-cobranca.write│
│ (fallback: combinado)       │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ POST /cobranca/v3/cobrancas │
│ (seuNumero, valor, pagador) │
└────────┬────────────────────┘
         │
         ▼ codigoSolicitacao
┌─────────────────────────────┐
│ Token LEITURA               │
│ scope: boleto-cobranca.read │
│ (fallback: combinado)       │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Polling (6 × 5s = 30s)     │
│ GET /cobrancas/{id}         │
│ Headers: Bearer readToken   │
└────────┬────────────────────┘
         │
    ┌────▼────┐
    │ Dados   │
    │obtidos? │
    ├─Sim─────▼──────────────────┐
    │ Salvar linhaDigitavel,     │
    │ pdfUrl, nossoNumero        │
    │ boleto_status = "enviado"  │
    └────────────────────────────┘
    │
    ├─Não─────▼──────────────────┐
    │ Salvar codigoSolicitacao   │
    │ boleto_status = "pendente" │
    │ Aguardar poll-boleto-status│
    └────────────────────────────┘
```

### 21.4 Fluxo de Envio ao Cliente

```
┌─────────────────┐
│ Trigger:        │
│ - Auto (CRON)   │
│ - Manual (UI)   │
│ - Reenvio       │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Verificar dados fatura: │
│ boleto_barcode?         │
│ pix_code?               │
│ boleto_status?          │
└────────┬────────────────┘
         │
    ┌────▼────────┐
    │ Canal:      │
    │ email?      │────► send-email-smtp
    │ whatsapp?   │────► send-whatsapp
    └─────────────┘
         │
         ▼
┌─────────────────────────┐
│ Registrar resultado:    │
│ - invoices.email_status │
│ - message_logs          │
│ - invoice_notification  │
│   _logs (dedup)         │
└─────────────────────────┘
```

### 21.5 Fluxo de Notas Avulsas

```
┌────────────────────┐
│ NfseAvulsaDialog   │
│ - Cliente          │
│ - Valor            │
│ - Serviço          │
│ - Tributação       │
│ - Cobrança? (opt)  │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ asaas-nfse         │
│ action: emit_      │
│ standalone         │
└────────┬───────────┘
         │
    ┌────▼────┐
    │Cobrança │
    │ativa?   │
    ├─Sim─────▼─────────────┐
    │ Criar fatura          │
    │ Gerar boleto/PIX      │
    │ Enviar notificação    │
    └───────────────────────┘
    │
    ├─Não─────▼─────────────┐
    │ Apenas NFS-e emitida  │
    │ Sem registro financ.  │
    └───────────────────────┘
```

### 21.6 Fluxo de Adicionais

```
┌─────────────────────────┐
│ Staff cadastra adicional│
│ contract_additional_    │
│ charges                 │
│ (contrato, mês, valor)  │
└────────┬────────────────┘
         │
         ▼ (no ciclo de faturamento)
┌─────────────────────────┐
│ generate-monthly-       │
│ invoices busca:          │
│ applied=false            │
│ reference_month=atual    │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ totalAmount =           │
│ monthly_value +         │
│ Σ adicionais.amount     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Criar fatura com total  │
│ Detalhar em notes       │
│ Marcar applied=true     │
│ applied_invoice_id=id   │
└─────────────────────────┘
```

---

## 22. Regras Gerais do Sistema

### 22.1 Validações

#### Frontend (`src/lib/security.ts`)
- `escapeHtml()`: Prevenção XSS
- `sanitizeString()`: Remove padrões perigosos
- `sanitizeEmail()`, `sanitizePhone()`, `sanitizeUrl()`: Validações de formato
- `validateCNPJ()`, `validateCPF()`: Validação com dígitos verificadores
- Todos os formulários usam **Zod schemas** para validação

#### Backend (Edge Functions)
- Validação de todos os inputs antes do processamento
- Formato de email, telefone e documento verificados
- Tamanhos máximos aplicados (email: 50KB HTML, WhatsApp: 4096 chars)
- Mensagens de erro nunca expõem detalhes internos (SQL, stack traces)

### 22.2 Exceções e Comportamentos Especiais

1. **Fatura com boleto pendente:** Notificação de cobrança é enviada com aviso de que boleto está em processamento
2. **Contrato sem código de serviço:** NFS-e é rejeitada (sem fallback genérico para evitar erros fiscais)
3. **Cliente sem dados completos:** Emissão de NFS-e falha com lista de campos faltantes
4. **Webhook duplicado:** Ignorado via tabela `webhook_events` (idempotência)
5. **Reajuste com índice econômico:** Apenas notificação — requer aprovação manual
6. **NFS-e com E0014 (duplicada):** Bloqueia reemissão, sugere vinculação externa
7. **Boleto sem dados após 30s:** Marca como pendente e confia no polling fallback (1h+)
8. **Sandbox Banco Inter indisponível:** Retorna erro orientando uso do ambiente de produção

### 22.3 Tratamento de Erros

#### Padrão de resposta de Edge Functions
```json
{
  "success": false,
  "error": "Mensagem amigável para o usuário",
  "code": "CODIGO_ERRO",
  "details": {
    "correlation_id": "uuid-para-rastreamento",
    "campo_extra": "valor"
  }
}
```

#### Frontend (`src/lib/api-error-handler.ts`)
- `sanitizeApiError()`: Transforma erros brutos em mensagens amigáveis
- Nunca expõe SQL errors, stack traces ou detalhes internos
- Padrões filtrados: `pgrst`, `JWT`, `password`, etc.

#### Logging seguro (`src/lib/logger.ts`)
- `maskSensitiveData()`: Mascaramento de API keys, tokens, senhas
- Logs de produção omitem dados sensíveis

### 22.4 Cache e Performance

- **QueryClient:** staleTime 5min, gcTime 15min, sem refetch on mount/focus/reconnect
- **Realtime:** Hook unificado `useUnifiedRealtime` invalida caches automaticamente ao receber changes
- **Imagens:** Lazy loading nativo
- **Edge Functions:** Timeout configurado, rate limiting por IP (10 req/s)
- **Polling:** Batch de 5 paralelos no fallback de boleto

---

## 23. Integrações Externas

### 23.1 Mapa de Integrações

| Sistema | Tipo | Edge Function | Configuração |
|---|---|---|---|
| **Banco Inter** | Boleto/PIX via mTLS | `banco-inter` | `integration_settings.banco_inter` |
| **Asaas** | NFS-e + Cobranças via API Key | `asaas-nfse` | `integration_settings.asaas` |
| **Evolution API** | WhatsApp via REST | `send-whatsapp` | `integration_settings.evolution_api` |
| **Telegram** | Bot API | `send-telegram` | `integration_settings.telegram` |
| **CheckMK** | Monitoramento REST API | `checkmk-sync` | `integration_settings.checkmk` |
| **Tactical RMM** | Monitoramento REST API | `tactical-rmm-sync` | `integration_settings.tactical_rmm` |
| **Google Calendar** | OAuth 2.0 bidirecional | `google-calendar` | `google_calendar_integrations` |
| **SMTP** | Email via sockets Deno | `send-email-smtp` | `integration_settings.smtp` |
| **BCB (Banco Central)** | Índices econômicos | `fetch-economic-indices` | Sem credenciais |

### 23.2 Webhooks Recebidos

| Endpoint | Origem | Verificação |
|---|---|---|
| `webhook-banco-inter` | Banco Inter | HMAC-SHA256 |
| `webhook-asaas-nfse` | Asaas | Token de webhook |
| `webhook-whatsapp-status` | Evolution API | API Key |
| `webhook-telegram-status` | Telegram | Token do bot |

### 23.3 Certificados Digitais

- **Tabela:** `certificates`
- **Tipo:** A1 (arquivo PFX/P12)
- **Gerenciamento:** `CertificateManager` + `CertificateUpload`
- **Parsing:** Edge Function `parse-certificate` (extrai dados do certificado)
- **Verificação de expiração:** CRON `check-certificate-expiry`
- **Vault:** Edge Function `certificate-vault` para armazenamento seguro
- **Senha:** Criptografada com AES-256-GCM em `senha_hash`

---

## 24. Infraestrutura e Automação

### 24.1 Jobs CRON (pg_cron)

| Horário | Job | Edge Function |
|---|---|---|
| 03:00 | Atualizar faturas vencidas para `overdue` | (trigger/query direto) |
| 06:00, 12:00, 18:00, 00:00 | Polling de serviços (boleto status) | `poll-services` |
| 10:00 | Verificar reajustes de contratos | `check-contract-adjustments` |
| 11:00 | Geração automática de faturas | `generate-monthly-invoices` |
| 12:00 | Lembretes de vencimento | `notify-due-invoices` |
| Periódico | Polling NFS-e status | `poll-asaas-nfse-status` |
| Periódico | Polling boleto fallback | `poll-boleto-status` |
| Periódico | Sincronização CheckMK | `checkmk-sync` |
| Periódico | Sincronização Tactical RMM | `tactical-rmm-sync` |
| Periódico | Buscar índices econômicos | `fetch-economic-indices` |
| Periódico | Verificar expiração de certificados | `check-certificate-expiry` |
| Periódico | Verificar tickets sem contato | `check-no-contact-tickets` |
| Periódico | Escalar alertas | `escalate-alerts` |

### 24.2 Edge Functions sem JWT (`verify_jwt = false`)

As seguintes funções são invocadas por CRON ou webhooks (sem contexto de usuário):
- `bootstrap-admin`, `checkmk-sync`, `apply-contract-adjustment`, `check-contract-adjustments`
- `send-nfse-notification`, `send-email-smtp`, `send-whatsapp`
- `batch-process-invoices`, `fetch-economic-indices`, `calculate-invoice-penalties`
- `manual-payment`, `generate-second-copy`, `renegotiate-invoice`

### 24.3 Realtime

O hook `useUnifiedRealtime` centraliza todas as subscriptions Realtime do sistema:
- Escuta `postgres_changes` em tabelas-chave (tickets, notifications, invoices, etc.)
- Invalida automaticamente as queries do TanStack Query correspondentes
- Evita múltiplas conexões WebSocket

### 24.4 PWA e Push Notifications

- **Service Worker:** `public/sw-push.js`
- **Manifesto:** `public/manifest.json`
- **Ícones:** Múltiplas resoluções em `public/pwa-icons/`
- **Push:** Edge Function `send-push-notification` + tabela `push_subscriptions`
- **Gerenciamento:** `PushPermissionBlockedCard` para orientar usuários

---

*Documento gerado automaticamente com base no código-fonte do Colmeia HD Pro em 2026-02-13.*
