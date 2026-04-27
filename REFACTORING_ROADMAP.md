# Roadmap de Refatoração

Documento mestre do processo de refatoração do colmeiahdpro. Cada seção é executada **uma de cada vez**, item por item, sem antecipar detalhes que ainda não foram acordados.

---

## Princípios globais

Estes princípios guiam toda decisão dentro deste roadmap. Em caso de conflito, o princípio listado primeiro prevalece.

1. **Raiz > Sintoma** — sempre tratar a causa raiz antes do sintoma; band-aids só com justificativa explícita.
2. **Ferramenta antes de ação** — antes de qualquer mudança, garantir que existe instrumento para auditar, medir e reverter.
3. **Prevenção** — preferir mudanças que evitem reincidência do problema (constraints, triggers, validações) a correções pontuais.
4. **Auditoria** — toda alteração relevante precisa deixar rastro (CHANGELOG, audit_logs, logs de função).
5. **Lente SaaS-ready** — avaliar cada mudança pensando em multi-tenant futuro, mas sem implementar agora o que está no Backlog Fase 2.
6. **Rollback possível** — nenhuma mudança entra sem caminho claro de reversão (backup + script reverso ou migration de rollback).
7. **Uma seção por vez** — não pular nem paralelizar seções; concluir, validar e marcar antes de iniciar a próxima.

---

## Já concluído (sessões anteriores)

Itens executados antes da formalização deste roadmap, mantidos aqui para rastreabilidade.

- ✅ Rastreabilidade de e-mails de cobrança (envio, abertura, falha)
- ✅ Edge Function `resend-confirmation` criada e deployada (rate-limit 3/h)
- ✅ Helpers de e-mail consolidados em `supabase/functions/_shared/email-helpers.ts`
- ✅ Painel `InvoiceNotificationHistory` para auditoria de envios
- ✅ Limpeza de 2 usuários órfãos em `auth.users`

---

## Seções do roadmap

### Seção 0 — Fundação

- **Objetivo:** Estabelecer instrumentos básicos (backup, changelog, roadmap) antes de qualquer mudança de código.
- **Status:** 🟡 em andamento
- **Início:** 2026-04-24
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

### Seção 1 — Correções críticas com ferramentas admin

- **Objetivo:** Corrigir bugs críticos que já têm ferramenta administrativa disponível para validação e rollback.
- **Status:** ✅ concluída
- **Início:** 2026-04-25
- **Conclusão:** 2026-04-26
- **Resumo:** 5 itens entregues (1.1 a 1.5). Ferramentas admin criadas: `PageErrorBoundary` (captura de crashes por página), deduplicação de clientes (constraint única + RPCs `merge_clients`/`delete_client_safely` + UI wizard), gestão de usuários (`/settings/users` + `detect-auth-anomalies` + helpers `_shared/auth-helpers`), trilha de auditoria genérica (`audit_changes()` + `sanitize_jsonb()` + 6 triggers + `/settings/audit-logs`) e índices em FKs (Phase 1, 34 índices em tabelas com volume).

#### Itens

- ✅ **1.1 — `/billing/delinquency` quebrada** (concluído 2026-04-25)
  - Causa raiz: embed `clients(...)` do supabase-js retornado como ARRAY em runtime, código acessava como objeto → `TypeError`.
  - Fix: `unwrapEmbed` (`src/lib/supabase-helpers.ts`) + tipagem `ClientRow` + guard descartando faturas órfãs.
  - Ferramenta: `PageErrorBoundary` (`src/components/common/PageErrorBoundary.tsx`) loga crashes em `application_logs` e oferece UI de retry/voltar.
  - Prevenção: 3 testes de regressão (`delinquency-page.test.tsx`) cobrindo embed array/objeto/null.
  - Movido `src/pages/financial/DelinquencyReportPage.tsx → src/pages/billing/`. Pasta `financial/` removida.

