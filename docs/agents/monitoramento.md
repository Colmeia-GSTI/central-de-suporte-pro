# Monitoramento e Serviços (RMM/UniFi/CheckMK)

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo MSP que agrega devices de 3 fontes externas (Tactical RMM, CheckMK, UniFi) em monitored_devices e gera monitoring_alerts com notificação multicanal. A tela /monitoring lê via React Query, dispara sync manual das edges e permite reconhecer alertas / abrir ticket. Estado: funcional mas com bugs reais confirmados (param controllerId vs controller_id na unifi-sync; realtime prometido mas inexistente na tela) e escopo misturado no MAPA (poll-services/ServiceForm/useServiceCodeUsageStats são financeiro, não RMM). Sync UniFi 'direct' on-prem roda por worker externo (relay-unifi.ts) via RPCs unifi_relay_*, não pela edge.

## Integrações

- Tactical RMM — REST X-API-KEY (settings.url/api_key em integration_settings 'tactical_rmm'); endpoints /clients/, /agents/, /agents/{id}/checks/
- CheckMK — REST API 1.0 Bearer 'username secret' (integration_settings 'checkmk'); host_config/host/service/folder_config collections
- UniFi — direct (cookie unifises via /api/login, /api/s/{site}/stat/device, /rest/alarm, /stat/health) e cloud (api.ui.com/v1 /hosts,/devices,/sites X-API-KEY); credenciais em unifi_controllers (password_encrypted/cloud_api_key_encrypted)
- UniFi OS on-prem — via relay-unifi.ts na tailnet (Tailscale), auth como relay-unifi@ + RPCs unifi_relay_* (Vault UNIFI_RELAY_PASSWORD)
- Notificação de alerta — Evolution API (WhatsApp), Telegram Bot, Resend (via send-email-resend); prefs em profiles/client_notification_rules; log em message_logs

## Fluxos (rota → componente → hook → edge → tabela)

- /monitoring -> ProtectedRoute(requireStaff) -> MonitoringPage -> useQuery supabase.from('monitored_devices').select('*,clients(name)') e from('monitoring_alerts') status=active -> render abas Dispositivos/Alertas/Gráficos
- MonitoringPage 'Sincronizar' -> checa integration_settings/unifi_controllers is_active -> invoke checkmk-sync + tactical-rmm-sync + unifi-sync (action=sync) -> fetch APIs externas -> upsert monitored_devices + insert/resolve monitoring_alerts -> invalidateQueries
- Alertas -> GroupedAlertsTable: 'Reconhecer' -> update monitoring_alerts status=acknowledged/acknowledged_at (MonitoringPage:150-177); 'Ticket' -> navigate('/tickets?action=new&title=...&client_id=...')
- INSERT monitoring_alerts -> trigger notify_on_monitoring_alert (net.http_post) -> send-alert-notification -> notifications(in-app) + WhatsApp(evolution_api)/Telegram + send-email-resend (só critical/warning) + message_logs
- Settings/Integrações -> CheckMk/TacticalRmm ConfigForm -> invoke checkmk-sync/tactical-rmm-sync (test/sync); ClientMappingsTab salvar mapeamento -> invoke tactical-rmm-sync+checkmk-sync sync -> resolve client_id via client_external_mappings
- ClientNetworkTab (cliente) -> UnifiConfigForm -> invoke unifi-sync (test/list_sites/sync, method direct|cloud) -> monitored_devices/network_sites/network_topology/unifi_sync_logs; useUnifiedNetworkDevices mescla doc_devices+monitored_devices(unifi)
- relay-unifi.ts (LXC) -> auth password relay-unifi@ -> RPC unifi_relay_list_controllers (só direct/ativos) -> UniFi OS via Tailscale -> unifi_relay_upsert_device/post_alert/log_sync -> monitored_devices/network_sites/monitoring_alerts/unifi_sync_logs

## Regras de negócio

