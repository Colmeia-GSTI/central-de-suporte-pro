# Configurações, Feature Flags e Integrações

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria de 2026-07-21 — ver [docs/audit/AUDITORIA_2026-07-21.md](../audit/AUDITORIA_2026-07-21.md). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo do centro administrativo (/settings com abas lazy), UI de todas as integrações externas, templates de e-mail e feature flags (CRUD + avaliação com rollout gradual por hash FNV-1a). Núcleo funcional e majoritariamente em uso, mas com um bug de renderização (UnifiConfigForm sem clientId na aba Rede), um bug lógico no gate de rollout=0, adoção só parcial das abstrações compartilhadas (useIntegrationSettings/IntegrationConfigCard) e a página de Feature Flags acessível apenas por URL direta (sem link na navegação). Cada ConfigForm persiste 1 linha por integration_type em integration_settings (JSONB + is_active); Testar salva e invoca a edge com {action:'test'}.

## Integrações

- Telegram → edge send-telegram (integration_settings 'telegram': bot_token/default_chat_id/bot_username)
- WhatsApp/Evolution → edge send-whatsapp; webhook-whatsapp-status (integration_settings 'evolution_api': api_url/api_key/instance_name/default_number)
- Resend (e-mail) → edge send-email-resend; API key só em secret RESEND_API_KEY (integration_settings 'resend': default_from_name/email)
- Banco Inter → edge banco-inter (test/check_webhook/register_webhook); certs base64 no JSONB (integration_settings 'banco_inter')
- Asaas e Google Calendar (montados no IntegrationsTab, forms fora do escopo de leitura) → integration_settings 'asaas'/'google_calendar'
- CheckMK → edge checkmk-sync (test/list_folders/sync) (integration_settings 'checkmk')
- Tactical RMM → edge tactical-rmm-sync (test/list_clients/sync) (integration_settings 'tactical_rmm')
- UniFi → edge unifi-sync (test/list_sites/sync); dados em unifi_controllers (por cliente, NÃO integration_settings)
- No-Contact Check → edge check-no-contact-tickets (integration_settings 'no_contact_check')
- Storage: upload de logo de e-mail em bucket email-assets (EmailSettingsForm)
- Todas as edges invocadas existem em supabase/functions (verificado: send-telegram, send-whatsapp, checkmk-sync, tactical-rmm-sync, unifi-sync, banco-inter, send-email-resend, check-no-contact-tickets, webhook-whatsapp-status)

## Fluxos (rota → componente → hook → edge → tabela)

- URL /settings → SettingsPage → aba 'integrations' (lazy) → IntegrationsTab → cada *ConfigForm → useIntegrationSettings.load/save → tabela integration_settings (1 linha por integration_type, JSONB settings + is_active)
- IntegrationsTab aba Status → IntegrationStatusPanel → SELECT integration_settings (agrupa por categoria) + botão sync (só tactical_rmm/checkmk) → supabase.functions.invoke('tactical-rmm-sync'|'checkmk-sync', {action:'sync'}) → UPDATE integration_settings.last_sync_at
- TelegramConfigForm.Testar → save({silent}) → invoke('send-telegram') ; CheckMk.Testar → invoke('checkmk-sync',{action:'test'}) ; TacticalRmm → invoke('tactical-rmm-sync',{action:'test'}) ; Evolution → invoke('send-whatsapp') ; Resend → invoke('send-email-resend')
- BancoInterConfigForm (load/save inline em integration_settings 'banco_inter') → Testar/Registrar → invoke('banco-inter',{action:'test'|'check_webhook'|'register_webhook'}); certificados .crt/.key lidos no cliente como base64 e salvos no JSONB
- NoContactCheckConfigForm → React Query em integration_settings 'no_contact_check' → 'Executar Agora' → invoke('check-no-contact-tickets')
- IntegrationsTab aba Rede → <UnifiConfigForm/> SEM clientId (QUEBRADO) — o fluxo correto é ClientNetworkTab → <UnifiConfigForm clientId> → tabela unifi_controllers + invoke('unifi-sync',{action:test|list_sites|sync})
- URL /settings/feature-flags (admin) → FeatureFlagsPage → useFeatureFlags (React Query staleTime 5min) → SELECT feature_flags; upsert/delete → feature_flags. Consumo runtime: componentes chamam useFeatureFlag(key) → evaluateFlag local (FNV-1a userId:key)
- SettingsPage aba 'email-templates' → EmailTemplatesTab → EmailSettingsForm (email_settings + upload storage email-assets) e EmailTemplateEditor (email_templates)
- SettingsPage aba 'mappings' → ClientMappingsTab → invoke('tactical-rmm-sync'|'checkmk-sync', {action:'list_clients'|'list_folders'|'sync'}) → INSERT client_external_mappings → auto-sync monitored_devices

