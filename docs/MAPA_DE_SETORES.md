# Mapa de Setores - Central de Suporte Pro

## 1. Visao Geral

A Central de Suporte Pro (codinome Colmeia) e uma plataforma MSP (Managed Service Provider) que integra suporte tecnico (chamados/SLA), gestao de clientes e documentacao tecnica de TI, faturamento com cobranca (boleto/PIX) e NFS-e, monitoramento de rede (RMM/UniFi/CheckMK), contratos com reajuste, base de conhecimento, portal do cliente, gamificacao, relatorios e um painel administrativo completo de configuracao. O sistema cobre o ciclo de ponta a ponta do MSP: do convite de usuario a emissao fiscal, do alerta de dispositivo offline ao reajuste anual de contrato, com notificacao multicanal (email/WhatsApp/Telegram/push) em todos os fluxos relevantes.

### Stack Tecnologica

- **Frontend**: React + TypeScript, Vite (SWC, chunking manual), Tailwind + shadcn/ui, React Query (@tanstack/react-query), FullCalendar, recharts, date-fns, react-hook-form + Zod.
- **Backend**: Supabase (projeto `silefpsayliwqtoskkdz`) - Postgres + RLS, Auth (JWT), Storage, Realtime, ~60 Edge Functions Deno.
- **PWA**: vite-plugin-pwa/Workbox + service worker manual de push (`public/sw-push.js`), Web Push VAPID.
- **Banco**: 163 migrations SQL, 109 tabelas, 6 views, 17 enums, ~120 funcoes/RPC, ~90 triggers, 314 policies RLS; tipos gerados em `src/integrations/supabase/types.ts`.
- **Integracoes externas**: Asaas, Banco Inter, Resend, Evolution API (WhatsApp), Telegram Bot, Google Calendar, Tactical RMM, CheckMK, UniFi (cloud/direct via relay Hermes), ReceitaWS, Banco Central (SGS), Lovable Email, Supabase Vault.
- **Testes**: Vitest (mocks chainable do Supabase, logic.ts de 4 edge functions). Sem CI/typecheck no pipeline atual.

---

## 2. Indice de Setores

| Setor | Responsabilidade resumida | Maturidade | Integracoes |
|---|---|---|---|
| Autenticacao, Usuarios e Permissoes | Identidade, login, convites, RBAC granular, deteccao de anomalias | parcial | Supabase Auth, Resend, Lovable Email, pg_cron |
| Chamados / Tickets e SLA | Ciclo de vida de chamados, atendimento, SLA, notificacao multicanal | parcial | Resend/SMTP, Evolution, Telegram, Web Push, Postgres |
| Clientes e Documentacao Tecnica | CRUD de clientes, dossie tecnico em 14 secoes, sync de dispositivos | parcial | ReceitaWS, Tactical RMM, UniFi, validate-whatsapp |
| Contratos e Reajustes | Reajuste anual, indices economicos, renegociacao | parcial | BCB SGS, Asaas (indireto), pg_cron |
| Faturamento e Cobranca | Geracao de faturas, boleto/PIX, NFS-e, inadimplencia | parcial | Asaas, Banco Inter, Resend, WhatsApp, poll-services |
| NFS-e e Certificados Digitais | Emissao/cancelamento de NFS-e, certificados A1 | parcial | Asaas API, Resend, WhatsApp, Supabase Storage, node-forge |
| Monitoramento e Servicos (RMM/UniFi/CheckMK) | Agregacao de devices/alertas de 3 fontes externas | parcial | Tactical RMM, CheckMK, UniFi, Evolution, Telegram, Resend |
| Notificacoes e Comunicacao | Entrega multicanal e rastreamento de status | parcial | Resend, Evolution, Telegram, Web Push, Svix |
| Calendario e Agendamento | Agenda interna da equipe, OAuth Google (desconectado do CRUD) | parcial | Google Calendar API v3 |
| Inventario | Ativos e licencas de software, visao geral de monitoramento | precisa-revisao | Supabase Postgres, RPC get_license_key |
| Base de Conhecimento | Artigos Markdown, busca, feedback, sugestoes em chamados | parcial | Supabase Storage |
| Relatorios, Dashboards e Exportacao | Dashboards, relatorios, TV Dashboard, exportacao CSV/Excel/JSON | parcial | Nenhuma externa direta (recharts) |
| Gamificacao | Ranking de tecnicos, badges, metas (read-only) | precisa-revisao | Nenhuma |
| Portal do Cliente | Area autenticada do cliente: chamados, financeiro, avaliacao | parcial | Supabase Auth/Postgres, RPC open_client_portal_ticket |
| Configuracoes, Feature Flags e UI de Integracoes | Centro de config, flags, UI de todas as integracoes | parcial | Todas (UI), Supabase Storage |
| Auditoria, Seguranca e Logs | Trilha de auditoria, logs de app, detector de anomalias | parcial | Supabase Auth Admin, pg_cron |
| Banco de Dados, Migrations e Schema | Schema versionado, RLS, RPCs, Vault | solido | Supabase Auth, Vault, todas as integracoes (schema) |
| Infraestrutura, Build, PWA e Testes | Build, PWA, shell de UI, cliente Supabase, testes | parcial | Supabase, Web Push, Workbox, Lovable |

---

## 3. Setores

### 3.1 Autenticacao, Usuarios e Permissoes

**Responsabilidade**: Identidade e controle de acesso: login (email/username), recuperacao/troca de senha, convites (staff e cliente) em vez de cadastro publico, bootstrap do primeiro admin, gestao de usuarios, RBAC granular por modulo/acao com overrides, e deteccao de anomalias de cadastro.

**Frontend**
- Paginas: `src/pages/Login.tsx`, `src/pages/Register.tsx`, `src/pages/ForgotPassword.tsx`, `src/pages/ResetPassword.tsx`, `src/pages/Setup.tsx`, `src/pages/SetupAccount.tsx`, `src/pages/Unauthorized.tsx`, `src/pages/settings/UsersPage.tsx`, `src/pages/settings/SettingsPage.tsx`, `src/pages/profile/ProfilePage.tsx`.
- Componentes: `src/components/auth/ProtectedRoute.tsx`, `src/components/auth/PermissionGate.tsx`, `src/components/users/*` (UsersList, UserActionsMenu, ChangeRoleDialog, CreateUserDialog, AnomaliesBanner), `src/components/settings/*` (UsersTab, PendingInvitesTab, InviteClientDialog, InviteStaffDialog, ActivateInviteDialog, UserProfileSheet).
- Hooks: `useAuth.tsx`, `usePermissions.ts`, `usePermissionOverrides.ts`, `useSecureAction.ts`, `useUsers.ts`, `usePendingInvitesCount.ts`.

**Backend**
- Edge functions: bootstrap-admin, create-user, invite-user, activate-invite-manually, resend-invite, revoke-invite, delete-user, update-user-email, confirm-user-email, reset-password, forgot-password, resolve-username, resend-confirmation, detect-auth-anomalies, auth-email-hook, mais helpers `_shared/auth-helpers.ts` / `_shared/email-helpers.ts` / `_shared/email-templates/*`.
- Tabelas: auth.users, profiles, user_roles, role_permission_overrides, pending_invites, client_contacts, clients, audit_logs, application_logs, notifications, message_logs, email_settings, company_settings.

**Integracoes**: Supabase Auth; send-email-resend (Resend) para convites/avisos; auth-email-hook -> Lovable Email API (emails transacionais nativos de Auth); pg_cron + pg_net (deteccao de anomalias).

**Fluxo de dados**: Login -> (username) resolve-username -> signInWithPassword -> onAuthStateChange -> fetchUserData (profiles + user_roles) -> AuthProvider expoe roles/isStaff/isAdmin -> ProtectedRoute autoriza rota -> PermissionGate/usePermissions controlam UI (com overrides). Convite: invite-user (pending_invites + email) -> /setup-account -> get_invite_info -> signUp (trigger enforce_invite_on_signup) -> accept_invite (cria role+client_contacts+profile). Gestao: list_users_for_admin, change_user_role, edges de delete/reset/confirm via service_role.

**Dependencias internas**: Clientes (client_contacts/clients), Notificacoes/Email, Auditoria/Logs, Layout/Navegacao (isStaff/isAdmin/roles), Portal do Cliente (redirect /portal apos accept_invite).

**Observacoes / Riscos**
- Duplicacao de surfaces de gestao de usuarios: `/settings` (UsersTab, admin+manager) vs `/settings/users` (UsersPage, admin-only) com UIs e queries divergentes.
- Bug de assinatura de `logAudit` nas edges de convite (invite/resend/revoke/activate): auditoria de convites quebrada e silenciada.
- Cron de `detect-auth-anomalies` ausente nas migrations (so unschedule); AnomaliesBanner tende a "stale" permanente.
- `handle_new_user` insere role 'client' default; create-user pode deixar usuario staff com role 'client' residual.
- ProfilePage aba Permissoes ignora overrides; avatar upload e edicao de email nao implementados na UI.
- `usePermissionOverrides` usa cache global em modulo (risco de leitura stale ao trocar de usuario).
- `verify_jwt=false` em forgot-password/resolve-username/resend-confirmation/bootstrap-admin/update-user-email/auth-email-hook; rate limiters in-memory (nao distribuidos).
- resolve-username expoe email real sem autenticacao (vetor de enumeracao).
- Dois caminhos de email de recovery (Resend custom vs auth-email-hook nativo) - risco de duplicidade.
- `change_user_role` e destrutiva (DELETE all + INSERT um) e sem guard de "ultimo admin".
- Tipo `AppRole` declarado em 3 lugares (drift).

**Checklist de verificacao**
- [ ] Definir surface oficial de gestao de usuarios e consolidar a duplicada; alinhar permissoes de acesso.
- [ ] Testar fluxo completo de convite staff e cliente (invite-user -> accept_invite -> role/redirect corretos).
- [ ] Validar que create-user nao deixa role 'client' residual; adicionar limpeza se necessario.
- [ ] Confirmar existencia do cron `detect-auth-anomalies-daily` (`SELECT * FROM cron.job`); agendar se ausente.
- [ ] Corrigir e testar `logAudit` nas edges de convite.
- [ ] Conferir RLS de application_logs (SELECT admin) para o AnomaliesBanner.
- [ ] Validar RLS de role_permission_overrides e alinhar aba Permissoes do ProfilePage para usar `can`.
- [ ] Testar login por username e avaliar exposicao de email (captcha/rate-limit mais forte).
- [ ] Testar reset de senha por admin nos dois modos e o fluxo forcado em ResetPassword.tsx.
- [ ] Determinar qual caminho envia email de recovery em producao (forgot-password vs auth-email-hook).
- [ ] Testar enforce_invite_on_signup (signup sem convite deve falhar; bootstrap/service_role passa).
- [ ] Verificar try_bootstrap_admin sob concorrencia e cleanup do perdedor.
- [ ] Adicionar guard contra remocao do ultimo admin em change_user_role e UsersTab.
- [ ] Validar token refresh do useAuth (margem, safety timeout, revalidacao de aba).
- [ ] Garantir tratamento de email sintetico `.internal` em forgot/reset.

---

### 3.2 Chamados / Tickets e SLA

**Responsabilidade**: Ciclo de vida de chamados externos/internos e tarefas: criacao, fila, atendimento com cronometro/sessoes, pausas, transferencia, resolucao com tempo e KB, avaliacao, e SLA em horario comercial. Inclui notificacao multicanal e alertas de violacao de SLA e rotina de "sem contato".

**Frontend**
- Paginas: `src/pages/tickets/TicketsPage.tsx`, `src/pages/tickets/NewTicketPage.tsx`.
- Componentes: `src/components/tickets/*` (TicketForm, TicketDetails, TicketDetailsTab, TicketCommentsTab, TicketHistoryTab, TicketAttendancePanel, TicketPauseDialog, TicketResolveDialog, TicketTransferDialog, TicketRatingDialog, NoContactButton, SLAIndicator, TicketsKanbanView, TicketStatsBar, TicketFilters, AssetSelectionDialog, shared/DeviceSelector).
- Hooks: `useTicketAttendance.ts`, `useTechnicianTicketCount.ts`, `useTechnicianList.ts`, `useSavedViews.ts`, `useClientMonitoredDevices.ts`.

**Backend**
- Edge functions: send-ticket-notification, notify-sla-breach, check-no-contact-tickets.
- Tabelas: tickets, ticket_history, ticket_comments, ticket_attendance_sessions, ticket_pauses, ticket_time_entries, ticket_categories/subcategories/tags/tag_assignments, sla_configs, company_settings, client_notification_rules, clients, client_contacts, profiles, user_roles, notifications, integration_settings, knowledge_articles, monitored_devices, assets.

**Integracoes**: Resend/SMTP, Evolution (WhatsApp), Telegram, Web Push, Postgres+RLS, pg_cron (esperado, nao confirmado).

**Fluxo de dados**: Criacao via RPC `create_staff_ticket` (atomico) -> fire-and-forget send-ticket-notification (apenas 'external'). Atendimento via TicketAttendancePanel/useTicketAttendance manipulando sessions/pauses. SLA (display): SLAIndicator + `src/lib/sla-calculator.ts` (tempo util client-side). SLA (alertas)/no-contact: notify-sla-breach e check-no-contact-tickets leem tickets e gravam notifications.

**Dependencias internas**: Clientes/Contatos, Configuracoes/Integracoes (business_hours, sla_configs), Auth/Permissoes, Base de Conhecimento, Monitoramento, Ativos, Notificacoes.

**Observacoes / Riscos**
- **CRITICO**: `tickets.sla_deadline` NUNCA e escrito -> notify-sla-breach processa zero chamados; alertas de SLA inoperantes; metricas de SLA do Dashboard/reports sempre vazias/100%.
- Duas nocoes de SLA desconexas (sla_deadline absoluto vs calculo client-side em sla-calculator.ts) que nunca convergem.
- Gap de notificacao na resolucao: TicketResolveDialog (botao Encerrar) nao invoca send-ticket-notification; so o dropdown de status dispara 'resolved'.
- 3 edges nao listadas em config.toml -> herdam verify_jwt=true; notify-sla-breach e check-no-contact-tickets sao cron (confirmar JWT service-role, senao 401).
- Agendamento nao versionado (pg_cron ausente nas migrations).
- Escrita duplicada de historico de atendimento (useTicketAttendance vs TicketsPage).
- SLAIndicator faz 3-4 queries por linha; query de pauses sem staleTime (N+1).
- check-no-contact usa updated_at (qualquer edicao reseta o relogio de 24h/48h).
- notify-sla-breach so notifica in-app se houver assigned_to (chamados na fila sem alerta).
- TicketRatingDialog renderizado mas `isRatingOpen` nunca setado para true (codigo morto).

**Checklist de verificacao**
- [ ] Decidir e implementar preenchimento de `sla_deadline` (trigger) OU reescrever notify-sla-breach com a logica de sla-calculator.ts.
- [ ] Rodar notify-sla-breach manualmente e validar a hipotese de 0 chamados processados.
- [ ] Padronizar resolucao para que tanto o dialog quanto o dropdown disparem send-ticket-notification.
- [ ] Verificar agendamento/JWT de notify-sla-breach e check-no-contact-tickets (testar chamada sem JWT -> 401).
- [ ] Conferir RLS de tickets e tabelas relacionadas (tecnico/cliente).
- [ ] Testar concorrencia de inicio de atendimento (sessao orfa).
- [ ] Validar consistencia entre as duas logicas de iniciar atendimento.
- [ ] Validar calculo de SLA em horario comercial (fora do expediente, pausas).
- [ ] Confirmar auto-resume de pausas 'no_contact'.
- [ ] Verificar precedencia de sla_config no SLAIndicator (cliente+categoria > cliente > categoria > prioridade).
- [ ] Confirmar acessibilidade do TicketRatingDialog (codigo morto?).
- [ ] Testar que apenas 'external' dispara notificacao (internal/task nao).
- [ ] Conferir taxa de falhas de escrita best-effort de ticket_history.

---

### 3.3 Clientes e Documentacao Tecnica