- CheckMK: host online sse state==0 (UP) — checkmk-sync/index.ts:51 isHostOnline
- CheckMK: mapeia estado de serviço -> nível de alerta (2=critical,1=warning,3=info) — checkmk-sync/index.ts:57 mapServiceStateToLevel
- CheckMK: device_type inferido por label cmk/device_type ou convenção de hostname — checkmk-sync/index.ts:29 detectDeviceType
- CheckMK: importa alerta conforme alert_levels (crit/warn default ON, unknown default OFF) — checkmk-sync/index.ts:299-302
- Tactical/CheckMK: só CRIA device novo se houver mapeamento de cliente (senão conta como 'unmapped') — tactical-rmm-sync:404 / checkmk-sync:454
- Tactical: nível do alerta offline = critical se agent.overdue_dashboard_alert, senão warning — tactical-rmm-sync/index.ts:386
- Tactical: ao voltar online resolve TODOS os alertas ativos do device (sem filtro de título) — tactical-rmm-sync/index.ts:393-400
- Tactical: métricas CPU/RAM/disk = média das últimas 10 leituras dos checks — tactical-rmm-sync/index.ts:300-330
- CheckMK dedup de alerta por device_id+status+title — checkmk-sync:400-406,431-437; Tactical dedup só por device_id+status — tactical-rmm-sync:372-377 (inconsistente)
- UniFi: severidade de alarme por conjuntos CRITICAL/WARNING_ALARMS — unifi-sync:29-45 mapAlarmSeverity; dedup por device_id+status+service_name — unifi-sync:678-684
- UniFi sync-all: só sincroniza controller se now-last_sync_at >= sync_interval_hours — unifi-sync/index.ts:1057-1062
- send-alert-notification: só processa payload type=INSERT e record.status=active — send-alert-notification/index.ts:233
- send-alert-notification: destinatários por client_notification_rules.notify_on_<level>; se vazio, fallback para todo staff (admin/manager/technician) — :266-279
- send-alert-notification: e-mail (Resend) só para critical/warning, nunca info — :354
- Relay: RPCs exigem is_staff(auth.uid()) e MAC obrigatório; post_alert só cria se não houver alerta ativo idêntico (device_id+status+service_name) — migration 20260601120000:117,121,208-217

## Arquivos-chave

- `src/pages/monitoring/MonitoringPage.tsx` — Tela principal: cards de status, abas Dispositivos/Alertas/Gráficos, filtro de nível, agrupamento, sync manual e reconhecimento de alertas
- `src/components/monitoring/GroupedAlertsTable.tsx` — Tabela de alertas ativos com agrupamento por cliente/dispositivo, seleção múltipla, botão Reconhecer e criar ticket a partir do alerta
- `src/components/monitoring/UptimeCharts.tsx` — Gráficos recharts: devices por origem (barras online/offline), pizza online/offline geral e devices por cliente
- `supabase/functions/tactical-rmm-sync/index.ts` — Edge: test/list_clients/sync de agentes Tactical RMM (X-API-KEY); upsert monitored_devices + service_data (hardware/metrics) + alertas offline
- `supabase/functions/checkmk-sync/index.ts` — Edge: test/list_folders/sync de hosts CheckMK (Bearer 'user secret'); device_type por hostname, contadores de serviço, alertas host-down e por serviço
- `supabase/functions/unifi-sync/index.ts` — Edge: test/list_sites/sync UniFi via método direct (cookie) ou cloud (api.ui.com v1); upsert monitored_devices/network_sites/topology, alarmes->monitoring_alerts, unifi_sync_logs
- `supabase/functions/send-alert-notification/index.ts` — Edge: ao inserir alerta, cria notificação in-app e envia WhatsApp/Telegram/e-mail conforme client_notification_rules/profiles; grava message_logs
- `relay-unifi/relay-unifi.ts` — Worker Deno externo (LXC na tailnet) que sincroniza UniFi OS 'direct' via Tailscale sem service_role, autenticando como relay-unifi@ e usando RPCs escopadas
- `src/components/settings/integrations/TacticalRmmConfigForm.tsx` — Formulário de configuração Tactical RMM (URL/API key/flags de import) com test/save/sync
- `src/components/settings/integrations/CheckMkConfigForm.tsx` — Formulário de configuração CheckMK (URL/user/secret/alert_levels)
- `src/components/settings/integrations/UnifiConfigForm.tsx` — Config de controllers UniFi POR CLIENTE (direct/cloud), test/list_sites/sync _(uso: parcial)_
- `src/hooks/useUnifiedNetworkDevices.ts` — Mescla doc_devices + monitored_devices(unifi) de um cliente para a aba de rede da documentação _(uso: parcial)_
- `src/hooks/useUnifiedRealtime.tsx` — Provider realtime global (canal unified-realtime) _(uso: parcial)_
- `supabase/functions/poll-services/index.ts` — FINANCEIRO (fora do escopo RMM): polling fallback de boletos/pagamentos/NFS-e Asaas/Inter
- `src/components/services/ServiceForm.tsx` — FINANCEIRO (fora do escopo RMM): cadastro/edição de serviços faturáveis
- `src/hooks/useServiceCodeUsageStats.ts` — FINANCEIRO/NFS-e (fora do escopo RMM): estatísticas de uso de código de serviço

