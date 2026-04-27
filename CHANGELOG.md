# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere a versionamento semântico quando aplicável.

Categorias usadas em cada entrada:

- **Adicionado** — novas funcionalidades
- **Modificado** — mudanças em funcionalidades existentes
- **Corrigido** — correção de bugs
- **Removido** — funcionalidades removidas
- **Segurança** — correções de vulnerabilidades
- **Obsoleto** — funcionalidades marcadas como obsoletas

---

## [Não lançado]

### Adicionado (Seção 4.5.1 — PR #4 — 2026-04-27)
- **Coluna `branch_id` (FK nullable para `client_branches`, ON DELETE SET NULL) em 6 tabelas de CMDB de rede**: `doc_vlans`, `doc_vpn`, `doc_firewall_rules`, `doc_access_policies`, `doc_internet_links`, `doc_infrastructure`. Índice parcial `WHERE branch_id IS NOT NULL` em cada tabela. Sem backfill (tabelas vazias até hoje). RLS preservada (policies "Staff full access on doc_*" continuam válidas). Dropdown "Filial" adicionado nos 2 forms manuais que existem hoje (`DocTableInternetLinks`, `DocSectionInfrastructure`), com pré-seleção automática da Sede em criação via `useClientBranchOptions` (reutilizado do PR #3). Forms de VLANs, VPN, Firewall e Access Policies ainda não existem na UI — coluna fica disponível para a Seção 4.5.2 quando esses forms forem criados.


### Corrigido
- **PR #3 (Seção 4.5.1) — Filiais nos forms de CMDB**: dropdown "Filial" às vezes aparecia vazio/disabled mesmo havendo filiais cadastradas. Causa raiz: `useClientBranches` rodava com `clientId=""` no primeiro mount e cacheava `[]`. Adicionado `enabled: !!clientId` no `useQuery` e proteção em `useClientBranchOptions` para tratar `clientId` ausente sem disparar query inválida.

### Modificado
- **UX dos forms de ativos/dispositivos (AssetForm, ClientAssetsList, DocTableWorkstations, DocTableNetworkDevices)**: ao **criar** novo registro, a Sede do cliente é pré-selecionada automaticamente no dropdown "Filial" quando existe (usuário pode trocar para outra filial ou "— Sem filial —" conscientemente). Em **edição**, o `branch_id` atual do registro é respeitado (mesmo quando `null`). Hook `useClientBranchOptions` agora expõe `mainBranchId`.

### Adicionado (Seção 4.5.1 — PR #1 — 2026-04-27)
- **Tabela `client_branches`** (filiais por cliente) com RLS, índices únicos parciais e trigger de auditoria. Cada cliente pode ter múltiplas filiais com nome único (case-insensitive) e exatamente uma marcada como principal (`is_main`). FK `client_id` com `ON DELETE CASCADE`. Campos: `name`, `is_main`, `address`, `city`, `state`, `cep`, `phone`, `email`, `notes`. Reaproveita helpers existentes `is_staff`, `has_role`, `client_owns_record`, `audit_changes`, `update_updated_at_column` — zero função nova. RLS: staff (admin/manager/technician/financial) gerencia tudo; `client_master` lê/cria/edita filiais do próprio cliente; `client` apenas lê; somente admin pode excluir. Backfill idempotente: 32 filiais "Sede" criadas automaticamente (1 por cliente existente), copiando `address/city/state/zip_code` do cadastro do cliente. Base da Seção 4.5.1 do roadmap CMDB. **Sem alteração em outras tabelas e sem UI nesta PR** (PRs #2-#5 seguem na sequência).

### Adicionado (Seção 4.5.1 — PR #2 — 2026-04-27)
- **Aba "Filiais" em `ClientDetailPage`** com CRUD completo de `client_branches` (componente `ClientBranchesList` + hook `useClientBranches`). Tabela exibe Sede com badge `Star`, endereço/cidade/UF, contato (telefone/email) e ações de editar/excluir protegidas por `PermissionGate`. Form com switch de Sede, CEP/cidade/UF, endereço, telefone, email e observações. Bloqueio defensivo: não permite excluir a Sede se houver outras filiais. Tratamento explícito de violações de UNIQUE (`uniq_client_branches_main_per_client` e `uniq_client_branches_name_per_client`) com toasts amigáveis. Reaproveita `formatCEP`, `formatPhone`, `getErrorMessage`, `ConfirmDialog` — zero helper novo.
- **Função `merge_clients` atualizada** para migrar `client_branches` no merge, resolvendo conflitos de UNIQUE automaticamente: se ambos os clientes têm Sede, a Sede do source é rebaixada para filial comum (com nota explicativa); se houver nome homônimo no target, o nome da branch do source recebe sufixo " (migrada)". Restante da função preservado byte-a-byte. `client_branches` agora aparece em `refs_migrated` no audit log.
- **Busca automática de CEP no form de Filial via ViaCEP** (preenche endereço, cidade e UF ao sair do campo CEP). Em criação preenche tudo; em edição só sobrescreve quando o CEP foi alterado em relação ao salvo, caso contrário apenas completa campos vazios. Exibe spinner ao lado do label "CEP" durante a consulta. Implementação inline (`fetch` direto, sem secret, sem helper novo, sem edge function nova).

### Adicionado (Seção 4.5.1 — PR #3 — 2026-04-27)
- **Coluna `branch_id`** (FK nullable para `client_branches`, `ON DELETE SET NULL`) em `monitored_devices`, `assets` e `doc_devices`, com índice parcial `WHERE branch_id IS NOT NULL` em cada tabela. RLS atual preservada (apenas `ADD COLUMN`, sem reescrita de policies). Hook `useClientBranchOptions` reutiliza `useClientBranches` do PR #2 e expõe `{options, isLoading, isEmpty}` para dropdowns. Seletor "Filial" adicionado a 4 forms manuais: `AssetForm.tsx` (inventário global, reativo a `client_id`), `ClientAssetsList.tsx` (mini-form do cliente), `DocTableWorkstations.tsx` e `DocTableNetworkDevices.tsx` (documentação por cliente). Item especial "— Sem filial —" envia `null`. Edge functions de sync (`tactical-rmm-sync`, `unifi-sync`, `checkmk-sync`) **não foram tocadas** — registros vindos de sync ficam com `branch_id = NULL` até a Seção 4.5.3 evoluir o mapeamento automático por hostname/site_id.


### Modificado (housekeeping de roadmap — 2026-04-27)
- **`REFACTORING_ROADMAP.md`: housekeeping de consolidação.** Restaurados detalhes das Seções 5, 6, 7 que haviam ficado vagos durante a expansão das Seções 4.5-4.11. Seção 5 ganhou sub-itens 5.1 (5 componentes órfãos), 5.2 (hooks/utils órfãos), 5.3 (edge functions legadas: `send-notification`, `bootstrap-admin`, `sync-doc-devices`), 5.4 (schema legado: `ticket_history.old_status`), 5.5 (dívidas técnicas anteriores incluindo 3 `logic.ts` em edges, `UsersTab.tsx` 851 linhas, `ticket_categories` em 11%), 5.6 (áreas não auditadas) e 5.7 (ferramenta preventiva). Seção 6 ganhou sub-itens 6.1 a 6.6 (helpers duplicados, `_shared/webhook-validator.ts`, `_shared/device-sync.ts`, consolidação de 3 menus de fatura, Bug 10 do MergeClientsDialog, expansão de `_shared/`). Seção 7 ganhou sub-itens 7.1 (Auth Email Hook — ação manual no painel Supabase), 7.2 (movido para 4.11.3 — referência cruzada), 7.3 (rate limiting em endpoints públicos), 7.4 (4 dependências não usadas ~25KB), 7.5 (dívidas: paginação `useUsers`, sanitização PostgREST, retenção `audit_logs`, build error `npm:zod` em `manual-payment`). Adicionados itens nunca registrados explicitamente: **5.A** bug do IP público RMM (4.5.3.1), **5.B** edição real de e-mail no perfil (4.9.5), **5.C** Google Calendar sync (nova Seção 4.12), **5.D** recibo de pagamento ao cliente (4.6.6), **5.E** broadcast macro (4.8.6), **5.F** áreas não auditadas — `/tv-dashboard`, `/knowledge`, onboarding, mobile admin (5.6), **5.G** dependência ALTAHU em anexos do portal (4.7.6), **5.H** e **5.I** confirmados na Seção 3.
- **Decisão registrada — `invoice_notification_logs` MANTIDA**: tabela é ATIVAMENTE escrita por 4 edges em produção (`generate-monthly-invoices`, `notify-due-invoices`, `send-nfse-notification`, `_shared/notification-logger.ts`) e LIDA pelo painel `InvoiceNotificationHistory.tsx`. 0 rows hoje significa pipeline ainda não disparou em prod, **não** que código seja morto. Item de DROP que rondava em sessões anteriores fica oficialmente cancelado. Documentado em 5.4.



### Removido (Seção 4 — Lote B G12 — 2026-04-27)
- **`send-welcome-email` completo (edge function + trigger DB + função `trigger_send_welcome_email`)** — feature estava quebrada silenciosamente há meses (vault secrets não populados, `RAISE WARNING` engolido pelo `EXCEPTION` block, `net.http_post` nunca enfileirado). Validado por teste manual: INSERT em `clients` não gerou nenhuma entrada em `message_logs`/`application_logs`/`net.http_request_queue`. Será reimplementada na Seção 4.8 (Notificações) ou 4.9 (Hub Configuração) com chamada explícita do `create-client-user` (sem trigger DB + Vault). Achado registrado como dívida CRÍTICA em 4.11.2.

### Corrigido (Seção 4 — Lote B — 2026-04-27)
- **G3 — Notificação de pagamento confirmado ao cliente**: webhooks `webhook-asaas-nfse` e `webhook-banco-inter` agora disparam e-mail ao cliente quando confirmam pagamento (boleto/PIX). Helper inline `notifyClientPaymentConfirmed` reutilizado em ambos. Antes: webhooks atualizavam status no banco mas cliente nunca era notificado.
- **G5 — Push notifications para clientes**: `send-ticket-notification` agora inclui `client` e `client_master` no `role_filter` da chamada para `send-push-notification`. Antes: clientes estavam explicitamente excluídos do push do PWA.
- **G6 — `event_type: 'resolved'` em fechamento de chamado**: `TicketDetailsTab.tsx` agora envia `event_type: 'resolved'` (em vez de sempre `'updated'`) quando status transiciona para `resolved`/`closed`, fazendo o template de e-mail surfar o CTA de avaliação de satisfação.

### Adicionado (Seção 4 — fechamento — 2026-04-27)
- **Seções 4.7 a 4.11 abertas no `REFACTORING_ROADMAP.md`**: Portal do Cliente (UX + paridade), Notificações ao cliente final (Hub), Configurações (Hub Settings), Storage R2 + LGPD, Observabilidade interna. Cada seção com escopo detalhado em itens numerados.
- **Dívida CRÍTICA 4.11.2 — Validação de Vault secrets**: descoberta durante teste do welcome email (G12). Health-check deve validar se `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` estão populados em `vault.decrypted_secrets`. Padrão de falha silenciosa pode estar quebrando outras funções DB que usam `pg_net.http_post` — mapeamento será feito em 4.11.1.

### Adicionado (Seção 4 — fechamento — 2026-04-26)
- **Feature flags `departments_enabled` e `gamification_enabled`** (default `false`) para esconder UI dessas features até refatoração multi-tenant no remix SaaS futuro. Reaproveita o sistema `feature_flags` + `useFeatureFlag` da Seção 0.2.
- **Arquivo `PRODUCT_IDEAS.md`** registrando ideias para o remix SaaS futuro: multi-tenancy, refator de Departments e Gamificação tenant-scoped, e Camada 3 do Financeiro (IGPM/IPCA, hora extra, comissão, SPED, multi-empresa, multi-moeda).

### Modificado (Seção 4 — fechamento — 2026-04-26)
- **UI de Departments escondida via `useFeatureFlag('departments_enabled')`**: aba "Departamentos" em `/settings` (`SettingsPage.tsx`) e tab "Departamento" no diálogo de transferência de chamado (`TicketTransferDialog.tsx`) só aparecem quando flag ligada. Código, tabelas, RPCs e edges mantidos intactos.
- **UI de Gamificação escondida via `useFeatureFlag('gamification_enabled')`**: rota `/gamification` redireciona para `/` quando flag off (guard `GamificationGuard` em `AnimatedRoutes.tsx`); widget `TechnicianMiniRanking` no Dashboard retorna `null`; item "Gamificação" some do `AppSidebar`. Código, tabelas (`technician_points`, `technician_badges`, `badges`) e RPC `get_technician_ranking` mantidos intactos.
- **Seção 4 do `REFACTORING_ROADMAP.md` fechada** com 8 blocos auditados (doc_*, Inventário, Banking, Gamificação, Monitoring, Tickets Avançados, Departments, Calendar), 0 drops, 2 flags off. Multi-tenant decidido NÃO fazer neste projeto — remix futuro.
- **Seções 4.5 (CMDB — Documentação MSP de Clientes) e 4.6 (Financeiro MSP profissional) abertas** no roadmap com escopo detalhado em camadas. Dívidas adicionadas: investigação do uso de `ticket_categories` (Seção 5) — política de retenção de `audit_logs` já estava registrada na Seção 7.


### Corrigido (varredura E2E Seções 0+1 — 2026-04-26)
- **Filtro de auditoria agora inclui `auth.users`**: 5 registros pré-existentes (criação/exclusão/confirmação/email de usuários) ficaram visíveis no filtro de tabela em `/settings/audit-logs`.
- **Filtro "Até" inclui o dia inteiro**: era exclusivo de `00:00:00` da data selecionada; agora envia `T23:59:59.999Z` para capturar registros até o fim do dia.
- **Paginação de auditoria reseta para página 1 quando filtros mudam**: evita estado inválido (ex.: "Página 3 de 1") ao trocar tabela/ação/data/busca.
- **`useAuth.test.tsx` alinhado com implementação atual de `signUp`**: assertion agora aceita `emailRedirectTo: window.location.origin` (necessário para confirmação de e-mail). Suíte volta a 100% verde.

### Adicionado (varredura E2E Seções 0+1 — 2026-04-26)
- **Tooltip + botão copiar UUID** em `record_id` de `AuditLogRow` e `AuditLogDetail`. Resolução para nome humano (ex.: "Cliente AIRDUTO LTDA") deferida para Seção 2/3.

### Modificado (varredura E2E Seções 0+1 — 2026-04-26)
- **Paginação de auditoria mantém dados anteriores durante refetch** (`placeholderData: keepPreviousData`): elimina flicker do skeleton ao trocar página/filtro.

### Performance
- **Índices em FKs (item 1.5 — Phase 1)**: 34 índices adicionados em foreign keys de tabelas com volume real ou core do sistema (audit_logs, ticket_history, client_history, contract_history, invoice_generation_log, invoice_items, invoices, financial_entries, contract_services, contracts, client_contacts, tickets, ticket_comments, ticket_pauses, doc_sync_log, monitored_devices, sla_configs, nfse_history, knowledge_articles, technician_points). `EXPLAIN ANALYZE` confirmou shift para `Index Scan` em queries por `user_id` em `audit_logs` e `contract_id` em `invoice_generation_log`. Tabelas hoje vazias (doc_*, calendar_events, monitoring_*, etc.) deferidas para após a Seção 4 (decisão de manter/remover).

### Adicionado
- **Trilha de auditoria genérica (item 1.4)**: função `audit_changes()` (SECURITY DEFINER) reaproveitável + `sanitize_jsonb()` recursiva que redata chaves sensíveis (`password`, `secret`, `token`, `api_key` etc.). Triggers `audit_*_trigger` ativos em 6 tabelas sensíveis: `user_roles`, `invoices`, `contracts`, `clients`, `bank_accounts`, `integration_settings`.
- **RPC `list_audit_logs_with_user`** (admin-only, paginação real): retorna logs enriquecidos com nome/email do autor + `total_count` agregado para paginação.
- **Página `/settings/audit-logs`** (admin-only): listagem com filtros (tabela, ação, usuário, datas, busca), paginação 50/página e Sheet de detalhes com diff visual JSONB (added/removed/changed). 8 componentes modulares (`AuditLogsList`, `AuditLogRow`, `AuditLogFilters`, `AuditLogDetail`, `AuditLogDiff`) + hook `useAuditLogs` + lib pura `src/lib/audit-diff.ts`. Link discreto "Ver auditoria" no header da página `/settings/feature-flags`.
- **3 testes de integração** (`src/test/integration/audit-logs.test.ts`): diff de JSONB, propagação de filtros + paginação no RPC, derivação de `total` a partir do `total_count`.

### Modificado
- Função legada `log_integration_settings_changes` removida (zero referências externas confirmado) e substituída pela trigger genérica.

### Segurança
- Trilha de auditoria agora cobre todas as tabelas sensíveis identificadas no roadmap, com sanitização automática de campos contendo segredos antes da gravação em `audit_logs`. Política `INSERT/SELECT` admin-only em `audit_logs` mantida append-only (UPDATE/DELETE bloqueados).

### Adicionado
- **Sistema de Feature Flags** (`feature_flags` + `useFeatureFlag` + `/settings/feature-flags`): infraestrutura para ligar/desligar funcionalidades em runtime sem redeploy. Suporta rollout gradual (FNV-1a determinístico), filtro por role e whitelist por user_id. Apenas admin gerencia. Documentação em `FEATURE_FLAGS.md`.
- **Testes de integração dos 5 fluxos críticos** (`src/test/integration/`): rede de segurança com 15 testes (3 por fluxo: happy path, erro de input, erro de backend / edge case) cobrindo Login, criação de chamado, geração mensal de faturas, notificação de faturas a vencer e reenvio de confirmação. Stack: Vitest + jsdom + Testing Library + mock chainable do Supabase. Cobertura 77,77% statements / 60,78% branches nos arquivos-alvo. Suíte completa em ~7s, zero flakiness. Documentação em `TESTING.md`.
- **Helper puro `buildTicketPayload`** (`src/lib/ticket-payload.ts`): lógica de montagem do payload de criação de chamado extraída de `TicketForm.tsx` para ser unit-testável (sem renderizar o formulário multi-step).
- **Handlers puros das edge functions críticas** (`supabase/functions/{generate-monthly-invoices,notify-due-invoices,resend-confirmation}/logic.ts`): núcleo de decisão extraído em funções dependency-free (sem imports `npm:`) que recebem o supabase client por parâmetro. Os `Deno.serve` em `index.ts` permanecem como source-of-truth de produção.
- **`PageErrorBoundary`** (`src/components/common/PageErrorBoundary.tsx`): boundary local por página que captura crashes, registra em `application_logs` (módulo `ui`, ação `page_crash`, contexto rico) e mostra UI custom com "Tentar novamente" e "Voltar". Coexiste com o `LazyErrorBoundary` global como primeira linha de defesa.
- **Helper `unwrapEmbed`** (`src/lib/supabase-helpers.ts`): normaliza embeds do PostgREST que podem chegar como `T | T[] | null`, evitando crashes em páginas que assumem objeto único.
- **Teste de regressão da página de inadimplência** (`src/test/integration/delinquency-page.test.tsx`): 3 cenários (embed array, objeto, null) garantindo que `/billing/delinquency` nunca mais quebre por mudança no formato do embed.
- **Ferramentas administrativas de deduplicação de clientes** (item 1.2b do roadmap): coluna gerada `clients.normalized_document` (CNPJ apenas dígitos) + índice; RPCs `detect_duplicate_clients()`, `merge_clients(source, target, overrides)` e `delete_client_safely(client_id, preview)` (todas SECURITY DEFINER, admin-only). UI: `DuplicatesBanner` (alerta no topo de `/clients`), `MergeClientsDialog` (wizard 3 steps com estratégia híbrida B+A), `DeleteClientButton` (pré-check de bloqueios + confirmação por nome). Pré-check de CNPJ no `ClientForm` via `onBlur` + guarda final no submit. Lib pura `src/lib/client-merge.ts` com 9 testes unitários. Documentação em `ADMIN_TOOLS.md`.
- **Página `/settings/users` (Gestão de Usuários — item 1.3b)**: nova página dedicada admin-only com 6 componentes modulares (`UsersList`, `UserRow`, `UserActionsMenu`, `ChangeRoleDialog`, `CreateUserDialog`, `AnomaliesBanner`), todos abaixo de 50 linhas. Hook `useUsers` SaaS-ready com parâmetro `tenantId` opcional. Edge function `detect-auth-anomalies` agendada via `pg_cron` (diária 08:00 BRT) detectando órfãos, zumbis, signups em massa e contas inativas. Helper compartilhado `supabase/functions/_shared/auth-helpers.ts` com `requireRole`, `rateLimit`, `logAudit` e `jsonResponse`. Trigger `audit_user_roles_trigger` em `user_roles` registrando INSERT/UPDATE/DELETE em `audit_logs`. `handle_new_user` agora grava sucesso/falha em `application_logs` (módulo `auth`) em vez de `RAISE WARNING` silencioso.
- **Coluna Status na listagem de usuários** (`/settings/users`): cada linha exibe Confirmado / Pendente / Inativo derivado de `auth.users.email_confirmed_at` e `banned_until`.
- **RPC `list_users_for_admin`** (SECURITY DEFINER, admin-only): retorna profiles + papéis + cliente vinculado + status de auth em uma única chamada. Usada por `useUsers` no lugar de 3 queries separadas.
- **RPC `change_user_role`** (SECURITY DEFINER, admin-only): substitui papéis de um usuário de forma atômica (delete + insert dentro da função). Triggers de auditoria registram cada operação.

### Modificado
- `ClientForm.tsx`: adicionado `onBlur` no input de documento para detectar duplicata em tempo real e guarda final assíncrona no `onSubmit` exigindo confirmação humana antes de criar duplicata. Tratamento amigável do erro Postgres `23505` (violação da UNIQUE em `normalized_document`) com toast "CNPJ já cadastrado" em vez de mensagem técnica.
- **AIRDUTO LTDA mesclado** (item 1.2c): cadastro duplicado vazio (`35207c33...`) consolidado no canônico (`60ba285e...`) que concentra 1 contrato ativo, 1 chamado e 2 contatos.
- **VIZU EDITORA E DISTRIBUIDORA DE LIVROS LTDA mesclado** (item 1.2c): cadastro mais antigo (`8028b947...`) consolidado no canônico mais novo (`c9bab9b7...`), escolhido por possuir 2 contratos ativos. O único contato do source foi migrado para o target.
- **5 edge functions de gestão de usuários** (`create-user`, `create-client-user`, `delete-user`, `update-user-email`, `confirm-user-email`): permissões alinhadas via `requireRole` (admin para gestão de staff; staff completo para `create-client-user`), rate-limit 5 req/min por IP, registro padronizado em `audit_logs` e respostas de erro consistentes via `jsonResponse`.
- **`ChangeRoleDialog`**: usa a RPC atômica `change_user_role` em vez de `delete + insert` direto no client (evita estado inconsistente se o insert falhar entre as duas queries).
- **`AnomaliesBanner`**: passa a consumir a última entrada de `application_logs` (módulo `auth`, ação `detect_anomalies`) em vez de re-executar o scan completo a cada mount. Detecta também quando o cron não rodou nas últimas 25h. Botão "Verificar agora" continua invocando a edge function manualmente.
- **`AnomaliesBanner`**: erros na consulta agora propagam e renderizam banner vermelho de falha em vez de sumir silenciosamente.
- **Rota `/settings/users`**: restrita a `admin` (era `admin` + `manager`). Manager não tinha nenhuma ação executável e via tela quebrada.
- **`MergeClientsDialog`**: bloqueio explícito quando o grupo tem 3+ duplicatas, com instrução para mesclar em pares (suporte completo registrado como dívida na Seção 6).

### Corrigido
- **Página `/billing/delinquency` não carregava mais em produção** ("Erro ao carregar esta página"). Causa raiz: o embed `clients(...)` do supabase-js retornava ARRAY em runtime, mas o código acessava `inv.clients.id` / `client.client.name.toLowerCase()` como objeto, gerando `TypeError: Cannot read properties of undefined`. Corrigido com `unwrapEmbed` + tipagem `ClientRow` + guard descartando faturas órfãs com `console.warn`. Página movida de `src/pages/financial/` (legado) para `src/pages/billing/`. Pasta `financial/` removida.
### Removido
### Segurança
- **UNIQUE constraint em `clients.normalized_document` ativada** (item 1.2c): índice único parcial `uq_clients_normalized_document` (`WHERE normalized_document <> ''`). Substitui o índice não-único anterior `idx_clients_normalized_document`. Previne definitivamente o cadastro de dois clientes com o mesmo CNPJ. Erros de violação são tratados de forma amigável no `ClientForm`.
- **RLS append-only em `audit_logs`** (item 1.3b): políticas de `UPDATE` e `DELETE` bloqueadas para todos os roles, garantindo imutabilidade da trilha de auditoria. UNIQUE em `client_contacts.username` confirmada.
### Obsoleto

---

## [2026-04-24] — Estado atual pré-refatoração

Marco inicial do roadmap de refatoração. Esta entrada consolida o estado do sistema
antes do início das mudanças planejadas em `REFACTORING_ROADMAP.md`.

### Adicionado (estado consolidado)

- **Módulos ativos em produção:**
  - Autenticação e gestão de usuários (Supabase Auth + `user_roles` com RBAC)
  - Clientes, contatos e portal do cliente (com níveis `client` e `client_master`)
  - Contratos com cobranças adicionais, ajustes e SLA por contrato
  - Faturamento recorrente multi-provedor (Asaas, Banco Inter v3 com mTLS)
  - NFS-e via Asaas com fallbacks fiscais e auto-retry de notas estagnadas
  - Central de chamados (ITIL) com histórico, SLA, anexos, avaliação e atendimento unificado
  - Inventário de ativos integrado ao monitoramento via IP
  - Monitoramento (UniFi UDM, Tactical RMM, CheckMK)
  - Base de conhecimento com editor Markdown e categorias hierárquicas
  - Agenda/calendário com vínculos a entidades
  - Notificações multicanal (Push, E-mail via Resend, WhatsApp, Telegram)
  - Dashboards segmentados por papel + TV Dashboard

- **Infraestrutura:**
  - 103 tabelas no schema `public`, todas com RLS habilitada
  - 56 Edge Functions deployadas
  - 7 cron jobs ativos (geração de faturas, retries, sync de monitoramento, cleanup)
  - 14 secrets configurados (Resend, Banco Inter, Asaas, VAPID, webhooks etc.)
  - 6 storage buckets (nfse-files, certificates, email-assets, invoice-documents, ticket-attachments, knowledge-images)

- **Trabalho já concluído em sessões anteriores (rastreabilidade):**
  - Rastreabilidade de e-mails de cobrança (envio, abertura, falha)
  - Edge Function `resend-confirmation` para reenvio de confirmação (rate-limit 3/h)
  - Helpers consolidados em `_shared/email-helpers.ts`
  - Painel `InvoiceNotificationHistory` para auditoria de envios
  - Limpeza de 2 usuários órfãos em `auth.users`

### Segurança (estado consolidado)

- RLS ativa em 100% das tabelas do schema `public`
- Roles em tabela separada (`user_roles`) com função `has_role` SECURITY DEFINER
- Validação Zod em Edge Functions críticas
- Rate-limiting global de 10 req/s em endpoints públicos
- Idempotência de webhooks via tabela `webhook_events`
- Validação de assinatura HMAC em webhooks (Asaas, Inter, WhatsApp, Telegram, NFS-e)

### Obsoleto (identificado, não removido ainda)

- Edge Function `send-notification` (sem referências no código)
- Edge Functions `bootstrap-admin` e `sync-doc-devices` (uso legado)
- ~50 tabelas vazias do módulo `doc_*` (decisão pendente)
- 5 componentes React órfãos (~1.300 linhas)
- 13 componentes shadcn/ui instalados sem uso

### Pontos conhecidos pré-refatoração

- `auth-email-hook` deployado mas silencioso (webhook "Send Email Hook" não configurado no painel Supabase)
- `information_schema.triggers` retornando 0 resultados — investigar `pg_trigger` para confirmar integridade do `handle_new_user` e auditorias
- `/billing/delinquency` com double-wrap de `AppLayout` e cálculo de aging divergente do widget
- Faltam índices em FKs de `tickets` e `invoices`
- Helpers `formatDate` e `formatCurrency` duplicados em múltiplos arquivos
- Validação HMAC duplicada em 4 Edge Functions

### Backup associado a este marco

- **Backup nativo do Supabase:** a ser baixado manualmente pelo usuário via painel — ver `BACKUP_PROCEDURE.md`. **É o backup definitivo para rollback.**
- **Backup CSV complementar:** `/mnt/documents/backups/backup_2026-04-24.tar.gz` (140 KB, 103 tabelas, 2026-04-24 20:42 UTC) — apenas dados, não substitui o nativo.

### Documentos criados nesta data

- `CHANGELOG.md` (este arquivo)
- `REFACTORING_ROADMAP.md`
- `BACKUP_PROCEDURE.md`