**Responsabilidade**: Cadastro de clientes (CRUD, busca, cursor, merge de duplicatas, filiais) e Documentacao Tecnica de TI em 14 secoes (infra, links, estacoes/servidores, rede, CFTV, licencas, softwares/ERP, dominios, credenciais, contatos, seguranca/VLAN/firewall/VPN, prestadores, rotinas). Inclui alertas de vencimento, sync via Tactical RMM/UniFi, lookup CNPJ e export PDF.

**Frontend**
- Paginas: `src/pages/clients/ClientsPage.tsx`, `src/pages/clients/ClientDetailPage.tsx`.
- Componentes: `src/components/clients/*` (ClientForm, ClientDocumentation, DuplicatesBanner, MergeClientsDialog, ClientBranchesList, ClientNetworkTab, DocDeviceLinkDialog, DocDeviceManualLinkDialog, documentation/DocSectionSecurity, DocTableCredentials, DocTableLicenses, DocSyncStatusBar, DocAlertsPanel, DocPdfExport).
- Hooks: `useDocSection.ts`, `useDocTableCrud.ts`, `useDocAlerts.ts`, `useDocSync.ts`, `useDocDeviceSync.ts`, `useDocPdfGenerator.ts`, `useClientBranches.ts`, `useClientBranchOptions.ts`, `useClientMonitoredDevices.ts`, `useDocCredentialOptions.ts`.

**Backend**
- Edge functions: cnpj-lookup, check-doc-expiries, sync-doc-devices.
- Tabelas: clients, client_branches, client_technicians, client_external_mappings, doc_* (22 tabelas incl. orfas doc_backup_solutions/doc_antivirus_solutions), doc_alerts, doc_sync_log, assets, monitored_devices, unifi_controllers, integration_settings, notifications, audit_logs, client_history.

**Integracoes**: ReceitaWS (cnpj-lookup), Tactical RMM (sync-doc-devices -> doc_devices), UniFi (direct + cloud), Asaas/NFS-e (indireto via ClientForm), validate-whatsapp.

**Fluxo de dados**: UI -> hooks (React Query) -> supabase-js direto nas doc_* (RLS). Sync: useDocSync -> sync-doc-devices (le mappings/settings, chama TRMM/UniFi, upsert com mergeWithProtection, grava doc_sync_log). Alertas: check-doc-expiries varre doc_* -> doc_alerts + notifications. CNPJ: cnpj-lookup -> ReceitaWS. Merge: detect_duplicate_clients + merge_clients (SECURITY DEFINER, admin).

**Dependencias internas**: Ativos/Inventario, Monitoramento de Rede, Operacoes/Mapeamentos, Notificacoes, Faturamento/Contratos (merge migra contracts/invoices/tickets), Auth/Permissoes, NFS-e/Asaas.

**Observacoes / Riscos**
- **RISCO ALTO (perda de dados)**: `merge_clients` NAO migra tabelas doc_*; o DELETE do source (CASCADE) apaga toda a documentacao tecnica do cliente mesclado, silenciosamente.
- **SEGURANCA**: `doc_credentials.password_encrypted` e `mfa_backup_code` em texto plano (nome enganoso); DocTableCredentials copia senha crua para clipboard.
- Bug de cache: `useDocSync.invalidateAll()` usa prefixo 'doc-table' que nao casa com as queryKeys reais -> tabelas nao re-renderizam pos-sync.
- Tabelas orfas doc_backup_solutions/doc_antivirus_solutions (codigo/esquema morto).
- PDF incompleto: useDocPdfGenerator hardcoda `firewallRules: []`.
- cnpj-lookup sem token/rate-limit/timeout (risco de 429 na ReceitaWS).
- Merge limitado a pares (UX manual com 3+ duplicatas).
- check-doc-expiries O(N) com risco de reabrir alertas resolvidos; cron nao encontrado nas migrations.
- Componentes muito grandes (ClientForm 30KB, DocSectionSecurity 36KB, DocTableLicenses 34KB).
- Casts `as any`/`as never` difusos nos hooks doc_*.
- Filtro 'sem cobranca' so olha a pagina atual (cursor).

**Checklist de verificacao**
- [ ] Reproduzir merge com documentacao tecnica e corrigir merge_clients para migrar doc_* antes do DELETE.
- [ ] Auditar doc_credentials (texto plano); decidir cifra (pgp_sym_encrypt + Vault) e mascarar clipboard.
- [ ] Validar invalidacao de cache pos-sync; alinhar queryKeys de useDocSync.invalidateAll.
- [ ] Conferir RLS de cada doc_* (is_staff vs client_owns_record).
- [ ] Verificar agendamento e auth do cron check-doc-expiries.
- [ ] Testar check-doc-expiries (criar/atualizar/resolver doc_alerts sem duplicar/reabrir).
- [ ] Validar cnpj-lookup com valido/invalido e sob 429; adicionar timeout.
- [ ] Confirmar tratamento de erro do sync-doc-devices (TRMM nao mapeado, UniFi sem controller) com doc_sync_log status error.
- [ ] Decidir destino das tabelas orfas.
- [ ] Corrigir useDocPdfGenerator para buscar doc_firewall_rules.
- [ ] Testar merge de grupo com 3+ duplicatas.
- [ ] Verificar mergeWithProtection (campos manuais preservados; flag +manual).

---

### 3.4 Contratos e Reajustes

**Responsabilidade**: Reajuste anual e renegociacao: configura indice (IGPM/IPCA/INPC/FIXO) e data, aplica reajustes sobre valor mensal e servicos, registra historico, dispara lembretes (D-30/D-7/D-0/vencido), auto-aplica FIXO. Busca indices do BCB (SGS).

**Frontend**
- Paginas: `src/pages/contracts/ContractsPage.tsx`, `NewContractPage.tsx`, `EditContractPage.tsx`.
- Componentes: `src/components/contracts/*` (ContractAdjustmentCard, ContractAdjustmentDialog, ContractRenegotiationDialog, ContractAdjustmentConfigSheet, ContractAdjustmentHistoryList, sections/ContractAdjustmentSection, NextAsaasInvoicePreview, ContractForm), `src/components/billing/EconomicIndicesWidget.tsx`.
- Hooks: `useContractAdjustmentHistory.ts`, `useLatestEconomicIndex.ts`.

**Backend**
- Edge functions: apply-contract-adjustment, check-contract-adjustments, fetch-economic-indices.
- Tabelas: contracts, contract_adjustments, contract_services, contract_history, economic_indices, notifications, user_roles, clients.

**Integracoes**: Banco Central SGS (IGPM=189, IPCA=433, INPC=188), Asaas (indireto via NextAsaasInvoicePreview), pg_cron + pg_net.

**Fluxo de dados**: Config via ContractForm/ConfigSheet (update direto em contracts). Aplicacao manual: ContractAdjustmentDialog faz mutation client-side (INSERT contract_adjustments + UPDATE contracts/services + INSERT history) - NAO usa a edge. Automatico/lembretes: check-contract-adjustments -> (FIXO D-0) apply-contract-adjustment, senao notifications + history. Indices: fetch-economic-indices -> BCB -> upsert economic_indices.

**Dependencias internas**: Contratos (CRUD base), Faturamento/Billing, Notificacoes, Autenticacao/Roles, Historico de contrato.

**Observacoes / Riscos**
- **DUPLICACAO CRITICA**: logica de reajuste em dois lugares (edge apply-contract-adjustment vs mutation client-side no Dialog); a UI usa a client-side e nunca chama a edge.
- Inconsistencia: edge nao grava `applied_by` nem `adjustment_percentage`; reajuste manual nao-FIXO zera o percentual.
- Agendamento ausente no codigo (sem cron.schedule para os dois jobs nas migrations).
- RLS x UI: botoes Aplicar/Renegociar aparecem para qualquer staff, mas RLS restringe a admin/financial -> erro de RLS visivel.
- Consistencia monthly_value x servicos: editar servicos depois pode sobrescrever o valor reajustado.
- `verify_jwt=false` nas 3 edges; apply-contract-adjustment usa service role e aceita contract_id+index_value de qualquer chamador.
- Datas com timezone misto (UTC vs +T12:00:00) - off-by-one nos buckets D-30/D-7/D-0.
- Idempotencia: FIXO D-0 nao grava registro de idempotencia (risco de reaplicar 2x).
- Strings magicas duplicadas (FIXO, roles, series BCB, FREQ_MONTHS).

**Checklist de verificacao**
- [ ] Confirmar (cron.job) jobs check-contract-adjustments e fetch-economic-indices; agendar se ausentes.
- [ ] Definir fonte unica da regra de reajuste (eliminar duplicacao edge vs client-side).
- [ ] Testar fluxo manual completo (IGPM via UI) e coerencia das tabelas/timeline.
- [ ] Testar auto-aplicacao FIXO (1x, sem duplicar em segunda execucao).
- [ ] Validar RLS: staff nao admin/financial deve ter botoes ocultos/desabilitados.
- [ ] Conferir RLS de economic_indices e contract_adjustments/history.
- [ ] Proteger edges com verify_jwt ou validacao de secret/cron header.
- [ ] Validar fetch-economic-indices vs API BCB e calculo accumulated_12m com 13 meses.
- [ ] Testar interacao reajuste x edicao de servicos (nao reverter reajuste).
- [ ] Verificar buckets de lembrete em fronteiras de fuso e cron pulando um dia.
- [ ] Validar try/catch por item no check (um erro nao aborta os demais).
- [ ] Garantir usuarios com role admin/financial para notificacoes.

---

### 3.5 Faturamento e Cobranca (Invoices/Boletos)

**Responsabilidade**: Gera, processa e cobra faturas: geracao mensal por contrato (frequencias mensal a anual), boleto/PIX via provedor (Asaas padrao, Inter legado), NFS-e acoplada, notificacao de cobranca, multa/juros, renegociacao, segunda via, baixa manual e inadimplencia. Coordena subprocessos via status granulares em invoices.

**Frontend**
- Paginas: `src/pages/billing/BillingPage.tsx`, `DelinquencyReportPage.tsx`.
- Componentes: `src/components/billing/*` (BillingInvoicesTab, InvoiceActionsPopover, InvoiceInlineActions, InvoiceTableRow, InvoiceForm, NewInvoiceDialog, ManualPaymentDialog, RenegotiateInvoiceDialog, SecondCopyDialog, RegenerateBoletoDialog, PixCodeDialog, InvoiceProcessingHistory, InvoiceNotificationHistory, StatusBadges, InvoiceStatusFilter, CancelInvoiceAlertDialog).
- Hooks: `useInvoices.ts`, `useInvoiceActions.ts`, `useBillingCounters.ts`, `useBatchProcessing.ts`, `useInvoiceFilters.ts`, `src/lib/billing-fsm.ts`, `src/lib/currency.ts`.

**Backend**
- Edge functions: generate-monthly-invoices, generate-invoice-payments, batch-process-invoices, batch-collection-notification, calculate-invoice-penalties, auto-retry-failed-boletos, notify-due-invoices, manual-payment, renegotiate-invoice, generate-second-copy, resend-payment-notification, admin-cancel-asaas-payment.
- Tabelas: invoices, invoice_items, invoice_generation_log, invoice_notification_logs, contracts, contract_additional_charges, contract_services, clients, nfse_history, financial_entries, integration_settings, audit_logs, application_logs, notifications, message_logs, user_roles.

**Integracoes**: Asaas (asaas-nfse), Banco Inter (banco-inter, legado), Resend, Evolution (WhatsApp), poll-services (status de pagamento).

**Fluxo de dados**: UI -> hooks -> edges (generate-monthly-invoices no cron cria invoice + asaas-nfse + email; acoes manuais via asaas-nfse/manual-payment/renegotiate/second-copy/resend/batch). Status macro + boleto/nfse/email_status granulares; webhooks externos + poll-services fecham o ciclo (status='paid').

**Dependencias internas**: Contratos (fonte da geracao), Clientes, NFS-e, Integracoes/Settings, Notificacoes/Email/WhatsApp, Financeiro, Permissoes, Conciliacao bancaria.

**Observacoes / Riscos**
- **INCONSISTENCIA DE ENUM (bug real)**: enum `nfse_processing_status` = pendente|gerada|erro, mas generate-monthly-invoices grava `nfse_status='processando'` (fora do enum) -> UPDATE falha; FSM tambem assume valores inexistentes.
- FSM (`billing-fsm.ts`) divergente do schema (testa 'gerado'/'enviado'/'autorizada' que nao existem no enum real).
- Duplicacao de logica de geracao de pagamento em 3 lugares (generate-monthly, generate-invoice-payments, useInvoiceActions.handleEmitComplete).
- Dead code de provider Inter (branch inalcancavel, sub-menu Inter, defaults 'banco_inter') contradiz a decisao Asaas-only.
- auto-retry-failed-boletos e admin-cancel-asaas-payment sem referencia no frontend (so cron/reconciliacao); crons nao versionados.
- Calculo de multa/juros duplicado em 3 lugares (2% + 1% a.m.).
- admin-cancel-asaas-payment grava audit_logs com colunas entity_type/entity_id/metadata divergentes do resto.
- useBillingCounters usa `notes` como heuristica fragil de boleto pendente.
- notify-due-invoices nao cobre 'overdue' (sem regua escalonada automatica).
- renegotiate-invoice usa MAX(invoice_number)+1 (race condition vs serial).
- DelinquencyReport subestima Total Vencido (ignora fine/interest).
- Componentes deprecated removidos; comentarios stale; redirects de compat em BillingPage.
- batch-process-invoices sem idempotencia (pode duplicar cobranca no Asaas).
- invoices e "tabela-deus" (48 colunas) sem sincronizacao garantida entre status macro/granular.

**Checklist de verificacao**
- [ ] Confirmar enum nfse_processing_status no DB e auditar writes a nfse_status (provar falha de :821/:1150).
- [ ] Verificar enums boleto/email_processing_status e validar writes.
- [ ] Testar geracao mensal end-to-end (manual e cron).
- [ ] Validar logica de frequencia (intervalos, multiplicacao do recorrente, charges nao multiplicados).
- [ ] Conferir existencia/agendamento de todos os crons de billing.
- [ ] Auditar RLS de invoices/items/logs/financial_entries; conferir checagem de role nas edges (generate-invoice-payments e notify/batch-collection NAO checam).
- [ ] Validar que admin-cancel-asaas-payment nao checa auth/role e colunas de audit_logs.
- [ ] Reproduzir race de invoice_number na renegotiate.
- [ ] Testar bloqueio de artefatos (NFS-e sem PDF/XML, boleto em processamento).
- [ ] Validar poll-services + confirmacao de pagamento e invalidacao de cache.
- [ ] Unificar/validar as 3 implementacoes de multa/juros; corrigir DelinquencyReport.
- [ ] Validar signed URLs de boleto (buckets, expiracao, http vs storage path).
- [ ] Verificar duplicidade em batch-process-invoices.
- [ ] Decidir sobre dead branches do Banco Inter.
- [ ] Conferir cancelInvoiceMutation (normalizacao de status, nfse_history 'resolvido', cancelamento no provedor).

---

### 3.6 NFS-e e Certificados Digitais

**Responsabilidade**: Emissao, acompanhamento, cancelamento, arquivamento e compartilhamento de NFS-e via Asaas, com sync por webhook/polling e PDF/XML. Inclui cadastro/validacao de certificados A1 (parse .pfx/.p12, cripto de senha) e dashboard de validade. A emissao fiscal e delegada ao Asaas; o certificado local serve hoje como registro/monitoramento.

**Frontend**
- Paginas: `src/pages/billing/BillingPage.tsx` (BillingNfseTab), `src/pages/settings/CertificateDashboardPage.tsx`, `CompanyTab.tsx` + `CertificateManager.tsx`.
- Componentes: `src/components/billing/nfse/*` (NfseDetailsSheet, NfseAvulsaDialog, NfseProcessingIndicator, NfseShareMenu, NfseLinkExternalDialog, NfseEventLogsDialog, NfseTributacaoSection, details/NfseEditForm, NfseCancelDialog, NfseArchiveDialog, nfseValidation, nfseFormat), `src/components/nfse/ServiceCodeForm.tsx`/`ServiceCodeSelect.tsx`, `src/components/settings/CertificateManager.tsx`, `AsaasConfigForm.tsx`.
- Hooks: `useInvoiceActions.ts`, `useInvoices.ts`, `useBillingCounters.ts`; logica inline (sem useNfse/useCertificate dedicados); useCheckNfseStatus inline.