## Regras de negócio

- Ordem de avaliação de flag: disabled→false; user em enabled_for_user_ids→true (prioridade absoluta); enabled_for_roles definido e sem match→false; rollout≥100→true; senão bucket FNV-1a(userId:key)%100 < rollout — src/hooks/useFeatureFlag.ts:36-63
- Hash determinístico FNV-1a 32-bit para rollout gradual consistente por usuário — src/hooks/useFeatureFlag.ts:22-29,62
- Rollout clampado 0-100 no salvamento; chave em snake_case imutável na edição — src/pages/settings/FeatureFlagsPage.tsx:76 e :246 (disabled={!!form.id})
- integration_settings tem 1 linha por integration_type (upsert): update se existe, senão insert — src/hooks/useIntegrationSettings.ts:56-79
- Padrão Testar = salvar em modo silent e invocar edge com {action:'test'} — src/components/settings/integrations/CheckMkConfigForm.tsx:55-59; TacticalRmmConfigForm.tsx:56-59
- Resend: RESEND_API_KEY é secret de backend e nunca é gravada em integration_settings (só from_name/from_email) — src/components/settings/integrations/ResendConfigForm.tsx:185
- Banco Inter: certificados .crt/.key convertidos a base64 no navegador e persistidos no JSONB; webhook auto-registrado após salvar quando ativo e com credenciais+certs — src/components/settings/integrations/BancoInterConfigForm.tsx:109-121 e :250-264; sandbox bloqueado (força produção) :272-278
- Tactical RMM: migração única de sync_interval_minutes (legado) para horas após o load — src/components/settings/integrations/TacticalRmmConfigForm.tsx:40-47
- Status: sync manual só existe para tactical_rmm e checkmk; demais integrações mostram aviso 'não suporta sync manual' — src/components/settings/integrations/IntegrationStatusPanel.tsx:75-89
- ClientMappings: sugestão automática por nome normalizado (sem acento/especiais, 10 chars) + cache localStorage TTL 10min + mapeamento externo único (erro 23505) — src/components/settings/ClientMappingsTab.tsx:62-80,83-131,384-388
- NotificationRules: sem regras cadastradas → todos os técnicos recebem alertas; escalonamento com client_id null = padrão global — src/components/settings/NotificationRulesTab.tsx:306,430,504
- SettingsPage: item 'departments' só aparece com flag departments_enabled; aba 'users' navega para /settings/users; requiresAdmin/requiresManage filtram o menu — src/pages/settings/SettingsPage.tsx:100-104,110-113
- SystemTab: token de acesso ao TV dashboard regenerado com crypto.randomUUID (acesso público por token) — src/components/settings/SystemTab.tsx:56,70
- EmailSettingsForm: cores validadas por regex hex #RRGGBB (Zod); upload de logo ≤2MB em storage email-assets — src/components/settings/email-templates/EmailSettingsForm.tsx:24-26,105
- FeatureFlagsPage e AuditLogsPage protegidas por ProtectedRoute allowedRoles=['admin'] — src/components/layout/AnimatedRoutes.tsx:185,187

## Arquivos-chave

