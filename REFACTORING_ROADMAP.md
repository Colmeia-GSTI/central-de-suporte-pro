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
  - **PR #1 — Schema base + RLS + audit + Sede automática** ✅ 2026-04-27 — tabela criada, 6 policies (staff/client_master/client/admin), 3 índices (FK + UNIQUE parcial `is_main` + UNIQUE `(client_id, lower(name))`), triggers `audit_changes` e `update_updated_at_column`, 32 filiais "Sede" inseridas (1 por cliente). Sem `branch_id` em outras tabelas e sem UI ainda.
  - **PR #2 — UI de gestão de filiais (admin/staff)** ✅ 2026-04-27 — aba "Filiais" em `ClientDetailPage` (entre Informações e Usuários, `grid-cols-8`), componente `ClientBranchesList` + hook `useClientBranches`. CRUD completo com form (nome, switch Sede, CEP/cidade/UF, endereço, telefone, email, observações), badge de Sede com ícone Star, tratamento explícito de violações UNIQUE com toasts amigáveis, bloqueio defensivo de exclusão da Sede quando há outras filiais. `merge_clients` ajustada para migrar `client_branches` resolvendo conflitos de Sede e nome automaticamente. TS limpo, 32 branches preservadas, 6 policies do PR #1 intactas.
  - **PR #3 — `branch_id` em assets + monitored_devices + doc_devices + UI inventário** ✅ 2026-04-27 — coluna `branch_id` (FK nullable para `client_branches`, `ON DELETE SET NULL`) com índice parcial nas 3 tabelas de CMDB físico. Hook `useClientBranchOptions` (reutiliza `useClientBranches` do PR #2). Dropdown "Filial" em 4 forms manuais: `AssetForm`, `ClientAssetsList` (mini-form), `DocTableWorkstations`, `DocTableNetworkDevices`. Edge functions de sync (TRMM/UniFi/CheckMK) intactas — `branch_id` fica NULL nesses registros até Seção 4.5.3.
  - **PR #4 — `branch_id` em CMDB de rede (`doc_vlans`, `doc_vpn`, `doc_firewall_rules`, `doc_access_policies`, `doc_internet_links`, `doc_infrastructure`)** ✅ 2026-04-27 — coluna `branch_id` (FK nullable para `client_branches`, `ON DELETE SET NULL`) + índice parcial nas 6 tabelas. Sem backfill (todas vazias). RLS preservada. Dropdown "Filial" adicionado nos 2 forms manuais existentes hoje (`DocTableInternetLinks`, `DocSectionInfrastructure`) reutilizando `useClientBranchOptions` do PR #3 (pré-seleção de Sede em criação; edição respeita NULL existente via guarda `data?.id`). Componentes de VLANs/VPN/Firewall/AccessPolicies ainda não existem na UI — coluna fica pronta para a Seção 4.5.2 quando esses forms forem criados.
  - **PR #5 — `branch_id` em client_contacts + portal do cliente**: ☐ pendente
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
- **4.8.6 — Avisos macro / broadcast [item 5.E / G11 da auditoria de notificações]**: admin envia comunicado para todos os clientes ou subset filtrado (ex: "manutenção programada na sexta", "novo recurso disponível"). Componentes: tabela `broadcast_messages` (mensagem, segmento, canais, agendamento, status), UI admin de composição com preview, edge `dispatch-broadcast` que dispara via canais configurados (e-mail/WA/push) respeitando preferências do cliente (4.8.1).

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
- **4.9.5 — Edição real de e-mail no perfil [item 5.B]**: hoje `ProfilePage` mostra "email não pode ser alterado" mas existe edge `update-user-email`. Implementar fluxo correto: usuário digita novo e-mail → link de confirmação enviado para o **novo** endereço → troca efetiva só após clicar. Nova edge `confirm-email-change` (token de uso único). Bloquear se e-mail já em uso. Auditoria em `audit_logs`. Esforço: ~1-2 dias.

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

### Seção 4.12 — Calendar + Google Calendar sync (decidido na Seção 4)

- **Objetivo:** Completar o módulo Calendar (`/calendar`) com sincronização bidirecional com Google Calendar para que técnicos vejam compromissos no celular nativamente. **[item 5.C]**
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Caso de uso primário
Secretária lança agenda do dia (visita técnica, reunião com cliente) → sync automático para Google Calendar do técnico → técnico vê notificação no celular sem precisar abrir o sistema.

#### Escopo
- **4.12.1 — OAuth flow completo Google**: edge `google-calendar` já existe parcialmente. Faltam: tela "Conectar minha conta Google" no `ProfilePage`, callback OAuth, tokens (access + refresh) armazenados em **Vault** (depende de 4.5.4 — vault de credenciais), refresh automático.
- **4.12.2 — Sync bidirecional**: eventos criados no `/calendar` da Colmeia aparecem no Google Calendar do técnico atribuído; eventos criados no Google (que o técnico marcar como "Colmeia") refletem de volta. Mapeamento via `calendar_events.google_event_id`.
- **4.12.3 — Conflict resolution**: política simples — última escrita ganha, com log em `application_logs` quando há conflito detectado.
- **4.12.4 — Webhook Google push notifications**: assinar canal de mudanças (em vez de polling) para sync near-realtime.