**Backend**
- Edge functions: asaas-nfse (monolito ~2689 linhas, emissao + pagamento), webhook-asaas-nfse, send-nfse-notification, certificate-vault, parse-certificate, poll-services.
- Tabelas: nfse_history, nfse_event_logs, nfse_service_codes, certificates, company_settings (nfse_* e legados certificado_*), invoices, contracts, clients, integration_settings, webhook_events, invoice_notification_logs, notifications, user_roles, application_logs.

**Integracoes**: Asaas API (sandbox/producao), Resend, WhatsApp/Evolution, Supabase Storage (certificates, nfse-files), node-forge (PKCS12).

**Fluxo de dados**: UI -> asaas-nfse (emit/...) com service_role -> ensureCustomerSync -> resolve municipalServiceId -> nfse_history ('processando') -> POST /invoices -> espelha invoices.nfse_status. Webhook-asaas-nfse atualiza status, baixa PDF/XML, auto-emite NFS-e em PAYMENT_RECEIVED. Polling: poll-services / check_single_status. Compartilhamento: send-nfse-notification gera signed URLs. Certificados: CertificateManager -> parse-certificate + certificate-vault(encrypt) -> certificates + bucket.

**Dependencias internas**: Faturamento/Billing, Contratos, Clientes, Configuracoes/Integracoes, Notificacoes, Monitoramento/poll-services.

**Observacoes / Riscos**
- Duplicacao de fonte de dados de certificado: CertificateManager grava em `certificates`; CertificateDashboardPage le `company_settings.certificado_*` (nao escritos) -> dashboard mostra "Nao Configurado".
- Codigo morto: acao 'decrypt' do certificate-vault e a senha criptografada nunca sao consumidas (emissao usa o certificado no proprio Asaas).
- Promessa nao implementada: "verificacao diaria" e alertas 30/15/7 dias de validade de certificado nao existem (sem edge/cron).
- Inconsistencia de path de storage: webhook grava 'nfse/<id>.pdf', check_single_status grava 'nfse-files/...'; send-nfse-notification so assina paths 'nfse-files/' -> links do webhook podem quebrar.
- config.toml incompleto (asaas-nfse, webhook-asaas-nfse, parse-certificate, certificate-vault); webhook precisa de verify_jwt=false.
- asaas-nfse roda 100% com service_role sem validar JWT/role; parse-certificate sem auth.
- Monolito (NFS-e + cobranca no mesmo arquivo).
- STATUS_MAP divergente (CANCELLATION_DENIED -> 'autorizada' vs 'erro').
- Hardcodes (URL do projeto, codigo '010701', CPF de teste).
- Auto-emissao no webhook nao verifica resultado antes de marcar auto_nfse_emitted.
- Campos NFS-e Nacional 2026 (danfse_url, chave_acesso etc.) nao populados.

**Checklist de verificacao**
- [ ] Unificar fonte de verdade do certificado (dashboard le `certificates` ou Manager popula `company_settings`).
- [ ] Confirmar verify_jwt do webhook (false) e das demais; declarar em config.toml.
- [ ] Testar emissao avulsa e a partir de fatura em sandbox.
- [ ] Simular webhook (AUTHORIZED/ERROR/CANCELED) e validar nfse_history/PDF/XML/idempotencia.
- [ ] Validar que PDF/XML do webhook (path 'nfse/...') consiga ser assinado/enviado; corrigir prefixo.
- [ ] Conferir RLS de `certificates` (senha_hash nunca exposta) e bucket restrito.
- [ ] Validar bloqueio de send-nfse-notification sem pdf_url/xml_url.
- [ ] Testar fluxo de erro E0014 (DPS duplicada) e Vincular Nota Existente.
- [ ] Confirmar auto-emissao em PAYMENT_RECEIVED (idempotencia + tratamento de falha).
- [ ] Reconciliar STATUS_MAP entre webhook e check_single_status.
- [ ] Decidir sobre a cadeia morta de certificado (remover decrypt ou implementar consumidor).
- [ ] Implementar ou remover o job diario de validade de certificado.
- [ ] Testar cancelamento (15-500 chars) e arquivamento soft-delete.
- [ ] Conferir timeout/erro do parse-certificate (.pfx grandes, senha incorreta).

---

### 3.7 Monitoramento e Servicos (RMM/UniFi/CheckMK)

**Responsabilidade**: Centraliza monitoramento de devices de clientes (MSP), agregando 3 fontes (Tactical RMM, CheckMK, UniFi) em monitored_devices e gerando monitoring_alerts com notificacao multicanal. Exibe status online/offline, alertas e uptime, e permite abrir ticket de um alerta. NOTA: poll-services (financeiro), ServiceForm e useServiceCodeUsageStats nao pertencem ao dominio RMM.

**Frontend**
- Paginas: `src/pages/monitoring/MonitoringPage.tsx`.
- Componentes: `src/components/monitoring/GroupedAlertsTable.tsx`, `UptimeCharts.tsx`, `src/components/services/ServiceForm.tsx`, config forms (TacticalRmm/CheckMk/Unifi), `ClientMappingsTab.tsx`, `IntegrationStatusPanel.tsx`.
- Hooks: `useUnifiedNetworkDevices.ts`, `useUnifiedRealtime.tsx`, `useDocDeviceSync.ts`, `useDocSync.ts`, `useServiceCodeUsageStats.ts`.

**Backend**
- Edge functions: tactical-rmm-sync, checkmk-sync, unifi-sync, send-alert-notification, poll-services (financeiro), sync-doc-devices; relay-unifi.ts (worker Deno externo em LXC, nao edge function).
- Tabelas: monitored_devices, monitoring_alerts, unifi_controllers, network_sites, network_topology, unifi_sync_logs, integration_settings, client_external_mappings, doc_devices, doc_sync_log, notifications, message_logs, client_notification_rules, profiles, user_roles, services, nfse_history.

**Integracoes**: Tactical RMM (X-API-KEY), CheckMK (Bearer), UniFi direct (cookie) / cloud (api.ui.com) / UniFi OS via Tailscale (relay), Evolution, Telegram, Resend.

**Fluxo de dados**: Sync edges buscam devices, resolvem client_id via client_external_mappings, upsert monitored_devices, criam/resolvem monitoring_alerts (UniFi grava network_sites/topology/sync_logs). UDMs direct sincronizados pelo relay-unifi.ts via RPCs unifi_relay_*. INSERT em monitoring_alerts -> trigger notify_on_monitoring_alert -> send-alert-notification. UI le via React Query.

**Dependencias internas**: Clientes, Configuracoes/Integracoes, Tickets (abrir ticket de alerta), Notificacoes/Mensageria, Auth/Permissoes, Faturamento/NFS-e (dominio distinto agrupado aqui).

**Observacoes / Riscos**
- Escopo misturado: poll-services/ServiceForm/useServiceCodeUsageStats sao financeiro/NFS-e, nao RMM.
- Inconsistencia de realtime: comentarios dizem que realtime e tratado por useUnifiedRealtime, mas este so assina tickets/notifications -> tela de monitoramento nao atualiza em tempo real.
- Tipagem fraca: onAcknowledge obrigatorio mas passado undefined sem permissao -> crash potencial.
- Duplicacao de renderizacao de linha de alerta no GroupedAlertsTable.
- Seguranca: password_encrypted/cloud_api_key_encrypted usados como texto puro (sem cripto real).
- Agendamento ausente no repo para os 3 syncs (so manual/relay externo).
- Matching fragil em useUnifiedNetworkDevices (nome/MAC; unifi_device_id ignorado).
- Dedup divergente entre tactical (sem filtro de title) e checkmk (com title).
- tactical resolve TODOS os alertas ativos ao voltar online (fecha alertas alheios).
- device_type inconsistente entre fontes.
- handleRefresh usa .single() (mascara "nao configurado").

**Checklist de verificacao**
- [ ] Confirmar RLS de monitored_devices/monitoring_alerts (cliente nao ve de outros).
- [ ] Testar notificacao de alerta (trigger -> send-alert-notification -> message_logs).
- [ ] Validar tratamento de alert.level ausente e clientId null.
- [ ] Verificar scheduler dos 3 syncs (senao so atualizam no clique manual).
- [ ] Corrigir/implementar realtime de monitoramento ou remover comentarios enganosos.
- [ ] Adicionar guard onAcknowledge opcional.
- [ ] Auditar cripto real de password_encrypted/cloud_api_key_encrypted.
- [ ] Testar worker relay-unifi.ts (RUNBOOK_HERMES, sem service_role).
- [ ] Validar matching de useUnifiedNetworkDevices.
- [ ] Alinhar resolucao de alertas tactical vs checkmk.
- [ ] Conferir handleRefresh com integracao nao-configurada (.maybeSingle()).
- [ ] Reclassificar poll-services/ServiceForm/useServiceCodeUsageStats.
- [ ] Validar paginacao/limites (alertas 50, devices sem limite).
- [ ] Conferir indices (N+1 nos loops de sync).

---

### 3.8 Notificacoes e Comunicacao

**Responsabilidade**: Entrega multicanal (in-app, Web Push, email Resend, WhatsApp Evolution, Telegram) e rastreamento de status. Centraliza helpers de email/log e recebe webhooks de status (Resend/Telegram/WhatsApp) que atualizam message_logs e a supressao de emails. Inclui o sino in-app (notifications) e preferencias de canal.

**Frontend**
- Paginas/host: `src/pages/profile/ProfilePage.tsx` (aba Notificacoes), `src/components/layout/AppLayout.tsx` (NotificationDropdown), `DelinquencyReportPage.tsx`, `BillingInvoicesTab.tsx`.
- Componentes: `src/components/notifications/NotificationDropdown.tsx`, `src/components/profile/NotificationSettings.tsx`, `PushPermissionBlockedCard.tsx`, `public/sw-push.js`, `_shared/email-helpers.ts`, `_shared/notification-logger.ts`.
- Hooks: `useNotifications.tsx`, `usePushNotifications.ts`, `useUnifiedRealtime.tsx`.

**Backend**
- Edge functions: send-notification (codigo morto), send-email-resend, send-push-notification, send-whatsapp, send-telegram, validate-whatsapp, batch-collection-notification, webhook-resend-status, webhook-telegram-status, webhook-whatsapp-status.
- Tabelas: notifications, push_subscriptions, message_logs, invoice_notification_logs, integration_settings, email_settings, email_templates, company_settings, suppressed_emails, webhook_events, audit_logs, application_logs, profiles.

**Integracoes**: Resend, Evolution (WhatsApp), Telegram Bot, Web Push/VAPID, Svix (webhooks Resend).

**Fluxo de dados**: Gatilho de negocio le preferencias (profiles/integration_settings) e chama os senders de baixo nivel -> message_logs com external_message_id. Status volta via webhooks (UPDATE por external_message_id; suppressed_emails em bounce). Sino in-app: INSERT em notifications -> useUnifiedRealtime -> invalida useNotifications -> dropdown re-renderiza. Push: usePushNotifications subscribe -> push_subscriptions; send-push-notification criptografa e faz POST ao endpoint.

**Dependencias internas**: Chamados/Tickets, Faturamento/Cobranca, Monitoramento, Configuracoes/Integracoes, Perfil/Auth.

**Observacoes / Riscos**
- Codigo morto: send-notification (orquestrador) sem chamadores; logica duplicada inline nos gatilhos.
- Bug: BillingInvoicesTab invoca batch-collection-notification com `{status:'pending'}` mas a function exige `{invoice_ids, channels}` -> 400; parsing da resposta tambem nao bate.
- Gap de supressao: send-email-resend NUNCA consulta suppressed_emails antes de enviar.
- Inconsistencia de preferencias: localPrefs (push/som/tipos) so em localStorage, nunca chegam ao backend.
- VAPID_PUBLIC_KEY hardcoded em 2 arquivos.
- Duplicacao de logica de envio (send-whatsapp/telegram dedicados e reimplementados em send-notification).
- webhook-telegram-status e no-op funcional (Telegram sem read receipts).
- send-push-notification implementa cripto Web Push manual (~500 linhas, sem testes), envio sequencial (risco de timeout).
- CORS inconsistente entre senders.
- send-whatsapp so loga com userId.
- batch-collection-notification passa `client.id` inexistente e `client.name` como userId.
- Idempotencia do webhook Resend depende de ordem do insert em webhook_events.
- rateLimitMap in-memory por instancia.

**Checklist de verificacao**
- [ ] Corrigir payload de "Notificar em lote" (status vs invoice_ids/channels) e parsing.
- [ ] Fazer send-email-resend consultar suppressed_emails e bloquear bounced/complained.
- [ ] Conferir RLS de push_subscriptions/notifications/message_logs/suppressed_emails.
- [ ] Testar Web Push fim-a-fim (subscribe -> testar -> sw-push.js -> limpeza 404/410).
- [ ] Confirmar VAPID_PRIVATE/PUBLIC correspondentes; testar rotacao.
- [ ] Validar assinatura Svix do webhook Resend (com/sem secret -> fail-closed).
- [ ] Validar auth dos webhooks telegram/whatsapp (fail-closed sem secret).
- [ ] Verificar mapeamento de ACKs Evolution em webhook-whatsapp-status.
- [ ] Testar idempotencia e nao-regressao de status do webhook Resend.
- [ ] Decidir destino de send-notification (remover ou adotar).
- [ ] Avaliar persistir localPrefs em profiles.
- [ ] Conferir user_id/recipient em batch-collection-notification.
- [ ] Stress test do send-push-notification (loop sequencial).
- [ ] Confirmar que useUnifiedRealtime e o unico assinante de notifications.

---

### 3.9 Calendario e Agendamento

**Responsabilidade**: Agenda interna da equipe (visitas, reunioes, plantoes, indisponibilidades, eventos pessoais) via FullCalendar, com criar/mover/excluir eventos vinculaveis a clientes. Existe OAuth Google Calendar, mas a sincronizacao nao esta conectada ao CRUD da agenda.

**Frontend**
- Paginas: `src/pages/calendar/CalendarPage.tsx`.
- Componentes: `src/components/calendar/FullCalendarWrapper.tsx`, `EventForm.tsx`, `EventDetailsSheet.tsx`, `src/components/settings/integrations/GoogleCalendarConfigForm.tsx`.
- Hooks: React Query inline, `usePermissions.ts`, `useAuth.ts`, `use-mobile.ts`, `useFormPersistence.ts`, `useIntegrationSettings.ts`.

**Backend**
- Edge functions: `supabase/functions/google-calendar/index.ts`.
- Tabelas: calendar_events, google_calendar_integrations, integration_settings, clients (read-only), invoices (FK invoice_id nao usada).

**Integracoes**: Google Calendar API v3 (OAuth2: auth_url, callback, sync_event, delete_event).

**Fluxo de dados**: UI -> useQuery le calendar_events direto (RLS) -> FullCalendar. Insert/update/delete diretos na tabela. FLUXO SEPARADO: GoogleCalendarConfigForm -> google-calendar action auth_url -> Google -> callback grava tokens. As acoes sync_event/delete_event existem mas nenhuma tela as chama.

**Dependencias internas**: Auth/Roles (requireStaff), Permissoes (modulo 'calendar'), Clientes, Configuracoes/Integracoes, Layout.