- `src/pages/settings/SettingsPage.tsx` — Shell do /settings: menu lateral por categoria (Gestão/Operações/Empresa/Comunicação), gating por permissão/role/flag e render lazy das abas.
- `src/pages/settings/FeatureFlagsPage.tsx` — CRUD admin de feature_flags (chave/descrição/enabled/rollout/roles/user_ids) com Dialog e AlertDialog de remoção. _(uso: parcial)_
- `src/pages/settings/AuditLogsPage.tsx` — Página dedicada de auditoria; renderiza AuditLogsList (redação de campos sensíveis prometida na descrição).
- `src/hooks/useFeatureFlag.ts` — useFeatureFlags (React Query, staleTime 5min) + useFeatureFlag(key) avaliando local (whitelist>roles>rollout FNV-1a).
- `src/hooks/useIntegrationSettings.ts` — Hook genérico load/save/patch contra integration_settings (1 linha por integration_type, upsert JSONB + is_active).
- `src/components/settings/IntegrationsTab.tsx` — Aba Integrações: Tabs (Status/Email/Calendário/Mensagens/Financeiro/Monitor/Rede/Automação/Logs) montando cada ConfigForm.
- `src/components/settings/integrations/IntegrationStatusPanel.tsx` — Resumo ativas/inativas por categoria + sync manual (só tactical_rmm/checkmk) + lista de CRONs hardcoded.
- `src/components/settings/integrations/IntegrationConfigCard.tsx` — Card compartilhado (header/badge ativo/switch/teste/salvar) para padronizar os ConfigForm. _(uso: parcial)_
- `src/components/settings/integrations/TelegramConfigForm.tsx` — Config bot Telegram (token/chat_id) via useIntegrationSettings; teste invoca send-telegram.
- `src/components/settings/integrations/CheckMkConfigForm.tsx` — Config CheckMK (url/user/secret/intervalo/alert_levels) via useIntegrationSettings; teste invoca checkmk-sync.
- `src/components/settings/integrations/TacticalRmmConfigForm.tsx` — Config Tactical RMM (url/api_key/imports) com migração legada minutes→hours; teste invoca tactical-rmm-sync.
- `src/components/settings/integrations/EvolutionApiConfigForm.tsx` — Config WhatsApp/Evolution (url/api_key/instance) + URL de webhook copiável; teste invoca send-whatsapp.
- `src/components/settings/integrations/BancoInterConfigForm.tsx` — Config Banco Inter (OAuth/PIX/certs base64), gestão de webhook e status de escopos; NÃO usa useIntegrationSettings (load/save inline).
- `src/components/settings/integrations/ResendConfigForm.tsx` — Config e-mail transacional (from_name/from_email); API key fica só em secret backend; teste invoca send-email-resend. load/save inline.
- `src/components/settings/integrations/NoContactCheckConfigForm.tsx` — Config verificação 'Sem Contato' (intervalo) em integration_settings; 'Executar Agora' invoca check-no-contact-tickets. React Query inline.
- `src/components/settings/integrations/UnifiConfigForm.tsx` — CRUD de controllers UniFi POR CLIENTE (tabela unifi_controllers), teste/sync via unifi-sync; exige prop clientId. _(uso: parcial)_
- `src/components/settings/SystemTab.tsx` — Config sistema: TV dashboard (token público via crypto.randomUUID), horário comercial e 'sobre'.
- `src/components/settings/AuditLogsTab.tsx` — Aba 'Auditoria': últimos 100 audit_logs com filtros (data/ação/tabela); mostra 3 primeiras chaves de new/old_data sem redação.
- `src/components/settings/LogsViewerTab.tsx` — Visualizador de application_logs (nível/módulo/busca), export CSV e detalhes; usado dentro da aba Logs de Integrações.
- `src/components/settings/ClientMappingsTab.tsx` — Vincula clientes internos a externos (Tactical/CheckMK) com sugestão fuzzy, cache localStorage e auto-sync.
- `src/components/settings/NotificationRulesTab.tsx` — Regras de notificação por cliente/usuário e escalonamento de alertas (client_notification_rules/alert_escalation_settings).
- `src/components/settings/EmailTemplatesTab.tsx` — Aba Templates de e-mail: config visual global + edição de templates por categoria (email_templates).
- `src/components/settings/email-templates/EmailSettingsForm.tsx` — Config visual global dos e-mails (logo upload storage, cores, rodapé) em email_settings, com schema Zod.
- `src/components/settings/email-templates/EmailTemplateEditor.tsx` — Editor de template (assunto/HTML) com preview e ajuda de variáveis.
- `src/components/settings/email-templates/EmailPreview.tsx` — Preview renderizado do template de e-mail.
- `src/components/settings/email-templates/TemplateVariablesHelp.tsx` — Lista de variáveis disponíveis por tipo de template.
- `src/components/settings/BusinessHoursForm.tsx` — Form de horário comercial (company_settings) para cálculo de SLA.
- `src/components/settings/CategoriesTab.tsx` — CRUD de categorias de chamados + subcategorias.
- `src/components/settings/SubcategoriesSection.tsx` — Seção de subcategorias dentro de CategoriesTab.
- `src/components/settings/TagsTab.tsx` — CRUD de tags de chamados.
- `src/components/settings/SLATab.tsx` — Configuração de SLA por prioridade.
- `src/components/settings/DepartmentsTab.tsx` — CRUD de departamentos (gated por flag departments_enabled).
- `src/components/settings/RolePermissionsTab.tsx` — Gestão de permissões por papel (role_permission_overrides).
- `src/components/settings/CompanyTab.tsx` — Dados da empresa + horário comercial (company_settings).
- `src/components/settings/MessageLogsTab.tsx` — Histórico de mensagens enviadas (message_logs).
- `src/components/settings/MessageMetricsDashboard.tsx` — Métricas de mensageria multicanal.
- `src/components/settings/PendingInvitesTab.tsx` — Convites pendentes; abre diálogos de convite/ativação.
- `src/components/settings/InviteClientDialog.tsx` — Diálogo de convite de cliente.
- `src/components/settings/InviteStaffDialog.tsx` — Diálogo de convite de staff.
- `src/components/settings/ActivateInviteDialog.tsx` — Diálogo de ativação de convite.