> Esforço estimado: 3-5 dias. Bloqueado por: Vault de credenciais (4.5.4) — sem isso, refresh tokens vão para `integration_settings.settings` JSONB (aceitável só para v1).

### Seção 5 — Limpeza de código morto

- **Objetivo:** Remover componentes órfãos, edge functions sem uso, dependências não utilizadas e tabelas legadas. Toda remoção é precedida por verificação `rg` de zero referências (excluindo self-refs) e, quando aplicável, query SQL confirmando 0 rows.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo

**5.1 — Componentes órfãos (5 confirmados em auditoria de código)**
ANTES de remover, validar com `rg -rn "<NomeComponente>" src/` que retorna zero não-self refs:
- `src/components/billing/BillingBatchProcessing.tsx` (339 linhas)
- `src/components/calendar/InvoiceDueBadge.tsx` (76 linhas)
- `src/components/clients/ClientContactsList.tsx` (367 linhas)
- `src/components/inventory/DeviceExpandableRow.tsx` (207 linhas)
- `src/components/settings/CertificateUpload.tsx` (343 linhas)

**5.2 — Hooks/utils órfãos**
- `src/hooks/useSecureAction.ts` — validar refs e remover.
- `src/lib/nfse-validation.ts` — validar primeiro se `asaas-nfse` ou outras edges importam antes de remover.

**5.3 — Edge Functions legadas**
- `send-notification` — confirmada morta na auditoria (DIFERENTE de `send-ticket-notification`). Remover se zero call sites.
- `bootstrap-admin` — one-shot (criar primeiro admin). Decisão: marcar como deprecated com guard de execução única (checar se já existe admin) **OU** remover após confirmar via SQL que admin existe.
- `sync-doc-devices` — depende da Seção 4.5 (CMDB). **Manter por enquanto** — não tocar até decisão da CMDB.

**5.4 — Schema legado**
- `DROP COLUMN ticket_history.old_status` — confirmar via SQL `SELECT count(*) FROM ticket_history WHERE old_status IS NOT NULL` antes (espera-se 100% NULL — substituída por `field_changes` JSONB na Seção 1.4).
- **`invoice_notification_logs`: DECISÃO — MANTER** (resolvido em 2026-04-27, ver Parte 1 da consolidação 5/6/7). Tabela é ATIVAMENTE escrita por 4 edges em produção (`generate-monthly-invoices`, `notify-due-invoices`, `send-nfse-notification`, helper `_shared/notification-logger.ts`) e LIDA pelo painel `InvoiceNotificationHistory.tsx`. Hoje 0 rows porque pipeline ainda não disparou em prod, **não** porque é morta. Item de DROP que rondava em sessões anteriores fica oficialmente cancelado.

**5.5 — Dívidas técnicas registradas em sessões anteriores**
- **Bug 5 (1.3b)**: `CreateUserDialog` sem validação `zod` — hoje permite e-mail vazio, sem `@` e senha < 8.
- **Bug 12 (1.3b)**: Skeleton da `UsersList` usa `<TableCell>` correto — já corrigido na primeira passada, entrada mantida só como referência.
- **Bug 13 (1.3b)**: Item "Reset senha (em breve)" no `UserActionsMenu` — implementar (chamar `auth.admin.generateLink('recovery')` via edge) ou remover.
- **3 arquivos `logic.ts` em edges** (`generate-monthly-invoices/logic.ts`, `notify-due-invoices/logic.ts`, `resend-confirmation/logic.ts`) — testes apontam para esses arquivos, mas produção (`index.ts`) não os importa. Decidir: integrar (refactor para tirar lógica do `index.ts` e reusar via import) **ou** remover os `logic.ts` e os testes que dependem deles.
- **`UsersTab.tsx` (851 linhas)** — kept como wrapper na Seção 1.3, refactor pendente (split em sub-componentes).
- **`ticket_categories` em só 11% dos tickets** — investigar UI que não obriga seleção; decidir: tornar obrigatório, popular default automático ou remover o campo.

**5.6 — Áreas não auditadas (dívida de auditoria) [item 5.F]**
- **`/tv-dashboard` (Dashboard de TV — admin/manager)** — nunca foi auditado. Pode ter bug ou código morto. Auditoria estrutural pendente.
- **`/knowledge` e `/knowledge/:slug` (Base de Conhecimento)** — auditoria visual antiga só deu visão superficial. Auditoria estrutural (queries, RLS, performance, fluxos de criação/edição) pendente.
- **Onboarding de cliente novo** — fluxo de cadastro de cliente: tem checklist? template? guia de primeiros passos? Auditoria pendente.
- **Mobile/responsivo do admin panel** — apenas portal foi avaliado (4.7.5). Admin panel mobile (sidebar, tabelas densas, dialogs) pendente.