**Observacoes / Riscos**
- Sincronizacao Google nao plugada no CRUD (sync_event/delete_event sao codigo morto na pratica).
- Edicao inexistente: EventDetailsSheet.onEdit nunca passado; EventForm so faz insert; canEdit nunca usado.
- Enum 'billing_reminder' e coluna invoice_id parcialmente abandonados; indice removido.
- EventForm cria start/end no mesmo dia (sem suporte a cruzar meia-noite; sem validar end > start).
- Timezone: new Date local vs edge assume America/Sao_Paulo.
- Cores duplicadas/inconsistentes entre componentes.
- google_calendar_integrations guarda tokens em texto plano; disconnect nao revoga no Google.
- Edge nao valida JWT/identidade para sync_event/delete_event.
- Sem realtime; reminder_sent nunca usado (coluna morta).

**Checklist de verificacao**
- [ ] Confirmar RLS de calendar_events (tecnico so proprios; manager ve todos).
- [ ] Testar criacao via EventForm (timezone do start/end gravado vs exibido).
- [ ] Testar drag & drop e resize (persistencia e revert em erro).
- [ ] Validar evento all_day movido.
- [ ] Testar exclusao (somente proprio via RLS).
- [ ] Validar OAuth Google ponta a ponta (gravacao com refresh_token).
- [ ] Decidir/implementar sync no insert/update/delete.
- [ ] Verificar tratamento de erro da edge (settings ausente/inativo, refresh falho).
- [ ] Conferir se o callback OAuth e processado (handler de ?code parece ausente).
- [ ] Avaliar tokens em texto plano e ausencia de revoke; verificar verify_jwt.
- [ ] Limpar artefatos mortos (billing_reminder, invoice_id, reminder_sent, onEdit, canEdit).
- [ ] Validar /calendar com requireStaff (cliente nao acessa).
- [ ] Unificar mapas eventTypeColors/Labels duplicados.

---

### 3.10 Inventario

**Responsabilidade**: Inventario de TI dos clientes: ativos (computadores, servidores, switches) e licencas de software (com mascaramento de chave). Aba "Visao Geral" agrega monitoramento (online/offline, alertas, licencas a vencer), permite abrir ticket de dispositivo offline/alerta e reconhecer alertas.

**Frontend**
- Paginas: `src/pages/inventory/InventoryPage.tsx`.
- Componentes: InventoryPage, `InventoryOverview.tsx`, `AssetForm.tsx`, `LicenseForm.tsx`, `DocDeviceLinkDialog.tsx`, `PermissionGate.tsx`, `confirm-dialog.tsx`.
- Hooks: React Query inline, `use-toast`, `useDebounce`, `useFormPersistence`, `useClientBranchOptions`, `useAuth`.

**Backend**
- Edge functions: nenhuma.
- Tabelas: assets, software_licenses, software_licenses_safe (view), clients, monitored_devices, monitoring_alerts, audit_logs (via get_license_key), doc_devices.

**Integracoes**: Supabase Postgres direto, RPC get_license_key (SECURITY DEFINER, admin-only, grava audit_logs), monitoramento (monitored_devices/monitoring_alerts), modulo Tickets (deep-link /tickets?action=new).

**Fluxo de dados**: UI (tabs Visao Geral/Ativos/Licencas/Garantias) -> useQuery/useMutation inline -> PostgREST. Licencas via view safe; revelar chave via get_license_key -> audit_logs. Visao Geral agrega monitored_devices + monitoring_alerts + software_licenses.

**Dependencias internas**: Clientes, Monitoramento, Tickets, Auth/Permissoes (modulo 'inventory'), Auditoria.

**Observacoes / Riscos**
- **BUG CRITICO (runtime)**: InventoryPage seleciona colunas inexistentes na view software_licenses_safe (license_key, max_activations, current_activations, status) -> erro PostgREST quebra a aba Licencas.
- Inconsistencia de tipos: type/map usam total_licenses/used_licenses que o select nao pede.
- Mascaramento incoerente: InventoryOverview le tabela base software_licenses em vez da view safe.
- AssetForm Select de tipo nao inclui 'software'/'license' (presentes no enum).
- Aba 'Garantias' e placeholder estatico.
- Cast desnecessario de ip_address.
- Permissoes divergentes: inventory.view inclui client/client_master, mas /inventory usa requireStaff.
- deleteLicenseMutation sem tratamento de FK (license_assets).
- acknowledgeMutation sem onError.
- Duplicacao de query ['clients-select'] e contagem de licencas a vencer.
- Invalidacao de cache: forms nao invalidam ['inventory-counters'].

**Checklist de verificacao**
- [ ] Corrigir o select da view software_licenses_safe para as colunas reais.
- [ ] Validar que used/total e expire_date renderizam valores reais.
- [ ] Conferir RLS de assets e software_licenses (technician/manager/client).
- [ ] Validar RPC get_license_key (nao-admin -> exception; admin -> chave + audit).
- [ ] Testar criar ativo -> DocDeviceLinkDialog vincula a doc_devices.
- [ ] Validar security_invoker da view safe e GRANT.
- [ ] Testar "Abrir Ticket" (pre-preenchimento dos params).
- [ ] Testar "Reconhecer" alerta (update + invalidacao + onError).
- [ ] Verificar consistencia entre Visao Geral (tabela) e Licencas (view safe).
- [ ] Conferir editar ativo 'software'/'license' (ausentes no Select).
- [ ] Testar exclusao de licenca com FK.
- [ ] Validar persistencia de rascunho (license_key fora do storage).

---

### 3.11 Base de Conhecimento (Knowledge Base)

**Responsabilidade**: Artigos/documentacao tecnica do MSP: staff cria/edita/fixa/categoriza/publica artigos em Markdown (com upload de imagens); usuarios buscam, leem, votam e navegam por categorias. Alimenta sugestoes na abertura de chamados e recebe artigos gerados ao resolver chamados.

**Frontend**
- Paginas: `src/pages/knowledge/KnowledgePage.tsx`, `KnowledgeArticlePage.tsx`.
- Componentes: `src/components/knowledge/*` (ArticleViewer, ArticleForm, MarkdownEditor, MarkdownPreviewRenderer, KnowledgeArticleList, KnowledgeCategoryGrid, KnowledgePinnedCarousel, KnowledgeHero, ArticleFeedback, ArticleTableOfContents).
- Hooks: `useDebounce`, `useFormPersistence` + DraftRecoveryBanner, `useAuth`, `useToast`, React Query inline.

**Backend**
- Edge functions: nenhuma.
- Tabelas: knowledge_articles, knowledge_categories, article_feedback, ticket_categories (join legado), storage.objects (bucket knowledge-images).

**Integracoes**: Supabase Storage (bucket publico knowledge-images).

**Fluxo de dados**: UI -> supabase-js direto -> tabelas com RLS (is_staff/is_public/owner). Triggers mantem contadores e slug. Upload direto ao Storage; URL publica inserida como Markdown. KBSuggestions e TicketResolveDialog tocam knowledge_articles diretamente.

**Dependencias internas**: Tickets (KBSuggestions, TicketResolveDialog), Auth/Permissoes (modulo 'knowledge', requireStaff), Layout, ticket_categories (FK legada).

**Observacoes / Riscos**
- RPC `increment_article_views` NAO existe -> sempre cai no catch com update nao-atomico (race condition).
- Inconsistencia de rota vs visibilidade: /knowledge/:slug e requireStaff, mas KBSuggestions linka para clientes (barrados); is_public tem efeito pratico limitado.
- Artigos criados via TicketResolveDialog usam category_id legado e client_id, nunca knowledge_category_id (nao aparecem no grid, is_public=false).
- MarkdownPreviewRenderer e parser caseiro por regex: risco de XSS (href/src com javascript:/data: sem allowlist).
- Codigo morto: botao Compartilhar sem onClick, cards relacionados sem handler, atalho ⌘K decorativo, not_helpful_count nunca exibido.
- Busca usa ilike; indice GIN full-text portugues ocioso.
- Filtro .or() por interpolacao sem escaping (quebra com virgula/parenteses/%).
- calculateReadingTime/excerpt limpam HTML mas conteudo e Markdown.
- generate_slug depende de unaccent (verificar extensao).

**Checklist de verificacao**
- [ ] Confirmar/criar RPC increment_article_views (atomica) ou remover branch morto.
- [ ] Testar fluxo cliente -> sugestao -> /knowledge/:slug (hoje bloqueado por requireStaff); decidir rota publica para is_public.
- [ ] Validar as 3 policies de knowledge_articles.
- [ ] Validar RLS de article_feedback (UNIQUE article_id,user_id) e knowledge_categories.
- [ ] Conferir politicas do bucket knowledge-images (upload por authenticated).
- [ ] Verificar extensao unaccent (slug); testar titulos com acentos.
- [ ] Testar triggers de contadores (article_count, helpful/not_helpful).
- [ ] Testar busca com caracteres especiais; considerar textSearch.
- [ ] Decidir migracao dos artigos criados via TicketResolveDialog.
- [ ] Auditar XSS do MarkdownPreviewRenderer (sanitizacao/allowlist ou react-markdown).
- [ ] Remover/implementar UI morta (Compartilhar, relacionados, ⌘K, not_helpful_count).

---

### 3.12 Relatorios, Dashboards e Exportacao

**Responsabilidade**: Camada analitica e de exportacao: dashboard da home, pagina de Relatorios (chamados, horas, financeiro, desempenho, adicionais), relatorio gerencial por cliente, TV Dashboard rotativo, e exportacao CSV/Excel/JSON. Nao gera dados proprios: consome RPCs e queries diretas, renderizando com recharts.

**Frontend**
- Paginas: `src/pages/Dashboard.tsx`, `src/pages/reports/ReportsPage.tsx`, `src/pages/tv-dashboard/TVDashboardPage.tsx`.
- Componentes: `src/components/dashboard/*`, `src/components/reports/*` (TimeReportTab, AdditionalChargesReportTab, ClientManagementReport), `src/components/export/ExportButton.tsx`, `src/lib/export.ts`.
- Hooks: useQuery direto; `useAuth` para gating.

**Backend**
- Edge functions: nenhuma.
- Tabelas: tickets, clients, ticket_ratings, ticket_time_entries, profiles, invoices, nfse_history, monitored_devices, monitoring_alerts, calendar_events, ticket_history, technician_points (via get_technician_ranking).

**Integracoes**: Nenhuma externa direta (recharts/date-fns sao UI). Dados financeiros sao leituras de tabelas alimentadas por outros setores.

**Fluxo de dados**: useQuery -> client Supabase. Dois padroes: RPCs agregadoras SECURITY DEFINER (get_ticket_report_stats, get_invoice_report_stats, get_technician_ranking, get_weekly_ticket_trend, get_additional_charges_report, get_client_management_report) e queries count/select diretas agregadas em JS. Exportacao client-side via Blob.

**Dependencias internas**: Chamados/Tickets (fonte primaria), Clientes, Faturamento/Financeiro, Gamificacao, Monitoramento, Agenda, Auth/Roles.

**Observacoes / Riscos**
- Bug/codigo quebrado em AdditionalChargesReportTab: tipos `AdditionalChargesReportTabProps`/`ReportData` nao declarados/importados (so nao quebra o build porque type-check nao roda).
- Type-check nao aplicado: build e so `vite build`; tsconfig raiz nao inclui src; tsconfig.app.json falha por vitest/globals (TS2688).
- Risco de seguranca: RPCs financeiras SECURITY DEFINER sem guarda de role (so ProtectedRoute no front); se GRANT for para authenticated, client poderia obter agregados globais. Excecao: get_client_management_report tem guarda.
- Duplicacao de KPI (tempo medio de resposta, status, CSAT, SLA, ranking) em multiplos lugares.
- Duplicacao de formatacao de moeda (3 caminhos).
- exportToExcel nao escapa TSV; sem protecao contra CSV injection.
- TVDashboard usa casts frageis e ordena priority como string.
- Aba 'Servicos' placeholder.
- exportConfigs possivelmente nao usados.
- Inconsistencia de calculo de SLA (cliente vs DB) entre Dashboard/Reports/ClientManagement.
- TVDashboard 24/7 exige sessao sempre valida.
- Limites .limit(200/500) truncam metricas silenciosamente.

**Checklist de verificacao**
- [ ] Declarar/importar os tipos em AdditionalChargesReportTab e confirmar render.
- [ ] Corrigir pipeline de type-check e adicionar `tsc --noEmit` ao build/CI.
- [ ] Auditar GRANT EXECUTE das RPCs de relatorio (especialmente financeiro) ou adicionar guarda de role.
- [ ] Testar acesso a /reports e /tv-dashboard como client/technician (redirect).
- [ ] Invocar get_invoice_report_stats como client (deve negar/vazio).
- [ ] Validar exportacao com valores contendo virgula/aspas/tab/quebra; abertura no Excel.
- [ ] Adicionar protecao contra CSV injection (= + - @).
- [ ] Validar get_client_management_report como client_master proprio vs de outro cliente.
- [ ] Conferir consistencia numerica do SLA entre as 3 telas.
- [ ] Revisar limites .limit() sob alta volumetria; mover agregacoes para RPCs.
- [ ] Confirmar consumidores de exportConfigs; remover se morto.
- [ ] Decidir destino da aba 'Servicos'.
- [ ] Verificar TV Dashboard com sessao expirada e ordenacao por severidade.

---

### 3.13 Gamificacao

**Responsabilidade**: Ranking de tecnicos por pontos, catalogo de badges e metas ativas. Setor de leitura: agrega pontos de technician_points via RPC e lista badges/metas. Protegido por feature flag (gamification_enabled) e restrito a staff.

**Frontend**
- Paginas: `src/pages/gamification/GamificationPage.tsx`.
- Componentes: GamificationPage, `TechnicianMiniRanking.tsx`, AnimatedRoutes (GamificationGuard), AppSidebar (item), `TicketRatingDialog.tsx` (unico ponto de escrita).
- Hooks: `useFeatureFlag.ts`, React Query inline.

**Backend**
- Edge functions: nenhuma.
- Tabelas: technician_points, badges, gamification_goals, technician_badges, profiles (join no RPC), feature_flags.

**Integracoes**: nenhuma.

**Fluxo de dados**: UI -> get_technician_ranking (technician_points JOIN profiles) + from('badges')/from('gamification_goals'). Escrita de pontos so via TicketRatingDialog (rating>=4 -> insert technician_points). Sem edge function nem integracao externa.

**Dependencias internas**: Tickets (avaliacao = unica fonte de pontos), Auth/Permissions, Feature Flags, Dashboard, Profiles (full_name como identidade).

**Observacoes / Riscos**
- Majoritariamente read-only/decorativo; sem trigger/edge que conceda pontos por SLA/resolucao.
- **BUG CRITICO de RLS**: TicketRatingDialog e usado no portal do cliente; policy 'System can add points' exige is_staff -> insert bloqueado para client/client_master, e o erro e engolido (sem if(error)) -> no fluxo mais comum (cliente avaliando) pontos nunca sao concedidos.
- technician_badges e progresso de metas sao codigo morto funcional (Progress hardcoded 0).
- Inconsistencia de icones (seed usa trophy/award/book-open que caem no fallback).
- Ranking usa full_name como chave (homonimos mesclados; key colide).
- Inconsistencia de periodo: GamificationPage all-time (epoch) vs MiniRanking periodo do dashboard.
- get_technician_ranking SECURITY DEFINER sem filtro de role (controle so na rota/flag).
- Sem testes.

**Checklist de verificacao**
- [ ] Reproduzir avaliacao pelo portal e confirmar bloqueio do insert; mover concessao para RPC/trigger SECURITY DEFINER.
- [ ] Adicionar verificacao de erro no insert de technician_points.
- [ ] Validar policy de technician_points e o fluxo real de avaliacao.
- [ ] Conferir mapeamento badgeIcons vs badges.icon reais.
- [ ] Verificar (in)existencia de mecanismo de concessao de badges/metas; implementar ou remover UI morta.
- [ ] Testar getLevelProgress/getLevel em fronteiras (500/1500/3500/7000) e negativos/zero.
- [ ] Testar ranking com tecnicos homonimos; avaliar incluir user_id no RPC.
- [ ] Confirmar comportamento da feature flag (rota/sidebar/mini-ranking).
- [ ] Validar acesso ao get_technician_ranking (SECURITY DEFINER ignora RLS).
- [ ] Decidir filtro de periodo do ranking principal.

---