- ✅ **1.2 — Cliente duplicado AIRDUTO LTDA + VIZU EDITORA** (concluído 2026-04-25)
  - Causa raiz: ausência de `UNIQUE` constraint / validação no campo `clients.document` permitiu cadastros repetidos do mesmo CNPJ (AIRDUTO em fev e abr/26; VIZU em fev e abr/26).
  - Ferramentas criadas (1.2b): coluna gerada `clients.normalized_document`, RPCs admin-only `detect_duplicate_clients()` / `merge_clients()` / `delete_client_safely()`, UI completa (`DuplicatesBanner`, `MergeClientsDialog` com wizard 3-steps híbrido B+A, `DeleteClientButton` com pré-check), pré-check de CNPJ no `ClientForm`, lib pura `client-merge.ts` com 9 testes.
  - Aplicação (1.2c): AIRDUTO consolidado em `60ba285e...` (1 contrato/1 ticket/2 contatos preservados); VIZU consolidado em `c9bab9b7...` (2 contratos ativos + 1 contato migrado). 32 clientes restantes (era 34). Auditoria registrada em `audit_logs` (action=`MERGE`) e `client_history` (action=`merged`).
  - Prevenção ativa: índice único parcial `uq_clients_normalized_document` (`WHERE normalized_document <> ''`) impede recorrência. `ClientForm` trata erro Postgres `23505` com toast amigável.

- ✅ **1.3 — Gestão de usuários e detecção de órfãos** (concluído 2026-04-25)
  - Causa raiz: `handle_new_user` falhava silenciosamente (`RAISE WARNING` sem persistência) gerando órfãos passados; 5 edge functions de gestão (`create-user`, `create-client-user`, `delete-user`, `update-user-email`, `confirm-user-email`) operavam com permissões divergentes, sem rate-limit e sem audit padronizado; admin não tinha página dedicada para gerenciar usuários.
  - Ferramentas criadas (1.3b): página `/settings/users` admin-only com 6 componentes modulares + hook `useUsers` SaaS-ready (`tenantId` opcional); helper compartilhado `_shared/auth-helpers.ts` (`requireRole`, `rateLimit`, `logAudit`, `jsonResponse`); edge function `detect-auth-anomalies` com cron diário 08:00 BRT + banner de invocação manual; trigger `audit_user_roles_trigger` em `user_roles`; refactor das 5 edge functions com permissões alinhadas + rate-limit 5/min + audit; `handle_new_user` agora persiste sucesso/falha em `application_logs`.
  - Prevenção ativa: telemetria contínua via `application_logs` + cron de anomalias; RLS append-only em `audit_logs` (UPDATE/DELETE bloqueados); rate-limit em todas as edges sensíveis.
  - Antecipação: trigger de audit em `user_roles` foi antecipado de 1.4. Outras tabelas sensíveis (`invoices`, `contracts`, `clients`, `bank_accounts`, `integration_settings`) foram cobertas em 1.4 com função genérica reaproveitável.

- ✅ **1.4 — Trilha de auditoria genérica** (concluído 2026-04-26)
  - Causa raiz: ausência de trilha consolidada para tabelas sensíveis impedia investigação forense pós-incidente; função específica `log_integration_settings_changes` não cobria as demais.
  - Ferramentas criadas: função genérica `audit_changes()` (SECURITY DEFINER, gravando em `audit_logs`); função `sanitize_jsonb()` recursiva que redata chaves sensíveis (`password`, `secret`, `token`, `api_key`, etc.); 6 triggers ativos (`user_roles`, `invoices`, `contracts`, `clients`, `bank_accounts`, `integration_settings`); RPC `list_audit_logs_with_user` admin-only com paginação real e filtros (tabela, ação, usuário, busca, datas); página `/settings/audit-logs` admin-only com diff visual JSONB (added/removed/changed), filtros, paginação 50/página e Sheet de detalhes.
  - Validação real: UPDATE controlado em `integration_settings.settings` confirmou redação de `[REDACTED]` em chaves aninhadas e topo. Função legada `log_integration_settings_changes` removida após verificação de zero referências externas.
  - Prevenção ativa: novas tabelas sensíveis basta anexar `audit_changes()` via trigger — não precisa de função custom.