## Pontos de atenção / riscos

- BUG confirmado: MonitoringPage.tsx:220 envia { controllerId: ctrl.id } mas unifi-sync/index.ts:885 lê body.controller_id -> o id chega undefined e cada chamada por-controller cai no ramo 'sincroniza todos os controllers vencidos'; com N controllers = N execuções redundantes do sync-all (risco de corrida).
- Realtime enganoso: MonitoringPage.tsx:7 e :101 afirmam que o realtime é tratado por useUnifiedRealtime, mas o hook só assina 'tickets' e 'notifications' (useUnifiedRealtime.tsx:261,268,275). A tela de monitoramento NÃO atualiza em tempo real; a migration 20260119181153 adicionou monitored_devices à publicação supabase_realtime, mas não há consumidor no frontend.
- Duplicação de caminho 'direct' do UniFi: a edge unifi-sync trata connection_method='direct' (unifi-sync:558) E o relay-unifi.ts também trata direct (UniFi OS). A partir do Supabase cloud a edge dificilmente alcança controllers on-prem, então o relay é o caminho real — dois fluxos para o mesmo fim. Lógica de mapeamento (CRITICAL_ALARMS/WARNING_ALARMS/mapAlarmSeverity/mapDeviceType) está copiada entre unifi-sync/index.ts:29-53 e relay-unifi.ts:34-57.
- Dedup de alertas divergente entre fontes: tactical (device_id+status) vs checkmk (device_id+status+title) vs unifi (device_id+status+service_name). Em tactical, alertas de tipos diferentes podem se suprimir; e o resolve-on-online do tactical (sem filtro de título) fecha alertas de serviço alheios.
- tactical-rmm-sync não grava last_sync_at no controller/integração (apenas o front invalida cache); dificulta agendamento por intervalo como o unifi-sync faz.
- Config divergente: checkmk-sync e unifi-sync têm verify_jwt=false + CORS '*' (rodam com service role); tactical-rmm-sync NÃO está em config.toml (verify_jwt=true default). send-alert-notification também não está em config.toml — funciona porque o trigger DB envia SERVICE_ROLE_KEY como Bearer.
- Matching frágil em useUnifiedNetworkDevices.ts:93-107: casa doc_devices x monitored_devices por nome/MAC em lowercase; unifi_device_id é usado só como gate booleano (linha 93), não como chave de correlação — pode gerar match incorreto ou duplicado.
- UnifiConfigForm exige prop clientId (UnifiConfigForm.tsx:54) mas IntegrationsTab.tsx:99 o renderiza sem clientId -> query/insert com clientId undefined na aba Rede de /settings (uso correto é por-cliente em ClientNetworkTab).

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA §2/linha 101 lista cron 'unifi-sync-hourly' (0 * * * *) -> unifi-sync, mas NÃO existe cron.schedule para unifi-sync/checkmk-sync/tactical-rmm-sync em supabase/migrations (grep 0 resultados). Pode ser gerenciado no dashboard Supabase (não verificável em leitura); o próprio MAPA linha 820 admite 'IntegrationStatusPanel lista crons hard-coded'. DÚVIDA a confirmar no banco/pg_cron (não consultado).
- MAPA §3.7 (linha 415) lista 'src/components/services/ServiceForm.tsx' como componente do módulo Monitoramento, contradizendo a própria NOTA (linhas 411/429) de que ServiceForm/useServiceCodeUsageStats/poll-services são financeiro/NFS-e. Inconsistência interna: esses 3 confirmadamente NÃO pertencem ao RMM.
- MAPA §3.7 (linha 416) lista useServiceCodeUsageStats.ts e useDocDeviceSync/useDocSync como hooks de Monitoramento; na prática useServiceCodeUsageStats é NFS-e (usado só em ServiceCodeSelect/NfseServiceCodeCombobox) e os useDoc* pertencem ao módulo Clientes/Documentação.
- Ponto onde o MAPA ACERTA (sem divergência, apenas confirmação): bug controllerId vs controller_id (5.9/1239), realtime inexistente na tela (430), dedup divergente tactical vs checkmk (436), tactical resolve todos alertas ao voltar online (437), tactical-rmm-sync com verify_jwt=true default divergindo de checkmk/unifi (1296), UnifiConfigForm sem clientId em IntegrationsTab (812/1240) — todos verificados como reais no código.