### 3.14 Portal do Cliente

**Responsabilidade**: Area autenticada para client/client_master: abrir chamados (via RPC), acompanhar status em abas, trocar comentarios publicos e avaliar chamados. Para client_master, aba Financeiro (faturas, boleto/PIX, NFS-e) e visao "Todos os chamados da empresa".

**Frontend**
- Paginas: `src/pages/client-portal/ClientPortalPage.tsx` (rota /portal).
- Componentes: `src/pages/client-portal/components/*` (ClientPortalHeader, ClientPortalNav, ClientTicketsList, ClientTicketDetailPanel, NewTicketDialog, portal-types), `src/components/client-portal/*` (ClientTicketForm, ContactBlock, ClientPortalFinancialTab), reuso de TicketRatingDialog/KBSuggestions/DeviceSelector.
- Hooks: `useAuth.tsx`, `useClientMonitoredDevices.ts`, `useFormPersistence.ts`, React Query inline.

**Backend**
- Edge functions: NENHUMA chamada diretamente (gap): abertura usa RPC `open_client_portal_ticket`; comentarios via INSERT direto.
- Tabelas: client_contacts, clients, tickets, ticket_categories, ticket_comments, ticket_history, contracts, assets, monitored_devices, profiles, invoices, nfse_history, user_roles.

**Integracoes**: Supabase Auth/Postgres+RLS, RPC open_client_portal_ticket (SECURITY DEFINER), boleto/PIX/NFS-e como CONSUMO de URLs ja gravadas, ALTAHU (planejado).

**Fluxo de dados**: UI resolve client_contacts->clients pelo user_id -> queries filtradas por client_id (RLS). Abertura: ClientTicketForm -> open_client_portal_ticket (valida contato/role/tamanhos/FKs) -> INSERT tickets (origin='portal') + history. Comentarios: INSERT direto (is_internal=false). Financeiro (client_master): le invoices/nfse_history. Avaliacao: TicketRatingDialog.

**Dependencias internas**: Chamados/Tickets, Autenticacao & Roles, Clientes & Contatos, Faturamento/NFS-e (leitura), Monitoramento/Ativos, Contratos.

**Observacoes / Riscos**
- Gap de notificacao: abrir chamado/comentar pelo portal NAO dispara send-ticket-notification -> staff so e notificado pelo lado admin.
- useQuery('client-user') usa .maybeSingle() em client_contacts; usuario com >1 contato -> UI escolhe arbitrariamente/quebra, enquanto a RPC resolve com ORDER BY.
- Inconsistencia de seguranca/UX no Financeiro: aba so para client_master, mas RLS de invoices/nfse_history libera SELECT para client tambem.
- ClientPortalFinancialTab: statusLabels tem 'renegotiated'/'lost' sem entrada em statusConfig (fallback errado).
- Duplicacao de mapas de status (portal-types vs FinancialTab vs tickets/billing).
- ContactBlock com useEffect fragil (eslint-disable).
- Sem anexos no chamado do portal (bloqueador para ALTAHU).
- closedCount/closedTickets duplicam logica de filtro em 3+ pontos.
- Aba 'resolved' fica presa se o cliente nunca avaliar.
- Financeiro declarado "esqueleto" no roadmap.

**Checklist de verificacao**
- [ ] Decidir se abrir chamado/comentar pelo portal deve notificar staff; implementar via RPC/trigger.
- [ ] Testar abrir chamado como 'client' (sem telefone -> modo outra pessoa) e 'client_master'.
- [ ] Testar usuario com >1 cliente (.maybeSingle nao retorna null/erro).
- [ ] Conferir RLS de invoices/nfse_history (client nao-master deve ter SELECT?).
- [ ] Validar RLS de tickets (client_master ve empresa; client so requester) - viewMode my vs all.
- [ ] Validar RLS de ticket_comments (cliente nao ve/insere is_internal=true).
- [ ] Testar open_client_portal_ticket com categoria inativa, asset/device de outro cliente, telefone +55.
- [ ] Verificar GRANT EXECUTE da versao hardened da RPC.
- [ ] Conferir statusConfig do FinancialTab para 'renegotiated'/'lost'.
- [ ] Testar avaliacao (sai da aba; contadores atualizam).
- [ ] Validar download/copia de boleto/PIX/NFS-e e campos null.
- [ ] Revisar UX mobile do portal.
- [ ] Confirmar plano de anexos para ALTAHU.

---

### 3.15 Configuracoes, Feature Flags e UI de Integracoes

**Responsabilidade**: Centro de config administrativa (/settings com abas lazy), UI de todas as integracoes externas, templates de email, e feature flags (CRUD + avaliacao com rollout gradual por hash) que ligam/desligam funcionalidades em runtime sem deploy.

**Frontend**
- Paginas: `src/pages/settings/SettingsPage.tsx`, `FeatureFlagsPage.tsx`.
- Componentes: `src/components/settings/IntegrationsTab.tsx`, `integrations/*` (IntegrationStatusPanel, IntegrationConfigCard, AsaasConfigForm, BancoInterConfigForm, EvolutionApiConfigForm, TelegramConfigForm, CheckMkConfigForm, TacticalRmmConfigForm, GoogleCalendarConfigForm, ResendConfigForm, UnifiConfigForm, NoContactCheckConfigForm), `EmailTemplatesTab.tsx`, `email-templates/*`.
- Hooks: `useFeatureFlag.ts`, `useIntegrationSettings.ts`, `useSavedViews.ts`, `useAuth.ts`, `usePermissions.ts`.

**Backend**
- Edge functions (acionadas por testes/UI): asaas-nfse, banco-inter, checkmk-sync, tactical-rmm-sync, unifi-sync, send-whatsapp, send-telegram, send-email-resend, google-calendar, check-no-contact-tickets.
- Tabelas: integration_settings, feature_flags, google_calendar_integrations, unifi_controllers, email_templates, email_settings.

**Integracoes**: Resend, Google Calendar, Evolution, Telegram, Banco Inter, Asaas, CheckMK, Tactical RMM, UniFi, Supabase Storage (email-assets).

**Fluxo de dados**: ConfigForm -> useIntegrationSettings (ou inline) salva em integration_settings (1 linha por tipo, JSONB + is_active). Botao Testar -> save({silent}) + invoke da edge com {action:'test'}. Feature flags: FeatureFlagsPage CRUD; useFeatureFlags carrega (staleTime 5min); useFeatureFlag avalia local com FNV-1a sobre userId:key. SavedViews so localStorage.

**Dependencias internas**: Auth/Permissoes, Financeiro/NFS-e, Monitoramento, Comunicacao/Notificacoes, Auditoria, Clientes.

**Observacoes / Riscos**
- **BUG CRITICO**: IntegrationsTab renderiza `<UnifiConfigForm />` sem a prop obrigatoria clientId -> query/insert com undefined; aba Rede em /settings quebra (uso correto e por-cliente em ClientNetworkTab).
- **BUG LOGICO** em useFeatureFlag: ramo rollout<=0 retorna true em ambos os ramos (`Boolean(...) ? true : true`) -> enabled_for_roles/users sem efeito quando rollout=0.
- Segredo hard-coded: AsaasConfigForm usa URL fixa yaxkiombyntpzcrnultp; outros usam env -> webhook pode apontar para projeto errado.
- Risco RLS: integration_settings com SELECT para is_staff -> secrets (api_key, client_secret, certificados, bot_token) legiveis por technician. Resend ja adota o padrao correto (secret de backend).
- Duplicacao/inconsistencia: adocao parcial de useIntegrationSettings e IntegrationConfigCard (so Telegram usa o Card).
- Toast misto (sonner vs use-toast).
- BancoInter inicia is_active=true por default.
- last_sync_at fora das migrations (drift).
- IntegrationStatusPanel lista crons hard-coded; sync manual so para tactical/checkmk.
- SavedViews so localStorage.
- GoogleCalendar redirect_uri morto no settings.
- CPF de teste hard-coded no AsaasConfigForm.

**Checklist de verificacao**
- [ ] Corrigir IntegrationsTab (remover UnifiConfigForm da aba Rede ou passar clientId).
- [ ] Cobrir evaluateFlag com teste (enabled+rollout=0, roles, whitelist, rollout parcial).
- [ ] Substituir URL hard-coded em AsaasConfigForm por env.
- [ ] Auditar RLS de integration_settings; mover secrets sensiveis para edge secrets ou restringir SELECT.
- [ ] Confirmar coluna last_sync_at no banco e versionar via migration.
- [ ] Testar cada "Testar Conexao" (contrato {error}/{success}).
- [ ] Validar registro automatico de webhook do Banco Inter.
- [ ] Conferir RLS de feature_flags (admin) e ProtectedRoute de FeatureFlagsPage.
- [ ] Verificar flags departments_enabled e gamification_enabled (UI condicional).
- [ ] Padronizar useIntegrationSettings/IntegrationConfigCard nos forms inline.
- [ ] Confirmar bucket email-assets e politicas.
- [ ] Testar EmailSettingsForm.single() (exatamente 1 linha seed).

---

### 3.16 Auditoria, Seguranca e Logs

**Responsabilidade**: Trilha de auditoria (INSERT/UPDATE/DELETE) em tabelas sensiveis via triggers, com redacao de segredos; UI admin para consultar/filtrar/inspecionar diffs; logs de aplicacao em application_logs com visualizador; detector de anomalias de cadastro com banner. Centraliza convencoes de seguranca (SECURITY.md).

**Frontend**
- Paginas: `src/pages/settings/AuditLogsPage.tsx`, `UsersPage.tsx` (AnomaliesBanner), `src/components/settings/LogsViewerTab.tsx`.
- Componentes: `src/components/audit/*` (AuditLogsList, AuditLogFilters, AuditLogRow, AuditLogDetail, AuditLogDiff), `AnomaliesBanner.tsx`, `LogsViewerTab.tsx`, `src/lib/audit-diff.ts`, `src/lib/logger.ts`, `_shared/auth-helpers.ts`.
- Hooks: `useAuditLogs.ts` (RPC list_audit_logs_with_user); AnomaliesBanner/LogsViewerTab usam useQuery inline.

**Backend**
- Edge functions: detect-auth-anomalies (index.ts + logic.ts).
- Tabelas: audit_logs, application_logs, profiles, user_roles, auth.users, notifications.

**Integracoes**: Supabase Auth Admin API (listUsers), pg_cron + pg_net, Edge Functions runtime.

**Fluxo de dados**: Auditoria: trigger audit_changes() (SECURITY DEFINER) monta old/new, sanitiza segredos so em integration_settings, insere em audit_logs -> UI via RPC list_audit_logs_with_user. Logs de app: logger.ts/edge -> application_logs -> LogsViewerTab/AnomaliesBanner. Anomalias: detect-auth-anomalies -> detectAnomalies -> resumo em application_logs + notifications -> banner le ultimo registro.

**Dependencias internas**: Gestao de Usuarios/Auth, Integracoes (redacao), Faturamento/NFS-e/Pagamentos (produtores de logs), Notificacoes, Layout/Rotas.

**Observacoes / Riscos**
- **BUG REAL (level invalido)**: detector insere `level:'warning'` mas o CHECK so aceita error/warn/info/debug -> quando ha anomalias (total>0) o insert do resumo VIOLA a constraint e falha sem ser capturado; o caminho cron acaba lendo so estados sem anomalia.
- Cron possivelmente nao agendado (migration so faz unschedule).
- Redacao parcial vs promessa: trigger so chama sanitize_jsonb para integration_settings; bank_accounts/clients/invoices/contracts/user_roles vao crus.
- RLS de INSERT fraca: 'System can insert logs' WITH CHECK (true) permite linhas forjadas.
- Filtro 'auth.users' sem efeito (sem trigger).
- Inconsistencia de taxonomia module ('Auth' vs 'auth').
- Codigo morto (import Trash2; cleanup_old_application_logs sem cron; ip_address nunca populado).
- Trigger engole erros (RAISE WARNING) - alteracoes sem trilha sem alerta.
- date_to mistura UTC com data local.
- audit_user_roles() possivelmente orfa.
- application_logs/audit_logs crescem sem expurgo garantido.

**Checklist de verificacao**
- [ ] Corrigir level 'warning'->'warn' e checar erro do insert; validar que o resumo aparece com total>0.
- [ ] Confirmar cron 'detect-auth-anomalies-daily' em cron.job; criar se ausente.
- [ ] Validar RLS de INSERT de audit_logs (restringir a service_role/is_staff).
- [ ] Testar list_audit_logs_with_user (nao-admin -> Unauthorized; admin -> paginacao/filtros).
- [ ] Verificar redacao em integration_settings e alinhar texto da UI (outras tabelas nao redigem).
- [ ] Conferir RLS de application_logs e LogsViewerTab.
- [ ] Testar detect-auth-anomalies (nao-admin -> 403; service-role -> passa).
- [ ] Confirmar verify_jwt do detector e o caminho cron service-role.
- [ ] Validar diffJsonb com payloads aninhados/arrays e null.
- [ ] Remover import Trash2; decidir cleanup_old_application_logs.
- [ ] Verificar se audit_user_roles() ainda existe orfa.
- [ ] Conferir filtro 'auth.users' (sem trigger) e remover se sem sentido.
- [ ] Alinhar taxonomia de module entre logger.ts/edges/filtros.

---

### 3.17 Banco de Dados, Migrations e Schema

**Responsabilidade**: Define e versiona o schema Postgres/Supabase via 163 migrations idempotentes (109 tabelas, 6 views, 17 enums, ~120 funcoes/RPC, ~90 triggers, 314 policies RLS). Fonte de verdade do modelo de dados e do contrato de tipos consumido pelo frontend.

**Frontend (contrato)**
- `src/integrations/supabase/types.ts` (7427 linhas, gerado), `src/integrations/supabase/client.ts` (gerado), `FeatureFlagsPage.tsx`.

**Componentes-chave (migrations)**
- 20260119164953 (fundacional: enums, has_role, is_staff, handle_new_user), 20260204205900 (RBAC de clients), 20260519185808 (pending_invites + enforce_invite_on_signup + accept_invite), 20260216215000 (invoice numbering com lock), 20260308225517 (views *_safe), 20260526235813 (vault_upsert_secret), 20260127000000 (indices de performance).

**Backend**
- 59 edge functions consomem o schema via service_role; tabelas: clients/contacts/branches, contracts/services/adjustments, tickets/*, invoices/*, financial_entries, bank_*, nfse_*, certificates(+safe), company_settings(+safe), monitored_devices/monitoring_alerts/uptime_history, network_sites, unifi_controllers, doc_* (22), user_roles, profiles, pending_invites, role_permission_overrides, audit_logs, application_logs, webhook_events, feature_flags, technician_points, badges, backups residuais.

**Integracoes**: Supabase Auth (triggers em auth.users), Vault (senhas A1/tokens), Asaas, Banco Inter (legado), NFS-e municipal, UniFi/CheckMK/Tactical RMM, Resend, Google Calendar.

**Fluxo de dados**: UI/hook -> from()/rpc() (cliente tipado) -> RLS (has_role/is_staff/is_financial_admin/client_owns_record) -> triggers BEFORE/AFTER -> segredos no Vault, saindo so via RPC SECURITY DEFINER; views *_safe expoem subconjunto. Edges usam service_role para fluxos privilegiados.

**Dependencias internas**: Auth/RBAC (sustenta toda RLS), Tickets, Clientes/Contratos, Faturamento/NFS-e, Monitoramento, Documentacao Tecnica, Integracoes/Edge Functions.

**Observacoes / Riscos**
- Backups residuais no schema/types (`_billing_hotfix_backup_pix_contamination`, `_billing_migration_backup_inter_to_asaas`) ja passaram do prazo de drop.
- Migrations de data-fix one-off versionadas (purge de UUIDs E2E com DELETE em auth.users; correcao de fatura #128).
- Muitas funcoes sem `SET search_path` (alerta 'Function Search Path Mutable'), incluindo SECURITY DEFINER (get_certificate_password, get_license_key, get_calendar_tokens, generate_next_invoice_number).
- Regressao auto-corrigida (clients_contact_only sem security_invoker por 9s).
- Config fantasma: send-email-smtp em config.toml sem diretorio.
- types.ts gerado mas commitado manualmente (risco de drift).
- format_invoice_number com logica fragil de placeholders.
- generate_next_invoice_number com FOR UPDATE NOWAIT pode abortar sob carga.
- RPCs TEMPORARY (hermes_*/unifi_relay_*/vault_upsert_secret) - verificar ciclo de vida.
- Volume alto de RPCs get_*_report/list_*_for_admin (superficie a auditar).