- ✅ **1.5 — Índices em FKs críticas (Phase 1)** (concluído 2026-04-26)
  - Causa raiz: ~75 foreign keys do schema `public` sem índice de suporte. Sem índice, FK degrada DELETE/UPDATE no pai (full scan na tabela filha) e penaliza JOINs frequentes.
  - Migration `*_fk_indexes_phase1.sql`: 34 índices `CREATE INDEX IF NOT EXISTS idx_<table>_<column>` em tabelas com volume real ou core do sistema (audit_logs, ticket_history, client_history, contract_history, invoice_generation_log, invoice_items, invoices, financial_entries, contract_services, contracts, client_contacts, tickets, ticket_comments, ticket_pauses, doc_sync_log, monitored_devices, sla_configs, nfse_history, knowledge_articles, technician_points). `ANALYZE` em todas as tabelas alteradas para atualizar estatísticas do planner.
  - Validação: `EXPLAIN ANALYZE` confirmou `Index Scan using idx_audit_logs_user_id` (filtro por user_id) e `Index Scan using idx_invoice_generation_log_contract_id` (filtro por contract_id). Query `tickets` LEFT JOIN `clients` ainda usa Seq Scan no top-level por volume baixo (18 linhas) — comportamento esperado do planner; índice `idx_tickets_client_id` será aproveitado quando volume crescer ou em filtros explícitos por cliente.
  - Descartados (lookup tables, não vale o índice): `feature_flags.updated_by`, `role_permission_overrides.created_by`.
  - Deferidos: ~30 FKs em tabelas hoje vazias (doc_*, calendar_events, maintenances, monitoring_alerts.acknowledged_by, license_assets, software_licenses, bank_reconciliation, etc.) — registrado como dívida na Seção 4.

### Seção 2 — Monitoramento e sync de devices

- **Objetivo:** Estabilizar a sincronização de dispositivos monitorados (UniFi, Tactical RMM, CheckMK) e o pipeline de alertas.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

### Seção 3 — Navegação e organização

- **Objetivo:** Revisar estrutura de rotas, sidebar, breadcrumbs e padrões de navegação para reduzir fricção.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

#### Dívidas registradas
- **Bug 17 — Link `/settings/users` no `AppSidebar`**: hoje a página é alcançada apenas digitando a URL. Adicionar item de menu para admin (vinculado à auditoria 1.3a/b).
- **Bug #3 (varredura 2026-04-26) [item 5.H]**: `/settings/users` e `/settings/audit-logs` sem link no `AppSidebar` — incluir grupo "Administração" admin-only quando redesenhar o hub `/settings`. **Confirmado pendente.**
- **Bug #6 (varredura 2026-04-26) [item 5.I]**: `record_id` em `audit_logs` exibido como UUID cru — criar RPC ou hook que resolve para nome do recurso (ex: "Cliente AIRDUTO LTDA" em vez de UUID) baseado em `table_name`. Fix mínimo já entregue (tooltip + botão copiar). **Resolução humana pendente.**

### Seção 4 — Decisão sobre features abandonadas

- **Objetivo:** Decidir manter, completar ou remover módulos parciais (ex.: doc_*, inventário com tabelas vazias).
- **Status:** ✅ concluída
- **Início:** 2026-04-26
- **Conclusão:** 2026-04-26
- **Resumo:** 8 blocos auditados (doc_*, Inventário, Banking, Gamificação, Monitoring, Tickets Avançados, Departments, Calendar). 0 drops realizados — código e schema preservados. 2 features escondidas via feature flag (`departments_enabled=false` e `gamification_enabled=false`) para refazer multi-tenant no remix SaaS futuro. 2 novas seções abertas: 4.5 (CMDB — documentação MSP de clientes) e 4.6 (Financeiro MSP profissional). Decisão: multi-tenant **NÃO** será feito neste projeto — será via remix futuro do Lovable (registrado em `PRODUCT_IDEAS.md`).