**5.7 — Ferramenta preventiva**
- `scripts/find-dead-code.ts` para detecção mensal de exports sem importadores (NÃO criar agora — só registrar como TODO).
- Avaliar regra ESLint `no-unused-modules` (custosa em CI; medir antes de ligar).

### Seção 6 — Consolidação de código duplicado

- **Objetivo:** Eliminar duplicações (formatadores, validação HMAC, helpers de UI, padrões de sync) movendo-as para `_shared/` (Edge Functions) ou `src/lib/` (frontend).
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo

**6.1 — Helpers de frontend duplicados**
- `formatDate` reimplementado em 4+ lugares — unificar em `src/lib/utils.ts` com locale `ptBR` por default.
- `formatCurrency` inline em `ClientManagementReport.tsx` — substituir por `src/lib/currency.ts` (já existe).

**6.2 — `_shared/webhook-validator.ts`**
Migrar validação HMAC dos 4 webhooks para helper único:
- `supabase/functions/webhook-asaas-nfse/`
- `supabase/functions/webhook-banco-inter/`
- `supabase/functions/webhook-telegram-status/`
- `supabase/functions/webhook-whatsapp-status/`

**6.3 — `_shared/device-sync.ts`**
Consolidar padrão de upsert/sync de devices que se repete em:
- `supabase/functions/tactical-rmm-sync/`
- `supabase/functions/unifi-sync/`
- `supabase/functions/checkmk-sync/`
Padrão comum: fetch list → normalizar payload → upsert em `monitored_devices` por `(external_source, external_id)` → log em `doc_sync_log`.

**6.4 — Consolidar 3 menus de ação de fatura**
Hoje existem 3 componentes próximos:
- `InvoiceActionsPopover`
- `InvoiceInlineActions`
- `ContractInvoiceActionsMenu`
→ avaliar consolidar em **1 componente configurável por contexto** (props `context: 'list' | 'inline' | 'contract'`).

**6.5 — Bug 10 (1.3b) — `MergeClientsDialog` para grupos > 2**
Hoje há guard que bloqueia UI quando o grupo de duplicatas tem 3+ clientes. Implementar mescla iterativa em pares OU reescrever wizard para escolher 1 destino + N sources.

**6.6 — Expandir `_shared/`**
`_shared/auth-helpers.ts` já criado na 1.3 — manter padrão de extração progressiva. Próximos candidatos: `pdf-helpers.ts` (geração de PDF de NFS-e/recibo), `signed-url.ts` (Storage).

### Seção 7 — Hardening operacional

- **Objetivo:** Reforçar observabilidade, alertas, índices, performance e processos operacionais para produção estável.
- **Status:** ☐ pendente
- **Início:** —
- **Conclusão:** —

#### Escopo

**7.1 — Auth Email Hook — AÇÃO MANUAL DO USUÁRIO**
Ativar Send Email Hook no painel Supabase (Dashboard → Auth → Email Templates → Hook URL apontando para `auth-email-hook`). A edge `auth-email-hook` está deployada mas **silenciosa** porque o hook nunca foi ativado no painel. Documentar passo a passo em `AUTH_HOOK_SETUP.md` (criar quando a Seção 7 for executada — **não criar agora**, só registrado como TODO aqui).

**7.2 — Página `/settings/system-health`**
**MOVIDO PARA 4.11.3** (`/admin/health` ou `/settings/health`). Item permanece registrado aqui como referência cruzada para evitar duplicação de escopo.

**7.3 — Rate limiting em endpoints públicos**
Aplicar `_shared/rate-limit.ts` (a expandir a partir de `auth-helpers.ts`) em:
- `forgot-password`
- `reset-password`
- `cnpj-lookup`
- `Register.tsx` (signup público — TODO no topo do arquivo). Implementação não trivial sem captcha (hCaptcha/Turnstile); decidir abordagem nesta seção.

**7.4 — Remover dependências não usadas (~25KB de bundle)**
Confirmar zero refs com `rg` antes de remover de `package.json`:
- `vaul`
- `input-otp`
- `embla-carousel-react`
- `react-resizable-panels`

**7.5 — Dívidas registradas**
- **Bug 8 (1.3b)**: paginação real em `useUsers` quando passar de 100 usuários (hoje `slice(0, 50)` no client; RPC `list_users_for_admin` retorna tudo).
- **Bug 9 (1.3b)**: sanitizar filtro PostgREST contra caracteres especiais (vírgula, parênteses) que quebram parser do `or(ilike)`. Após migração para `list_users_for_admin` o filtro virou client-side, mas qualquer query futura usando `.or(...)` precisa de sanitização compartilhada em `src/lib/`.
- **Política de retenção de `audit_logs`** (de 1.4): definir TTL (sugestão 12 meses) + `pg_cron` para purge automático e/ou export para storage frio antes do delete. Hoje cresce indefinidamente.
- **Tabelas auditadas restantes** (de 1.4): `email_settings`, `nfse_settings`, `feature_flags` sem trigger de auditoria — anexar `audit_changes()` quando houver demanda.
- **`npm:zod@3.23.8` build error em `manual-payment` edge** (pré-existente) — investigar e fixar versão compatível com Deno deploy.

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