**Checklist de verificacao**
- [ ] Rodar advisors (security+performance) e tratar 'Function Search Path Mutable' (priorizar SECURITY DEFINER).
- [ ] Confirmar security_invoker=on em todas as views *_safe/accounts_receivable/clients_contact_only.
- [ ] Auditar RLS de clients ponta a ponta (technician_only, client, trigger restrict_client_update).
- [ ] Testar fluxo de convite (signup falha; accept_invite vincula; bootstrap service_role passa).
- [ ] Validar concorrencia de generate_next_invoice_number (sem gaps/duplicidade; backoff nao aborta).
- [ ] Dropar os backups _billing_*_backup_* e regenerar types.ts.
- [ ] Conferir migrations vs banco e regenerar types.ts (detectar drift).
- [ ] Limpar config.toml (send-email-smtp inexistente) e revisar verify_jwt.
- [ ] Validar state machines de invoices/contracts e triggers de soma de itens.
- [ ] Verificar ciclo de vida das RPCs TEMPORARY e remover orfas.
- [ ] Conferir que campos sensiveis nunca sao expostos via SELECT direto; REVOKE de anon/authenticated.

---

### 3.18 Infraestrutura, Build, PWA e Testes

**Responsabilidade**: Fundacao do projeto: build (Vite+SWC, chunking), PWA (Workbox + SW de push manual), Tailwind/shadcn, TS/ESLint, shell de UI (AppLayout, AppSidebar, AnimatedRoutes com lazy + error boundaries), cliente Supabase, helpers transversais e infraestrutura de testes Vitest.

**Frontend**
- Paginas: `src/pages/Login.tsx` (eager + teste); demais via `AnimatedRoutes.tsx` (lazyWithRetry).
- Componentes: `src/components/layout/*` (AppLayout, AnimatedRoutes, AppSidebar, PageTransition, GlobalProgress, BackgroundPattern, SessionExpiryIndicator), `src/App.tsx`, `src/main.tsx`, `src/components/ui/sidebar.tsx`.
- Hooks: useFeatureFlag, useAuth, usePermissions, usePushNotifications, useTechnicianTicketCount, usePendingInvitesCount, useUnifiedRealtime.

**Backend**
- Nenhuma edge function propria. O cliente Supabase e edgeFunctionError.ts sao a porta de invoke de todos os setores. Testes exercitam logic.ts de 4 edges (generate-monthly-invoices, notify-due-invoices, resend-confirmation, detect-auth-anomalies). sw-push.js consome send-push-notification.
- Buckets: nfse-files, invoice-documents, ticket-attachments.

**Integracoes**: Supabase (Auth/PostgREST/Storage/Edge/Realtime), PWA/Web Push, Workbox (NetworkFirst para *.supabase.co), Lovable (componentTagger/favicon).

**Fluxo de dados**: UI (lazy) -> hooks (React Query global) -> client Supabase -> PostgREST/Edge/Storage. throwIfEdgeFunctionError; unwrapEmbed; storage-utils (resolveStoragePath -> createSignedUrl/download). Realtime via useUnifiedRealtime. Push via sw-push.js. Build: manualChunks; vite-plugin-pwa gera sw.js. Testes: logic.ts com mock chainable do Supabase.

**Dependencias internas**: Auth/Autorizacao, Feature Flags, Realtime/Notificacoes, Faturamento/NFS-e (storage-utils), praticamente todos os setores.

**Observacoes / Riscos**
- Dois service workers coexistem (Workbox sw.js + sw-push.js) - risco de conflito de escopo '/'.
- vite-plugin-pwa com manifest:false + manifest.json estatico: theme-color/background divergentes; favicon externo (storage.googleapis.com).
- Cobertura de testes estreita (5 arquivos); detect-auth-anomalies/logic.ts fora do coverage.include.
- So 4 de 59 edges com logic.ts testavel.
- ESLint no-unused-vars off; supabase/functions fora do lint.
- tsconfig frouxo (strict:false); sem typecheck/CI.
- client.ts sem validacao de env.
- example.test.ts placeholder; mocks/http.ts restoreFetch no-op.
- Mock chainable resolve a mesma resposta (filtros no-op) - risco de falso positivo.
- PageTransition sem animacao (nome enganoso).
- navigateFallback:null (sem fallback SPA offline).
- vendor-date chunk so date-fns (date-fns-tz em outro chunk).

**Checklist de verificacao**
- [ ] Validar coexistencia de sw.js e sw-push.js (push com app fechado + autoUpdate).
- [ ] Confirmar VITE_SUPABASE_URL/PUBLISHABLE_KEY no build e adicionar validacao em client.ts.
- [ ] Rodar build e inspecionar tamanhos de chunks (manualChunks vs deps atuais).
- [ ] Rodar test e test:coverage; decidir incluir as logic.ts faltantes.
- [ ] Adicionar script/CI de typecheck (tsc --noEmit) e lint.
- [ ] Testar download/abertura de arquivos (RLS dos buckets; signed URL respeita usuario).
- [ ] Verificar resolveStoragePath (default 'nfse-files' nao captura paths errados).
- [ ] Validar LazyErrorBoundary + GlobalErrorHandler apos deploy (sem loop de reload).
- [ ] Harmonizar manifest (theme-color/background) e favicon local.
- [ ] Auditar codigo morto (example.test.ts, RouteChangeLoader, mocks no-op); reativar no-unused-vars temporariamente.
- [ ] Validar comportamento offline (navigateFallback:null).
- [ ] Revisar mock chainable (filtros no-op) e cobrir casos onde o filtro importaria.

---

## 4. Matriz de Integracoes

| Integracao | Categoria | Direcao | Edge functions | Webhooks | Secrets/Config | Status |
|---|---|---|---|---|---|---|
| Asaas (cobranca) | pagamento | bidirecional | asaas-nfse, webhook-asaas-nfse, generate-invoice-payments, generate-second-copy, auto-retry-failed-boletos, admin-cancel-asaas-payment, manual-payment | webhook-asaas-nfse?token= (PAYMENT_*/INVOICE_*) | integration_settings(asaas: api_key/wallet_id/environment/webhook_token), SUPABASE_*, WEBHOOK_SECRET_ASAAS | ativa |
| Asaas NFS-e | nfse | bidirecional | asaas-nfse, webhook-asaas-nfse, send-nfse-notification | webhook-asaas-nfse?token= (INVOICE_*/PAYMENT_*) | integration_settings(asaas), WEBHOOK_SECRET_ASAAS, company_settings(nfse_*), contracts.nfse_service_code | ativa |
| Banco Inter | pagamento | bidirecional | banco-inter, webhook-banco-inter, poll-services | webhook-banco-inter?token= | WEBHOOK_SECRET_BANCO_INTER, integration_settings(banco_inter: client_id/secret/cert), SUPABASE_* | parcial |
| Resend | mensageria | bidirecional | send-email-resend, webhook-resend-status (+16 consumidoras) | webhook-resend-status (Svix) | RESEND_API_KEY, RESEND_WEBHOOK_SECRET, integration_settings(resend: from_name/from_email) | ativa |
| Telegram | mensageria | bidirecional | send-telegram, webhook-telegram-status, send-notification, send-alert-notification | webhook-telegram-status (stub) | WEBHOOK_SECRET_TELEGRAM, integration_settings(telegram: bot_token/default_chat_id) | parcial |
| WhatsApp / Evolution | mensageria | bidirecional | send-whatsapp, validate-whatsapp, webhook-whatsapp-status | webhook-whatsapp-status (MESSAGE_UPDATE) | WEBHOOK_SECRET_WHATSAPP, integration_settings(evolution_api: api_url/api_key/instance) | parcial |
| Web Push (VAPID) | mensageria | saida | send-push-notification (+callers) | nenhum | VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY (hardcoded x2), VAPID_SUBJECT | parcial |
| Google Calendar | calendario | saida | google-calendar | nenhum | integration_settings(google_calendar: client_id/secret/redirect_uri) | parcial |
| UniFi (+relay Hermes) | monitoramento | saida | unifi-sync, sync-doc-devices (relay-unifi.ts externo) | nenhum | unifi_controllers(url/user/password_encrypted/cloud_api_key_encrypted), Vault UNIFI_RELAY_PASSWORD | parcial |
| CheckMK | monitoramento | saida | checkmk-sync | nenhum | integration_settings(checkmk: url/username/secret/alert_levels) | ativa |
| Tactical RMM | monitoramento | saida | tactical-rmm-sync | nenhum | integration_settings(tactical_rmm: url/api_key/flags) | ativa |
| Consulta CNPJ (ReceitaWS) | consulta | saida | cnpj-lookup | nenhum | nenhum (tier gratuito, verify_jwt=true default) | ativa |
| Indices Economicos (BCB SGS) | consulta | saida | fetch-economic-indices, check-contract-adjustments | nenhum | SUPABASE_*, verify_jwt=false, API publica | ativa |
| Supabase (Plataforma) | plataforma | bidirecional | _shared/auth-helpers, auth-email-hook, certificate-vault + ~50 | auth-email-hook (Send Email hook) | VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY | ativa |

---

## 5. Integracoes

### 5.1 Asaas (cobranca/pagamentos)

**Fluxo de dados**: SAIDA: generate-invoice-payments/useInvoiceActions/auto-retry/generate-second-copy decidem provider e invocam asaas-nfse action=create_payment -> le integration_settings(asaas) -> idempotencia/drift -> ensureCustomerForPayment (PUT/POST /customers) -> POST /payments -> busca identificationField/pixQrCode -> baixa PDF -> grava invoices (asaas_payment_id, boleto_url, boleto_barcode, pix_code, boleto_status='gerado'). ENTRADA: webhook-asaas-nfse?token= -> valida token -> idempotencia (webhook_events) -> casa por externalReference=invoice.id -> status='paid' + paid_date + auto-emite NFS-e + notifica.

**Endpoints externos**: api.asaas.com/v3 (prod), sandbox.asaas.com/api/v3, api-sandbox.asaas.com/v3 (divergente em admin-cancel); POST/PUT/GET /customers, POST/GET/DELETE /payments, GET /payments/{id}/identificationField, /pixQrCode, POST /payments/{id}/receiveInCash, POST/GET/DELETE /invoices, GET /invoices/municipalServices, GET /myAccount.

**Tabelas**: integration_settings, invoices, clients, contracts, nfse_history, nfse_event_logs, nfse_cancellation_log, webhook_events, invoice_documents, financial_entries, audit_logs/application_logs/notifications, _billing_migration_backup_inter_to_asaas.

**Riscos / lacunas**
- CRITICO: webhook-asaas-nfse/asaas-nfse/admin-cancel-asaas-payment fora do config.toml -> herdam verify_jwt=true; webhook do Asaas (sem JWT) seria rejeitado antes do check de token.
- project_id divergente (config.toml silefpsayliwqtoskkdz vs AsaasConfigForm yaxkiombyntpzcrnultp).
- Bug de URL sandbox (sandbox.asaas.com vs api-sandbox.asaas.com).
- admin-cancel-asaas-payment sem auth de usuario, deleta cobrancas com service role.
- asaas-nfse sem validar user/role nas actions sensiveis.
- api_key em texto claro; webhook sem HMAC (so token em query).
- create_payment com multiplas chamadas sincronas (latencia/timeout em lote).
- auto-retry default 'asaas' mesmo para faturas Inter.

**Passos de verificacao**
- [ ] Confirmar verify_jwt das 3 functions; adicionar verify_jwt=false ao config.toml para o webhook.
- [ ] Alinhar project ref correto e a URL de webhook no AsaasConfigForm.
- [ ] Conferir integration_settings (api_key/environment/webhook_token).
- [ ] Testar Conexao (GET /myAccount) e o wizard sandbox (create/confirm).
- [ ] Gerar boleto real e checar asaas_payment_id/boleto_url/barcode.
- [ ] Simular PAYMENT_RECEIVED e confirmar status='paid' + notificacao.
- [ ] Corrigir/validar URL base sandbox em asaas-nfse.
- [ ] Revisar audit_logs/application_logs por correlationId.

### 5.2 Asaas NFS-e

**Fluxo de dados**: SAIDA: UI -> asaas-nfse action emit/emit_standalone -> getAsaasConfig -> ensureCustomerSync (/customers) -> resolve municipalServiceId (/invoices/municipalServices) -> nfse_history ('processando') -> POST /invoices com taxes -> espelha invoices.nfse_status; logs em nfse_event_logs. ENTRADA: webhook-asaas-nfse -> verifyWebhookAuth -> idempotencia -> processInvoiceWebhook (AUTHORIZED baixa PDF/XML para nfse-files, grava numero_nfse) OU processPaymentWebhook (status='paid' + auto-emite NFS-e). ENTREGA: send-nfse-notification exige pdf_url/xml_url, signed URLs (7 dias).

**Endpoints externos**: api.asaas.com/v3, sandbox.asaas.com/api/v3; GET /myAccount, /invoices/municipalServices, POST/PUT/GET /customers, POST/GET/DELETE /invoices, POST/GET/DELETE /payments, /identificationField, /pixQrCode, /receiveInCash; download de pdfUrl/xmlUrl/bankSlipUrl.

**Tabelas**: nfse_history, nfse_event_logs, nfse_cancellation_log, webhook_events, integration_settings, clients, invoices, invoice_documents, contracts, company_settings, notifications/user_roles, invoice_notification_logs/application_logs/audit_logs; buckets nfse-files/invoice-documents.

**Riscos / lacunas**
- JWT gateway: asaas-nfse e webhook-asaas-nfse fora do config.toml -> verify_jwt=true; webhook publico pode receber 401 antes do verifyWebhookAuth (RISCO ALTO).
- Token via query string (logavel); sem HMAC.
- Webhook precisa de registro manual no painel Asaas.
- asaas_customer_id compartilhado entre NFS-e e cobranca (drift; ja ha mitigacao cnpj_drift).
- Auto-emissao no pagamento sem reentrancia alem de auto_nfse_emitted; falha silenciosa.
- send-nfse-notification bloqueia sem pdf_url/xml_url (depende do webhook).
- URL do projeto hard-coded; certificate-vault/parse-certificate paralelos (nao usados pelo Asaas).

**Passos de verificacao**
- [ ] Confirmar Verify JWT desabilitado para webhook-asaas-nfse (ou config.toml).
- [ ] Verificar secret WEBHOOK_SECRET_ASAAS (fail-closed se ausente).
- [ ] Conferir integration_settings (environment/api_key/webhook_token).
- [ ] Testar Conexao (GET /myAccount).
- [ ] Rodar wizard sandbox (cliente->boleto->confirmar->emitir teste) e checar webhook_events/nfse_event_logs.
- [ ] Registrar webhook no painel Asaas e disparar teste.
- [ ] Emitir NFS-e real (processando->autorizada), download PDF/XML, testar NfseShareMenu.
- [ ] Verificar idempotencia (reenvio -> skipped).

### 5.3 Banco Inter (boletos e PIX)

**Fluxo de dados**: SAIDA: useInvoiceActions -> banco-inter -> le integration_settings -> Deno.HttpClient mTLS (cert .crt/.key) -> OAuth client_credentials -> POST /cobranca/v3/cobrancas (assincrono, codigoSolicitacao) -> polling inline curto (3x15s) -> grava invoices (boleto_barcode, boleto_status, boleto_url, notes). PIX: POST /pix/v2/cob -> pix_code. ENTRADA: webhook-banco-inter?token= -> valida token -> array de eventos -> idempotencia -> PAGO/RECEBIDO/LIQUIDADO -> status='paid' + financial_entries + notifica. FALLBACK: poll-services reconcilia boletos/pagamentos.