#### Dívidas registradas
- **FKs sem índice em tabelas hoje vazias** (registrado em 1.5): indexar APÓS decisão de manter/remover cada bloco. Tabelas afetadas: todas as `doc_*`, `monitoring_alerts.acknowledged_by`, `doc_alerts.acknowledged_by`, `department_members`, `departments.manager_id`, `calendar_events` (3 FKs), `maintenances` (3 FKs), `license_assets`, `software_licenses`, `bank_reconciliation`, `nfse_cancellation_log`, `contract_service_history`, `contract_additional_charges.applied_invoice_id`, `assets.responsible_contact`, `alert_escalation_settings.client_id`. Reavaliar após Seções 4.5 e 4.6 fecharem.

### Seção 4.5 — Documentação MSP de Clientes (CMDB)

- **Objetivo:** Transformar o módulo `doc_*` (hoje 23 tabelas, 21 vazias) em CMDB funcional que documente filiais, credenciais, links de internet, contatos e rotinas de cada cliente atendido.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo (em ordem de execução)
- **4.5.1 — Filiais (`client_branches`)**: tabela + UI mínima vinculando ativos/contatos/contratos a filiais do mesmo cliente.
- **4.5.3 — Pipeline de coleta robusto + alertas**: garantir que TRMM/UniFi/CheckMK estão coletando 100% dos ativos esperados e que `monitoring_alerts` está populando (hoje 0 alertas com 8 devices ativos — pipeline suspeito).
  - **4.5.3.1 — Bug do IP público RMM [item 5.A]**: confirmado que todos os 8 devices RMM mostram IP `200.218.233.10` (IP público da Colmeia, não dos clientes). Causa raiz: extração errada da API TRMM/UniFi (provavelmente caindo em `public_ip` em vez de `local_ips`). Correção: usar `local_ips[0]` com fallback `ipv4_addresses[0]`. Adicionar coluna `monitored_devices.ip_source` (`local`/`public`/`unknown`) para detecção contínua. Badge amarelo para IPs suspeitos. Botão "Forçar re-sync" por device + "Re-sync cliente inteiro" no detalhe do cliente. Esforço: ~1-2 dias.
- **4.5.7 — Vínculo computador↔chamado**: campo de seleção de ativo no form de novo ticket; popular `tickets.asset_id` automaticamente quando cliente é selecionado.
- **4.5.2 — UI manual mínima**: 5-6 tabelas críticas (`doc_credentials`, `doc_external_providers`, `doc_internet_links`, `doc_support_hours`, `doc_contacts`, `doc_routines`) com CRUD básico no painel do cliente.
- **4.5.4 — Vault de credenciais (camada 2)**: mover `doc_credentials.password` para Supabase Vault; RPC `get_credential_password` admin-only com auditoria.
- **4.5.5 — Views materializadas cruzando integrações (camada 2)**: consolidar dados de TRMM + UniFi + CheckMK + assets em view única por cliente.
- **4.5.6 — Auditoria fina das tabelas restantes (camada 2)**: revisar as ~17 tabelas `doc_*` ainda vazias após camadas anteriores e dropar definitivamente as não usadas.

### Seção 4.6 — Financeiro MSP profissional

- **Objetivo:** Elevar o módulo financeiro (hoje focado em faturamento de contratos) para cobrir gestão de caixa, despesas e relatórios gerenciais que um MSP precisa para tomar decisão.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo

**BASE:**
- **4.6.1 — Contas bancárias + saldo manual**: completar UI de `bank_accounts` (já existe na arquitetura) com lançamento manual de saldo inicial e ajustes.
- **4.6.2 — Despesas + contas a pagar**: tabela `expenses` (categoria, fornecedor, vencimento, status), UI de lançamento e calendário de vencimentos.
- **4.6.3 — Centros de custo funcionais**: vincular receitas (faturas) e despesas a centros de custo para análise de margem.
- **4.6.6 — Recibo de pagamento ao cliente [item 5.D / G17 da auditoria de notificações]**: após confirmação de pagamento (webhooks Asaas/Inter já implementados em Lote B G3), enviar e-mail/PDF "recibo" com número da fatura, valor pago, data e forma de pagamento. Esforço baixo (~0.5 dia) — reaproveita helper `notifyClientPaymentConfirmed` e template de e-mail novo.

