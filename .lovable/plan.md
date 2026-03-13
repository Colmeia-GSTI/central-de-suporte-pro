

# Plano Revisado: Integração UniFi UDM - Alarmes + Monitoramento + Topologia

## Status: ✅ IMPLEMENTADO (Fases 1-5)

### Fase 1: Database ✅
- 4 tabelas criadas: `unifi_controllers`, `network_sites`, `network_topology`, `unifi_sync_logs`
- `monitored_devices` expandido com `mac_address`, `firmware_version`, `model`, `site_id`
- RLS `is_staff()` + `service_role` em todas

### Fase 2: Edge Function `unifi-sync` ✅
- Ações: `test`, `list_sites`, `sync`
- Método Direct: login/sites/devices/LLDP/alarms/health/logout
- Método Cloud: hosts/devices via api.ui.com
- Alarmes mapeados para `monitoring_alerts` existente
- Timeout 10s, log em `unifi_sync_logs`

### Fase 3: UI Config ✅
- `UnifiConfigForm.tsx` com RadioGroup Direct/Cloud
- Campos condicionais, teste de conexão, sync manual
- Aba "Rede" adicionada ao `IntegrationsTab.tsx`
- `IntegrationStatusPanel` atualizado com UniFi

### Fase 4: Client Network Tab ✅
- `ClientNetworkTab.tsx` com resumo de sites/devices/Wi-Fi
- `NetworkTopologyMap.tsx` com SVG hierárquico (Gateway→Switch→AP)
- Aba "Rede" no `ClientDetailPage.tsx`

### Fase 5: CRON ✅
- pg_cron configurado: `unifi-sync-hourly` a cada hora
- Edge Function verifica `sync_interval_hours` internamente

## Arquivos Criados/Modificados
| Arquivo | Ação |
|---|---|
| `supabase/functions/unifi-sync/index.ts` | Criado |
| `src/components/settings/integrations/UnifiConfigForm.tsx` | Criado |
| `src/components/clients/ClientNetworkTab.tsx` | Criado |
| `src/components/clients/NetworkTopologyMap.tsx` | Criado |
| `src/components/settings/IntegrationsTab.tsx` | Modificado (aba Rede) |
| `src/components/settings/integrations/IntegrationStatusPanel.tsx` | Modificado (UniFi) |
| `src/pages/clients/ClientDetailPage.tsx` | Modificado (aba Rede) |
| `supabase/config.toml` | Modificado (unifi-sync) |