**Endpoints externos**: cdpj.partners.bancointer.com.br (prod), cdpj-sandbox (sandbox); /oauth/v2/token, POST/GET /cobranca/v3/cobrancas, /pdf, /cancelar, PUT|GET /webhook, POST /pix/v2/cob.

**Tabelas**: integration_settings, invoices, clients, invoice_documents, webhook_events, financial_entries, audit_logs, notifications, contracts, application_logs, user_roles, backups residuais.

**Riscos / lacunas**
- Cron de poll-services NAO versionado -> boletos assincronos podem ficar 'pendente' para sempre.
- banco-inter/webhook-banco-inter/poll-services fora do config.toml (webhook precisa ser publico).
- Webhook so com token na query string (logavel); sem mTLS na borda.
- Sem WEBHOOK_SECRET_BANCO_INTER, register_webhook falha e o webhook nega tudo.
- Certificados mTLS em base64 texto claro no DB.
- Formato legado certificate_base64 nao gera httpClient mTLS.
- Polling inline pode estourar timeout.
- Historico de contaminacao PIX/boleto (corrigido por hotfix).
- Sandbox Inter frequentemente indisponivel.
- Reconciliacao PIX inexistente no poll-services (so webhook).

**Passos de verificacao**
- [ ] Confirmar cron de poll-services no Dashboard.
- [ ] Verificar WEBHOOK_SECRET_BANCO_INTER nos secrets.
- [ ] Garantir verify_jwt=false para webhook-banco-inter/banco-inter/poll-services.
- [ ] Preencher config + upload .crt/.key, Testar Conexao (available_scopes).
- [ ] Registrar/Verificar Webhook (isOurs=true).
- [ ] Gerar boleto de teste e checar barcode/url/notes; rodar poll-services se 'pendente'.
- [ ] Simular callback PAGO e validar status='paid', financial_entries, idempotencia.
- [ ] Conferir logs [BANCO-INTER]/[WEBHOOK]/[POLL-SERVICES].
- [ ] Validar migracao de contratos active para asaas.

### 5.4 Resend (email)

**Fluxo de dados**: SAIDA: consumidora monta HTML via email-helpers e invoca send-email-resend -> valida/sanitiza -> resolve remetente (payload > integration_settings 'resend' > defaults) -> POST api.resend.com/emails (Bearer, timeout 15s) -> message_logs (sent/failed + external_message_id). ENTRADA: Resend -> webhook-resend-status -> valida Svix (HMAC, fail-closed) -> dedup por svix-id -> avanca status sem regressao -> bounce/complaint -> upsert suppressed_emails.

**Endpoints externos**: https://api.resend.com/emails (POST).

**Tabelas**: message_logs, integration_settings(resend), suppressed_emails, webhook_events, email_settings, company_settings, email_templates.

**Riscos / lacunas**
- LACUNA: send-email-resend NAO consulta suppressed_emails antes de enviar (supressao so pela metade).
- Sem retry/backoff em 429/5xx.
- Sem idempotency_key (re-disparo duplica email).
- Rate limit do Resend nao respeitado (geracao mensal pode estourar quota).
- webhook-resend-status fora do config.toml (verify_jwt=true default) - confirmar acessibilidade.
- Sem UI para URL do webhook nem painel de logs/erros; sem gestao de suppressed_emails.
- is_active controla so o from default e o botao de teste, nao bloqueia as 16 functions.
- Rate limit in-memory por instancia.
- DMARC rua aponta para dmarcreports@lovable.dev.

**Passos de verificacao**
- [ ] Confirmar RESEND_API_KEY (senao 500/configured:false).
- [ ] Confirmar RESEND_WEBHOOK_SECRET (senao fail-closed/401).
- [ ] Testar via ResendConfigForm (envio retorna sucesso).
- [ ] Verificar message_logs (sent -> delivered).
- [ ] Verificar webhook_events (resend) - idempotencia.
- [ ] Confirmar URL/eventos no dashboard Resend.
- [ ] Testar bounce -> suppressed_emails e (FALHA atual) se envio subsequente pula.
- [ ] Confirmar acessibilidade publica do webhook (config.toml).
- [ ] Validar DNS (DKIM/SPF/MX).

### 5.5 Telegram (Bot API)

**Fluxo de dados**: SAIDA: edge le integration_settings(telegram) -> POST api.telegram.org/bot<token>/sendMessage {chat_id,text,parse_mode} (fallback default_chat_id). send-notification/send-alert-notification gravam message_logs; send-telegram NAO grava. ENTRADA: webhook-telegram-status -> valida segredo/assinatura -> grava audit_logs (stub, sem processamento).

**Endpoints externos**: https://api.telegram.org/bot<token>/sendMessage.

**Tabelas**: integration_settings(telegram), profiles(notify_telegram, telegram_chat_id), message_logs(telegram), audit_logs.

**Riscos / lacunas**
- send-telegram nao grava message_logs/audit_logs (rastreabilidade inconsistente).
- send-telegram ignora user_id/related_type/related_id (e parseMode quando camelCase).
- BUG: notify-sla-breach e check-no-contact-tickets enviam {chatId, parseMode} (camelCase) mas a function le snake_case -> sempre cai no default_chat_id.
- webhook-telegram-status e stub (sem read receipts); status delivered/read nunca atualizam.
- Nenhum codigo registra setWebhook.
- bot_token em texto plano; bot_username coletado mas nao usado.

**Passos de verificacao**
- [ ] Confirmar registro telegram em integration_settings (is_active, bot_token, default_chat_id).
- [ ] Validar token (GET /getMe -> ok:true).
- [ ] Testar botao de teste e chegada da mensagem.
- [ ] Inspecionar logs do send-telegram.
- [ ] Reproduzir BUG de campo (chatId vai para default).
- [ ] Confirmar gravacao em message_logs via send-notification/send-alert (e ausencia via send-telegram).
- [ ] Testar webhook (sem secret -> 401; com secret -> 200 + audit_logs).
- [ ] Confirmar WEBHOOK_SECRET_TELEGRAM definido.

### 5.6 WhatsApp / Evolution API

**Fluxo de dados**: SAIDA: invoke send-whatsapp {to, message, userId?} -> le integration_settings(evolution_api) -> limpa numero -> POST {api_url}/message/sendText/{instance} (apikey, rate-limit 10/s, timeout 5s, retry 3x) -> message_logs. VALIDACAO: ClientForm -> validate-whatsapp -> 55+DDD -> POST /chat/whatsappNumbers -> {valid, exists, jid}. ENTRADA: webhook-whatsapp-status (ACKs PENDING/SERVER_ACK/DELIVERY_ACK/READ) -> UPDATE message_logs (delivered_at/read_at) + audit_logs.

**Endpoints externos**: POST {api_url}/message/sendText/{instance}, POST {api_url}/chat/whatsappNumbers/{instance}.

**Tabelas**: integration_settings(evolution_api), message_logs(whatsapp), audit_logs, application_logs(retry), clients(whatsapp/whatsapp_validated).

**Riscos / lacunas**
- webhook-whatsapp-status fora do config.toml -> verify_jwt=true; Evolution sem JWT seria rejeitado (status delivered/read nao atualiza).
- validate-whatsapp tambem fora do config.toml.
- send-whatsapp com verify_jwt=false (publico) - so protegido por rate-limit por IP (risco de spam).
- api_key em integration_settings (nao em Secrets).
- Codigo de envio duplicado em 3 lugares (retry/normalizacao divergentes).
- send-whatsapp nao adiciona DDI 55 automaticamente.
- Fail-closed sem WEBHOOK_SECRET_WHATSAPP.

**Passos de verificacao**
- [ ] Confirmar webhook na Evolution (MESSAGE_UPDATE/MESSAGES_UPSERT + X-Webhook-Secret).
- [ ] Adicionar verify_jwt=false ao config.toml (webhook + validate-whatsapp); testar delivered_at/read_at.
- [ ] Verificar integration_settings (evolution_api, is_active, campos).
- [ ] Testar envio pelo form (message_logs sent + external_message_id).
- [ ] Validar numero no ClientForm (exists/jid).
- [ ] Confirmar WEBHOOK_SECRET_WHATSAPP.
- [ ] Inspecionar logs send-whatsapp/webhook (200/ack).

### 5.7 Web Push (VAPID)

**Fluxo de dados**: usePushNotifications.subscribe (permission + /sw-push.js + pushManager.subscribe) -> upsert push_subscriptions. Disparo: send-ticket-notification (correto) / notify-sla-breach / check-no-contact-tickets / Testar Push -> send-push-notification (service role) -> consulta push_subscriptions (user_ids OU role_filter) -> JWT VAPID ES256 + ECDH/HKDF + AES-128-GCM -> POST ao endpoint. 404/410 deletam a subscription.

**Endpoints externos**: subscription.endpoint (FCM/Mozilla/WNS), POST com Authorization vapid, Content-Encoding aes128gcm.

**Tabelas**: push_subscriptions (FK profiles.user_id, UNIQUE user_id,endpoint, RLS owner), user_roles, profiles.

**Riscos / lacunas**
- GAP CRITICO de contrato: notify-sla-breach e check-no-contact-tickets chamam com {userId,title,body,url} no topo, mas a function espera {type, user_ids/role_filter, data:{...}} -> push enviado para TODAS as subscriptions e payload generico.
- VAPID_PUBLIC_KEY duplicado/hardcoded (frontend + edge).
- Erros !=404/410 so logados (subscriptions invalidas nao limpas).
- Sem VAPID_PRIVATE_KEY -> success:true com sent:0 (falha silenciosa).
- Realtime de push_subscriptions adicionado e depois removido (confirmar nada depende).
- send-push-notification fora do config.toml (verify_jwt=true default).
- Implementacao cripto manual sem testes; envio sequencial (timeout).
- handleTestPush com user undefined -> [undefined] -> sent:0.

**Passos de verificacao**
- [ ] Confirmar VAPID_PRIVATE_KEY corresponde a VAPID_PUBLIC_KEY.
- [ ] Ativar Push, verificar push_subscriptions, clicar Testar Push (recebimento).
- [ ] Inspecionar logs (Success vs 401/403/410).
- [ ] Reproduzir o GAP (broadcast indevido + payload generico).
- [ ] Corrigir os dois callers para o contrato correto.
- [ ] Verificar SW activated e subscription no DevTools.
- [ ] Testar limpeza de subscription expirada (404/410).
- [ ] Confirmar se push_subscriptions ainda precisa estar fora do realtime.

### 5.8 Google Calendar

**Fluxo de dados**: Config: admin preenche client_id/secret -> integration_settings. Conexao: Conectar -> google-calendar action auth_url -> redireciona ao Google -> retorno /settings?code=&state. PROBLEMA: nenhum handler captura ?code nem chama action 'callback' -> tokens nunca trocados/salvos. Actions sync_event/delete_event existem mas nao sao chamados. Desconectar: delete direto em google_calendar_integrations.

**Endpoints externos**: accounts.google.com/o/oauth2/v2/auth, oauth2.googleapis.com/token, calendar/v3/users/me/calendarList/primary, calendar/v3/calendars/{id}/events (POST/PUT/DELETE).

**Tabelas**: integration_settings(google_calendar), google_calendar_integrations (tokens por usuario, RLS owner), calendar_events (google_event_id/google_calendar_id).

**Riscos / lacunas**
- Fluxo OAuth incompleto (sem captura de ?code/callback) -> conexao nunca conclui.
- Sincronizacao orfa (sync_event/delete_event nunca chamados; sync_enabled/last_sync_at sem uso).
- verify_jwt=true default conflita com o desenho do callback.
- client_secret/tokens em texto plano.
- redirect_uri fixo em origin+/settings (deve bater com Google Console).
- delete_event sem refresh de token.
- Status enganoso ('Configurado' nao reflete conexao real).

**Passos de verificacao**
- [ ] Confirmar ausencia de handler de callback OAuth.
- [ ] Verificar que sync_event/delete_event nao sao invocados.
- [ ] Checar verify_jwt (sem entrada em config.toml).
- [ ] Testar Conectar e confirmar que google_calendar_integrations NAO e populada (confirma o gap).
- [ ] Inspecionar logs (so auth_url exercitado).
- [ ] Validar RLS e get_calendar_tokens.

### 5.9 UniFi Controller (+relay Hermes)

**Fluxo de dados**: Config em unifi_controllers (RLS is_staff). CLOUD: unifi-sync action=sync -> api.ui.com (hosts/devices/sites) -> upsert network_sites + monitored_devices (external_source='unifi') -> unifi_sync_logs. DIRECT/HERMES: worker na LXC -> login -> unifi_relay_list_controllers (direct) -> UniFi OS via Tailscale -> RPCs SECURITY DEFINER (unifi_relay_upsert_device/post_alert/log_sync). LLDP -> network_topology (so no caminho direct da edge). sync-doc-devices reusa credenciais para doc_devices.

**Endpoints externos**: api.ui.com/v1 (/hosts, /devices, /sites); UniFi Network legacy (/api/login, /api/s/{site}/stat/device, /rest/alarm); UniFi OS (/api/auth/login, /proxy/network/...); relay -> Supabase (/auth/v1/token, /rest/v1/rpc/unifi_relay_*).

**Tabelas**: unifi_controllers, network_sites, network_topology, unifi_sync_logs, monitored_devices, monitoring_alerts, doc_devices, clients, auth.users/profiles/user_roles (usuario relay-unifi).

**Riscos / lacunas**
- Credenciais sensiveis em texto plano (password_encrypted/cloud_api_key_encrypted).
- BUG MonitoringPage:220 envia controllerId (camelCase), edge le controller_id -> filtro ignorado (sincroniza todos vencidos).
- BUG IntegrationsTab:99 renderiza UnifiConfigForm sem clientId.
- Sem agendamento automatico para CLOUD (so manual/relay).
- unifi-sync com verify_jwt=false + CORS '*' (service role).
- Acoplamento operacional (Tailscale, cert self-signed, usuario relay).
- Topologia LLDP provavelmente nunca populada (relay nao grava; ramo direct da edge nao alcanca UDMs).
- is_online inconsistente entre metodos.

**Passos de verificacao**
- [ ] Confirmar deploy (functions list).
- [ ] Testar conexao cloud (Testar Conexao -> N hosts).
- [ ] Rodar sync manual e verificar unifi_sync_logs (success).
- [ ] Inspecionar monitored_devices(unifi)/network_sites/last_sync_at.
- [ ] Testar relay Hermes (RUNBOOK_HERMES, usuario/Vault/role technician).
- [ ] Validar RPCs (unifi_relay_list_controllers so direct; sem is_staff -> excecao).
- [ ] Verificar systemd timer (15min).
- [ ] Reproduzir bug do MonitoringPage (sync ignora controllerId).
- [ ] Checar Tailscale status.

### 5.10 CheckMK

**Fluxo de dados**: Disparo manual (Testar/Salvar/sync/mapeamento/refresh). checkmk-sync le integration_settings(checkmk) -> Bearer "username secret" -> action=test (host_config), list_folders (folders -> clients), sync (hosts + estados + servicos; device_type por hostname; client_id via client_external_mappings; upsert monitored_devices; gera/resolve monitoring_alerts por alert_levels). Timeout 15s.

**Endpoints externos**: {baseUrl}/api/1.0/domain-types/host_config/collections/all, folder_config/collections/all, host/collections/all, service/collections/all.

**Tabelas**: integration_settings, client_external_mappings, monitored_devices, monitoring_alerts, clients.

**Riscos / lacunas**
- Automation secret em texto puro no JSONB.
- verify_jwt=false (chamavel sem auth; enumera folders).
- Sem agendamento real (sync_interval_hours so UI; last_sync_at gravado pelo front).
- Sem paginacao (collections/all) - timeout/perda em instancias grandes.
- N+1 por host.
- Hosts sem mapeamento ficam invisiveis (unmapped).
- device_type heuristico; CORS '*'.
- Direcao pull (alertas so atualizam no sync).