**CAMADA 2:**
- **4.6.4 — Importação extrato OFX/CSV + conciliação**: parser de extratos bancários e UI de match com `bank_reconciliation` (RPC `auto_reconcile_bank_entries` já existe).
- **4.6.5 — Relatórios gerenciais**: DRE simplificado, MRR (Monthly Recurring Revenue), ARR (Annual Recurring Revenue), Aging de recebíveis, Forecast de caixa, Margem por cliente.

**CAMADA 3 (ativar quando primeiro cliente SaaS pedir):**
- Reajuste automático IGPM/IPCA em contratos
- Faturamento de hora extra (quando técnico passa do contrato)
- Comissão de vendedor
- Integração SPED/contador
- Multi-empresa, multi-moeda

> Itens da Camada 3 também estão registrados em `PRODUCT_IDEAS.md` como referência para o remix SaaS futuro.

### Seção 4.7 — Portal do Cliente (UX + paridade)

- **Objetivo:** Elevar o portal do cliente (`/client-portal`) ao nível de paridade funcional com o painel admin (chamados, financeiro, ativos, CMDB).
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo
- **4.7.1 — Aba "Faturas" funcional**: lista paginada com filtro por status, download do boleto/PDF NFS-e, link PIX, indicador de atraso. Hoje só existe esqueleto (`ClientPortalFinancialTab`).
- **4.7.2 — Vínculo de ativos visível**: cliente vê seus dispositivos monitorados (status, último contato, alertas abertos) — depende da Seção 4.5 (CMDB).
- **4.7.3 — Histórico de chamados com filtro/busca**: paginação, busca por título/número, agrupamento por status.
- **4.7.4 — Avaliação pós-resolução completa**: garantir que o CTA de avaliação (G6) chegue por e-mail e portal e seja salvo em `ticket_evaluations`.
- **4.7.5 — Mobile-first**: revisar densidade e fluxos do portal especificamente em viewport mobile (cliente abre chamado do celular).
- **4.7.6 — Anexos em chamados (cliente upload)**: cliente anexa fotos/prints ao abrir/comentar chamado. Validação MIME + 5MB. Bucket dedicado com RLS.
  - **DEPENDÊNCIA EXTERNA [item 5.G]**: projeto **ALTAHU** (assistente IA via WhatsApp, conversa separada) consome esta funcionalidade. ALTAHU converte mensagens WhatsApp em chamados no portal e precisa anexar fotos/prints enviados pelo cliente. **Sistema de anexos é BLOQUEADOR para ALTAHU funcionar plenamente.**

### Seção 4.8 — Notificações ao cliente final (Hub)

- **Objetivo:** Resolver gaps da auditoria de notificações: preferências por cliente, cooldown anti-spam, padronização de templates, reimplementação do welcome email.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo
- **4.8.1 — Schema de preferências do cliente**: tabela `client_notification_preferences` (canais ativos, quiet hours, opt-out por tipo de evento). UI no portal do cliente.
- **4.8.2 — Cooldown / dedupe em ticket notifications**: aplicar padrão das edges SLA/Invoice (cooldown por evento+ticket).
- **4.8.3 — Renomear `client_notification_rules`**: hoje é mal-nomeado (são regras de staff observando clientes, não preferências do cliente). Renomear para `staff_client_watch_rules` ou similar.
- **4.8.4 — Welcome email reimplementado**: chamada explícita de `create-client-user` para `send-welcome-email` (sem trigger DB + Vault). Templates editáveis no Hub.
- **4.8.5 — Hub central de notificações**: painel admin que mostra todos os canais (e-mail, WA, Telegram, push), templates, preferências por cliente, logs unificados.

### Seção 4.9 — Configurações (Hub Settings)