## Pontos de atenção / riscos

- BUG DE RENDER: IntegrationsTab.tsx:99 renderiza <UnifiConfigForm /> sem a prop obrigatória clientId → useQuery filtra unifi_controllers.eq('client_id', undefined) e insert com client_id undefined; a aba 'Rede' em /settings fica quebrada. Uso correto é por-cliente em ClientNetworkTab.tsx:92.
- BUG LÓGICO: useFeatureFlag.ts:51-59 no ramo rollout<=0 faz `return Boolean(...) ? true : true` — ambos os ramos retornam true; logo, com rollout=0 e enabled=true sem enabled_for_roles, uma whitelist enabled_for_user_ids é ignorada (libera para todos em vez de só os IDs). O filtro por roles ainda funciona (curto-circuita antes, :43-46).
- REDUNDÂNCIA: adoção parcial das abstrações — useIntegrationSettings é usado por 6 forms, mas BancoInter/Resend/NoContactCheck reimplementam load/save inline; IntegrationConfigCard só é usado pelo Telegram (os demais duplicam o layout do Card).
- DUPLICAÇÃO DE UI: BusinessHoursForm é renderizado em duas abas distintas (SystemTab.tsx:218 e CompanyTab.tsx:766) editando o mesmo company_settings — dois caminhos para a mesma configuração.
- DUAS SUPERFÍCIES DE AUDITORIA: aba 'Auditoria' (AuditLogsTab, query direta a audit_logs, sem redação na UI) vs página /settings/audit-logs (AuditLogsPage→AuditLogsList, redação prometida) — potencial confusão/redundância.
- RISCO RLS (anotado, NÃO consultei o banco): integration_settings guarda segredos no JSONB (bot_token, api_key, client_secret, certificados). Se a policy de SELECT for para is_staff, um technician poderia lê-los. Resend já adota o padrão seguro (segredo no backend). Confirmar policy antes de qualquer mudança.
- IntegrationStatusPanel lista CRONs de forma HARDCODED (notify-sla-breach, check-contract-adjustments, generate-invoice-payments, poll-services) — pode divergir dos crons realmente agendados (não verificado).
- FeatureFlagsPage é funcional porém sem link de entrada na navegação (só por URL) — considerar adicionar item no menu de Settings ou remover a rota se descontinuada.
- Apenas 2 flags são efetivamente consumidas no código: 'gamification_enabled' e 'departments_enabled' (grep useFeatureFlag).

## Código morto — tratado na Fase 2 ou pendente de decisão

- `retornos load/setSettings de useIntegrationSettings` (src/hooks/useIntegrationSettings.ts) — O hook retorna load e setSettings, mas nenhum ConfigForm em escopo os desestrutura (usam settings/patch/isActive/setIsActive/loading/loaded/save). Provável superfície morta.

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA §3.15 já documenta corretamente os 2 principais achados (linha 812 bug do UnifiConfigForm sem clientId; linha 813 bug lógico de useFeatureFlag no ramo rollout<=0; linha 816 adoção parcial do IntegrationConfigCard só no Telegram) — nesse ponto o MAPA CONFERE com o código.
- MAPA §3.15 linha 799 lista 'useSavedViews.ts' como hook do módulo, mas nenhum arquivo do escopo de Configurações/Flags/Integrações importa useSavedViews — atribuição aparentemente stale/incorreta para este setor.
- MAPA §3.15 linha 798 lista apenas IntegrationsTab/integrations/*/EmailTemplatesTab; omite as demais abas que fisicamente vivem em src/components/settings (AuditLogsTab, LogsViewerTab, ClientMappingsTab, NotificationRulesTab, SystemTab, SLATab, CategoriesTab, TagsTab, DepartmentsTab, RolePermissionsTab, CompanyTab, MessageLogsTab, MessageMetricsDashboard, invites) — provavelmente atribuídas a outros setores, mas a listagem do módulo fica incompleta.
- MAPA não registra que a rota /settings/feature-flags está SEM ponto de entrada na UI (nenhum link/nav aponta para ela; só acessível por URL direta) — a linha 833 apenas pede conferir o ProtectedRoute, não menciona a rota órfã de navegação.
- MAPA menciona redação de segredos em audit_logs só para integration_settings (linha 863); confirma-se que a AuditLogsTab da UI (src/components/settings/AuditLogsTab.tsx) exibe new_data/old_data cru (3 primeiras chaves) sem qualquer redação client-side, enquanto AuditLogsPage promete redação — inconsistência entre as duas superfícies de auditoria.