**Passos de verificacao**
- [ ] Preencher e Testar Conexao (toast valido).
- [ ] Verificar integration_settings(checkmk).
- [ ] Listar folders (list_folders) e criar mapeamento.
- [ ] Acionar sync e checar logs (updated/created/unmapped/alerts).
- [ ] Conferir monitored_devices(checkmk) e monitoring_alerts.
- [ ] Validar endpoints com curl (Bearer).
- [ ] Confirmar ausencia de cron (cron.job) e verify_jwt.

### 5.11 Tactical RMM

**Fluxo de dados**: Config em integration_settings(tactical_rmm). Testar -> action=test (GET /clients/). Mapeamentos -> action=list_clients. Sync -> GET /agents/ + (online) /agents/{id}/checks/ -> service_data (hardware/metrics) -> upsert monitored_devices (insert so com mapeamento) -> alertas offline/online. NAO atualiza last_sync_at (so o front).

**Endpoints externos**: GET {url}/clients/, GET {url}/agents/, GET {url}/agents/{id}/checks/.

**Tabelas**: integration_settings, client_external_mappings(tactical_rmm), monitored_devices, monitoring_alerts, clients, audit_logs.

**Riscos / lacunas**
- API Key/URL em texto plano no JSONB.
- Sem cron (sync_interval_hours decorativo).
- verify_jwt=true default (diverge de checkmk/unifi).
- Sem paginacao (/agents/, /clients/).
- Matching de cliente fragil (campos heuristicos).
- Parsing de metricas best-effort.
- N+1 (SELECT+UPDATE/INSERT + fetch de checks por agente).
- Edge nao atualiza last_sync_at.
- Sem retry/backoff; uma falha aborta a sync.
- device_type fixo 'computer'; CORS '*'.

**Passos de verificacao**
- [ ] Confirmar registro (url/api_key/is_active).
- [ ] Testar Conexao (action=test -> /clients/).
- [ ] Validar list_clients (lista + logs de erro).
- [ ] Criar mapeamento e sincronizar; conferir monitored_devices(tactical).
- [ ] Verificar geracao/resolucao de alertas (offline->online).
- [ ] Conferir verify_jwt (anonimo -> 401).
- [ ] Confirmar ausencia de cron (cron.job).
- [ ] Inspecionar logs (Found N agents, sync complete).
- [ ] Verificar campo 'unmapped' no retorno.

### 5.12 Consulta CNPJ (cnpj-lookup via ReceitaWS)

**Fluxo de dados**: Frontend -> invoke cnpj-lookup {cnpj} -> valida/limpa 14 digitos -> GET receitaws.com.br/v1/cnpj/{cnpj} -> repassa JSON cru -> form.setValue (nao persiste; so ao salvar o ClientForm/CompanyTab).

**Endpoints externos**: https://receitaws.com.br/v1/cnpj/{cnpj} (tier gratuito sem chave).

**Tabelas**: clients (indireto), config da empresa emissora de NFS-e (indireto).

**Riscos / lacunas**
- Rate limit baixo (~3/min) -> 429 repassado cru (pode quebrar o fluxo).
- Sem tratamento de status HTTP (response.json sempre).
- CORS '*' (mitigado por verify_jwt=true).
- Provedor unico sem fallback; sem cache; sem sanitizacao dos dados externos.
- Deno std antigo (0.190.0).

**Passos de verificacao**
- [ ] Confirmar deploy (nao esta em config.toml, mas existe a function).
- [ ] Testar via ClientForm (CNPJ valido preenche campos).
- [ ] Repetir em CompanyTab.
- [ ] Teste direto autenticado (Bearer + body cnpj).
- [ ] Validar erros (<14 digitos -> 400; body vazio -> 400).
- [ ] Disparar varias consultas (429).
- [ ] Conferir logs (Error fetching CNPJ).

### 5.13 Indices Economicos (BCB - SGS)

**Fluxo de dados**: Disparo manual (widget) ou cron semanal (documentado). fetch-economic-indices itera tipos -> URL SGS -> fetch (sem auth) -> calcula accumulated_12m (produto dos 12 fatores) -> upsert economic_indices (onConflict index_type,reference_date, source='BCB'). Consumo: useLatestEconomicIndex/EconomicIndicesWidget; ContractAdjustmentDialog preenche percentual.

**Endpoints externos**: api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados (IGPM=189, IPCA=433, INPC=188).

**Tabelas**: economic_indices, contracts, contract_adjustments, contract_services, contract_history, notifications, user_roles.

**Riscos / lacunas**
- Cron fetch-economic-indices so no playbook (sem migration) -> atualizacao 100% manual se nao aplicado.
- Dependencia da API publica (erros so logados).
- Sem retry/backoff nem cache.
- accumulated_12m so a partir do 12o ponto (months baixo -> 'Buscar atual' desabilitado).
- check-contract-adjustments NAO le economic_indices (so notifica; auto-aplica so FIXO).
- verify_jwt=false (endpoint aberto que faz writes via service role).
- Defasagem de divulgacao do BCB.

**Passos de verificacao**
- [ ] Clicar refresh no widget (toast com contagem).
- [ ] Conferir economic_indices (linhas recentes, source='BCB').
- [ ] Testar 'Buscar atual' no ContractAdjustmentDialog.
- [ ] Verificar cron no ambiente (cron.job; se vazio, nao aplicado).
- [ ] Logs '[FETCH-INDICES]' (200 da api.bcb.gov.br).
- [ ] curl POST /fetch-economic-indices {months:13}.

### 5.14 Supabase (Plataforma)

**Fluxo de dados**: SAIDA (frontend->plataforma): auth.* (login/sessao), from() (RLS), storage.from() (buckets privados), functions.invoke(). ENTRADA/REALTIME: canal 'unified-realtime' empurra postgres_changes (tickets/notifications) so para staff; auto-refresh de token. SERVIDOR: adminClient (service role) vs userClientFromAuth (respeita RLS); requireRole valida JWT. AUTH HOOK: auth-email-hook renderiza React Email e envia via Lovable. CRON: pg_cron + pg_net chamam edges.

**Endpoints externos**: silefpsayliwqtoskkdz.supabase.co (REST/Auth/Storage/Realtime), wss .../realtime/v1, /functions/v1/<nome>, Lovable Email API.

**Tabelas**: auth.users, profiles, user_roles, tickets, notifications, certificates, audit_logs, storage.buckets/objects, user_invites, company_settings, software_licenses.

**Riscos / lacunas**
- ~17 functions com verify_jwt=false (incl. bootstrap-admin) - dependem de checagem interna.
- certificate-vault usa SERVICE_ROLE_KEY como key material (rotacionar quebra descriptografia).
- Senhas legadas de certificado sem prefixo 'ENCRYPTED:' retornadas em texto puro.
- rateLimit in-memory por instancia.
- Jobs pg_cron nao versionados (poll-services etc.).
- audit_logs sem retencao.
- anon key exposta no bundle -> seguranca depende de RLS em cada tabela.
- auth-email-hook acoplado ao Lovable (sem SMTP proprio).

**Passos de verificacao**
- [ ] Conferir .env (silefpsayliwqtoskkdz).
- [ ] Logar e confirmar persistencia JWT + refreshSession agendado.
- [ ] Testar realtime entre dois navegadores staff.
- [ ] Tentar ler dados de outro cliente como 'client' (bloqueio por RLS).
- [ ] Cadastrar certificado e confirmar senha_hash 'ENCRYPTED:' + autorizacao antes do service role.
- [ ] Conferir buckets privados (certificates/nfse-files/invoice-documents/ticket-attachments) vs publicos (email-assets/knowledge-images).
- [ ] Verificar checagem interna de cada function com verify_jwt=false.
- [ ] Conferir cron jobs e extensoes pg_cron/pg_net.
- [ ] Disparar recovery e confirmar assinatura/envio no auth-email-hook.
- [ ] Rodar get_advisors (tabelas sem RLS).

---

## 6. Mapa de Edge Functions (60 funcoes por dominio)

**Autenticacao, Usuarios e Permissoes (15)**: bootstrap-admin, create-user, invite-user, activate-invite-manually, resend-invite, revoke-invite, delete-user, update-user-email, confirm-user-email, reset-password, forgot-password, resolve-username, resend-confirmation, detect-auth-anomalies, auth-email-hook.

**Chamados / Tickets e SLA (3)**: send-ticket-notification, notify-sla-breach, check-no-contact-tickets.

**Clientes e Documentacao Tecnica (3)**: cnpj-lookup, check-doc-expiries, sync-doc-devices.

**Contratos e Reajustes (3)**: apply-contract-adjustment, check-contract-adjustments, fetch-economic-indices.

**Faturamento e Cobranca (12)**: generate-monthly-invoices, generate-invoice-payments, batch-process-invoices, batch-collection-notification, calculate-invoice-penalties, auto-retry-failed-boletos, notify-due-invoices, manual-payment, renegotiate-invoice, generate-second-copy, resend-payment-notification, admin-cancel-asaas-payment.

**NFS-e e Certificados / Pagamento externo (7)**: asaas-nfse, webhook-asaas-nfse, send-nfse-notification, certificate-vault, parse-certificate, banco-inter, webhook-banco-inter.

**Monitoramento e Servicos (5)**: tactical-rmm-sync, checkmk-sync, unifi-sync, send-alert-notification, poll-services (financeiro, agrupado por nome).

**Notificacoes e Comunicacao (10)**: send-notification (morto), send-email-resend, send-push-notification, send-whatsapp, send-telegram, validate-whatsapp, webhook-resend-status, webhook-telegram-status, webhook-whatsapp-status.

**Calendario e Agendamento (1)**: google-calendar.

> Observacao: o total nominal de ~60 funcoes inclui sobreposicoes entre dominios (ex.: asaas-nfse atende NFS-e e Faturamento; poll-services e financeiro mas foi historicamente agrupado em Monitoramento). Inventario, Base de Conhecimento, Relatorios, Gamificacao e Portal do Cliente nao possuem edge functions proprias (operam via supabase-js direto e RPCs). Os helpers `_shared/auth-helpers.ts`, `_shared/email-helpers.ts`, `_shared/notification-logger.ts` e `_shared/email-templates/*` sao compartilhados e nao contam como funcoes deployaveis.

---

## 7. Riscos Transversais e Proximos Passos

### 7.1 Agendamento (pg_cron) nao versionado — risco sistemico

Quase todos os setores dependem de jobs pg_cron que NAO estao nas migrations (so existem no DEPLOYMENT_PLAYBOOK/painel): SLA (notify-sla-breach, check-no-contact-tickets), faturamento (generate-monthly-invoices, notify-due-invoices, calculate-invoice-penalties, auto-retry-failed-boletos, update-overdue-status), contratos (check-contract-adjustments, fetch-economic-indices), documentacao (check-doc-expiries), reconciliacao (poll-services), monitoramento (tactical/checkmk/unifi-sync), e o detector de anomalias (a migration so faz `unschedule`). **Proximo passo**: auditar `cron.job` no ambiente, versionar os agendamentos em migrations e confirmar que cada cron passa JWT de service-role.

### 7.2 verify_jwt e webhooks — risco de quebra silenciosa

Multiplas edges de webhook (webhook-asaas-nfse, webhook-banco-inter, webhook-whatsapp-status, webhook-resend-status) e funcoes sensiveis nao estao em `config.toml` -> herdam `verify_jwt=true`; provedores externos nao enviam JWT Supabase -> 401 antes da validacao interna de token. **Proximo passo**: declarar explicitamente `verify_jwt=false` para todos os webhooks e confirmar no painel; padronizar config.toml (remover send-email-smtp fantasma).

### 7.3 Segredos em texto plano

`integration_settings.settings` (api_key Asaas, client_secret/certificados Inter, bot_token Telegram, secret CheckMK, api_key RMM), `doc_credentials` (password_encrypted/mfa_backup_code), `unifi_controllers` (password_encrypted/cloud_api_key_encrypted), `google_calendar_integrations` (tokens). O sufixo `_encrypted` e enganoso (sem cripto real). Resend ja adota o padrao correto (secret de backend). **Proximo passo**: migrar segredos sensiveis para edge secrets/Supabase Vault, restringir SELECT de integration_settings a admin/manager, e cifrar doc_credentials.

### 7.4 Sistema de SLA inoperante

`tickets.sla_deadline` nunca e escrito -> notify-sla-breach processa zero chamados e metricas de SLA do Dashboard/reports ficam vazias; ha duas nocoes de SLA desconexas (timestamp absoluto vs calculo client-side). **Proximo passo**: decidir entre trigger que popula sla_deadline ou reescrever a edge com a logica de sla-calculator.ts; unificar a fonte.

### 7.5 Perda de dados no merge de clientes

`merge_clients` nao migra tabelas `doc_*`; o DELETE do source (CASCADE) apaga silenciosamente toda a documentacao tecnica (dispositivos, credenciais, licencas, VLANs). **Proximo passo (alta prioridade)**: corrigir merge_clients para migrar doc_* antes do DELETE e reproduzir o cenario.

### 7.6 Contratos de payload divergentes (bugs reais)

Vários callers passam payloads incompativeis com as functions: Web Push (notify-sla-breach/check-no-contact -> broadcast indevido), Telegram (chatId/parseMode camelCase -> sempre default_chat_id), batch-collection-notification (status vs invoice_ids/channels -> 400), logAudit nas edges de convite, e UniFi MonitoringPage (controllerId vs controller_id). **Proximo passo**: corrigir os contratos e adicionar testes de integracao para os senders compartilhados.

### 7.7 Enums vs codigo (Faturamento/NFS-e)

`nfse_processing_status` (pendente|gerada|erro) diverge de writes que usam 'processando'/'autorizada'; a FSM em billing-fsm.ts assume valores inexistentes. **Proximo passo**: alinhar enum <-> codigo <-> FSM e auditar todos os writes de nfse/boleto/email_status.

### 7.8 RLS de RPCs SECURITY DEFINER

RPCs de relatorio financeiro (get_invoice_report_stats etc.) e de ranking sao SECURITY DEFINER sem guarda de role; a protecao e so o frontend. get_technician_ranking ignora RLS. **Proximo passo**: auditar GRANT EXECUTE e adicionar guardas is_staff/has_role no corpo das RPCs sensiveis.

### 7.9 Integridade da trilha de auditoria

`audit_logs` tem INSERT WITH CHECK (true) (linhas forjaveis), redacao so para integration_settings, trigger que engole erros, e o detector de anomalias com bug de level invalido. **Proximo passo**: restringir INSERT a service_role/is_staff, estender redacao, corrigir o level e checar erros de insert.

### 7.10 Qualidade do pipeline (Infra)

Type-check nao roda (build so `vite build`; tsconfig quebrado por vitest/globals), ESLint com no-unused-vars off, sem CI, cobertura de testes estreita (5 arquivos, 4 de 59 edges). Isso mascarou bugs reais (ex.: AdditionalChargesReportTab sem tipos). **Proximo passo**: adicionar `tsc --noEmit` + lint ao build/CI e ampliar a extracao de logic.ts testavel.

### 7.11 Duplicacao de superficies e codigo morto

Gestao de usuarios em duas surfaces, logica de reajuste e de geracao de pagamento duplicadas, dead branches do Banco Inter, send-notification orfa, tabelas orfas (doc_backup/antivirus_solutions, backups _billing_*), e UI morta (Compartilhar/⌘K na KB, billing_reminder no calendario, Garantias no Inventario, metas/badges na Gamificacao). **Proximo passo**: consolidar surfaces, eleger fontes unicas de regra de negocio e remover artefatos mortos (incluindo os backups residuais ja vencidos, regenerando types.ts).

### 7.12 Fluxos incompletos por design

Google Calendar (OAuth sem callback/sync), certificados A1 (cadastro sem consumo na emissao, alerta de validade prometido e inexistente), portal do cliente (sem notificacao ao staff e sem anexos — bloqueador ALTAHU), e gamificacao (pontos nunca concedidos no fluxo do cliente). **Proximo passo**: decidir por completar ou remover cada fluxo, evitando promessas de UI sem backend.