- **Objetivo:** Reorganizar `/settings` em hub coerente, eliminar fragmentação atual, adicionar admin tools faltantes.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo
- **4.9.1 — Reagrupar abas**: 4 grupos lógicos (Empresa, Operação, Integrações, Administração). Usuários, Auditoria, Feature Flags entram em "Administração".
- **4.9.2 — Editor de templates de e-mail visual**: hoje é texto puro em `email_templates`. WYSIWYG mínimo + preview.
- **4.9.3 — Tela de integrações unificada**: status (conectado/erro/desconfigurado), última sincronização, última falha, botão "testar conexão" para Asaas, Inter, TRMM, UniFi, CheckMK, Resend, Evolution.
- **4.9.4 — Branding**: logo, cores, favicon, footer de e-mail editáveis (consolidar `email_settings` + `company_settings`).

### Seção 4.10 — Storage R2 + LGPD

- **Objetivo:** Migrar storage pesado (PDFs NFS-e, XMLs, anexos de chamado) para Cloudflare R2 e adicionar fluxos básicos de LGPD.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo
- **4.10.1 — R2 como bucket secundário**: novos PDFs/XMLs vão para R2; existentes no Supabase Storage migram em background.
- **4.10.2 — RPC `generate_signed_url`**: hoje é placeholder. Implementar real via R2 SDK ou Supabase Storage.
- **4.10.3 — Política de retenção**: TTL configurável para anexos antigos de chamados (>2 anos move para frio).
- **4.10.4 — LGPD básico**: RPC `export_client_data(client_id)` (admin-only) retorna ZIP com tudo do cliente; RPC `anonymize_client(client_id)` mantém histórico mas redata PII.

### Seção 4.11 — Observabilidade interna

- **Objetivo:** Garantir que falhas silenciosas (como o caso do welcome email descoberto durante o fechamento da Seção 4) sejam detectáveis automaticamente. Health-checks ativos, alertas de regressão, validação de pré-requisitos críticos (Vault, secrets, conectividade).
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo

- **4.11.1 — Mapear funções DB que dependem de Vault + `pg_net.http_post`** (tarefa imediata): query inicial sobre `pg_proc` listando TODAS as funções que usam `vault.decrypted_secrets` + `net.http_post`. Para cada uma, validar se está funcional hoje (testar invocação manual + checar logs em `application_logs` / `net.http_request_queue`). Conhecidas hoje: `notify_on_monitoring_alert` (precisa validar). `trigger_send_welcome_email` foi removida na Seção 4 (G12).
- **4.11.2 — Validação de Vault secrets (CRÍTICO — descoberto na Seção 4)**: criar check no health-check que valida se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão populados em `vault.decrypted_secrets`. Se faltar, alertar admin via banner em `/settings` + e-mail. Padrão descoberto durante teste de welcome email: trigger DB pode usar `pg_net` + Vault para invocar edges, e secrets ausentes causam **falha silenciosa** (`RAISE WARNING` não persistido, request nunca enfileirado em `net.http_request_queue`).
- **4.11.3 — Health-check page (`/settings/health`)**: dashboard interno mostrando status de cada integração, últimas falhas, alertas ativos, espaço em storage, jobs `pg_cron` rodando, fila `net.http_request_queue` parada.
- **4.11.4 — Persistência de `RAISE WARNING`**: substituir todos os `RAISE WARNING` em funções `SECURITY DEFINER` por inserts em `application_logs` (padrão já adotado em `handle_new_user` na Seção 1.3). Buscar `RAISE WARNING` em todas as funções e padronizar.
- **4.11.5 — Alertas de regressão de notificação**: contar diariamente quantos e-mails/WAs/pushes foram enviados; se cair acima de X% vs baseline (ex: -50% em 7 dias), alertar admin (sinal precoce de quebra silenciosa).

### Seção 5 — Limpeza de código morto

- **Objetivo:** Remover componentes órfãos, edge functions sem uso, dependências não utilizadas e tabelas legadas.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

#### Dívidas registradas
- **Bug 5 — `CreateUserDialog` sem validação `zod`**: hoje permite enviar email vazio, sem `@` e senha < 8. Refatorar com `react-hook-form` + `zod` no padrão do projeto.
- **Bug 12 — Skeleton da `UsersList` usa `<TableCell>` correto**: já corrigido na primeira passada (item 1.3b), entrada mantida só como referência caso reapareça.
- **Bug 13 — Item "Reset senha (em breve)" no `UserActionsMenu`**: implementar (chamar `auth.admin.generateLink('recovery')` via edge) ou remover.
- **Uso baixo de `ticket_categories` (Seção 4 — 2026-04-26)**: apenas 11% dos tickets têm `category_id` preenchido. Investigar se a UI não obriga a seleção (ou se obriga mas usuário pula) e decidir: tornar obrigatório no form, popular default automático ou remover o campo se não agrega valor.

### Seção 6 — Consolidação de código duplicado

- **Objetivo:** Eliminar duplicações (formatadores, validação HMAC, helpers de UI) movendo-as para `_shared/` ou `src/lib/`.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

#### Dívidas registradas
- **Bug 10 — `MergeClientsDialog` para grupos > 2**: hoje há guard que bloqueia a UI nesse caso. Implementar mescla iterativa em pares (ou reescrever wizard para escolher 1 destino + N sources).

### Seção 7 — Hardening operacional

- **Objetivo:** Reforçar observabilidade, alertas, índices, performance e processos operacionais para produção estável.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —
- _Detalhes serão adicionados quando a seção for iniciada._

#### Dívidas registradas
- **Rate-limit / captcha no signup público (`Register.tsx`)** — registrado como TODO no topo do arquivo (item 1.3b). Hoje a rota `/register` não tem proteção contra criação automatizada de contas. Implementação não trivial sem captcha (hCaptcha/Turnstile); avaliar nesta seção.
- **Bug 8 — Paginação real em `useUsers`** quando passar de 100 usuários (hoje há `slice(0, 50)` no client; antes disso, RPC `list_users_for_admin` retorna tudo).
- **Bug 9 — Sanitizar filtro PostgREST** contra caracteres especiais (vírgula, parênteses) que quebram o parser do `or(ilike)`. Após migração para `list_users_for_admin` o filtro virou client-side, mas qualquer query futura usando `.or(...)` deve ter sanitização compartilhada em `src/lib/`.
- **Política de retenção de `audit_logs`** (registrado em 1.4): definir TTL (sugestão 12 meses) + job `pg_cron` para purge automático e/ou export para storage frio antes do delete. Hoje a tabela cresce indefinidamente.
- **Tabelas auditadas restantes** (registrado em 1.4): `email_settings`, `nfse_settings`, `feature_flags` ainda sem trigger de auditoria — anexar `audit_changes()` quando houver demanda operacional.

#### Bugs descartados (over-engineering)
- **Bug 11** (normalização de whitespace na confirmação do merge) — risco real desprezível.
- **Bug 16** (campo `phone` selecionado sem ser exibido) — custo desprezível.

---

## Backlog Fase 2 (SaaS) — não fazemos agora

Itens reservados para uma futura fase de evolução do produto. Não entram no escopo deste roadmap.

- Multi-tenancy real (tabela `tenants`, isolamento via RLS)
- Branding customizável por tenant (logo, cores, domínio)
- Onboarding self-service de MSPs
- Integrações por tenant (cada MSP com suas próprias credenciais TRMM/UniFi/CheckMK)
- Faturamento do SaaS (cobrar MSPs clientes)
- Features potencialmente úteis vistas no BomControle (a avaliar depois): fluxo de caixa gráfico, conciliação bancária, régua de cobrança melhorada, dashboard unificado multi-cliente, notificações in-app em tempo real (UI)

---

## Descartados — não fazem sentido para este produto

Decisões já tomadas. Não retomar sem justificativa nova e explícita.

- ❌ **Multi-empresa clássico** (vai ser multi-tenant na Fase 2)
- ❌ **Aprovação financeira** (dono decide sozinho)
- ❌ **CRM completo** (34 clientes, planilha resolve)
- ❌ **Estoque, Vendas, NF-e produto** (MSP não tem estoque)
- ❌ **BPM/modelagem de processos** (escala grande demais)
- ❌ **Comissões de vendedores** (não aplicável)
