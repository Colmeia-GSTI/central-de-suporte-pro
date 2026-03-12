

# Plano Revisado: Integração UniFi UDM - Alarmes + Monitoramento + Topologia

## Resultado da Verificacao do Codigo Existente

| Item | Status |
|---|---|
| Tabela `unifi_controllers` | Nao existe |
| Tabela `unifi_devices` | Nao existe |
| Tabela `unifi_alarms` | Nao existe |
| Integracao UniFi qualquer | Nao existe |
| Central de alertas (`monitoring_alerts`) | Existe e funcional |
| Tabela `monitored_devices` | Existe, com `external_source` (text), `device_type`, `ip_address`, `service_data` (JSONB) |
| Enums de alerta | `alert_level`: critical, warning, info / `alert_status`: active, acknowledged, resolved |
| Edge Functions de sync existentes | `checkmk-sync` e `tactical-rmm-sync` (mesmo padrao) |
| Trigger de alerta | `notify_on_monitoring_alert` ja dispara notificacoes ao inserir em `monitoring_alerts` |
| Configuracoes de integracao | Armazenadas em `integration_settings` |

**Conclusao**: Nao existe NADA de UniFi. A central de alertas e o `monitoring_alerts` + `monitored_devices`, ja usados por CheckMK e Tactical RMM. Os alarmes UniFi devem ser inseridos nessas mesmas tabelas, seguindo o padrao existente.

---

## Decisao Arquitetural: Nao Criar Tabelas Duplicadas

O prompt original propoe tabelas separadas (`unifi_devices`, `unifi_alarms`, `unifi_network_topology`). Porem, o sistema ja possui `monitored_devices` e `monitoring_alerts` que servem exatamente esse proposito para CheckMK e Tactical RMM. Manter o padrao existente:

- **Devices UniFi** → `monitored_devices` com `external_source = 'unifi'`
- **Alarmes UniFi** → `monitoring_alerts` vinculados ao `device_id` do `monitored_devices`
- **Controllers** → Nova tabela `unifi_controllers` (necessaria, nao existe equivalente)
- **Sites/Filiais** → Nova tabela `network_sites` (novo conceito, nao existe)
- **Topologia LLDP** → Nova tabela `network_topology` (novo conceito, nao existe)
- **Log de sync** → Nova tabela `unifi_sync_logs` (equivalente ao proposto `unifi_alarm_syncs`)

Isso evita duplicacao e garante que a pagina de Monitoramento, dashboards e notificacoes existentes funcionem automaticamente com devices UniFi.

---

## Tabelas a Criar (4 novas)

### 1. `unifi_controllers`
Credenciais e configuracao de cada UDM por cliente:
- `id`, `client_id` (FK clients), `name`
- `connection_method` ('direct' | 'cloud')
- Direct: `url`, `username`, `password_encrypted`, `ddns_hostname`
- Cloud: `cloud_api_key_encrypted`, `cloud_host_id`
- `is_active`, `sync_interval_hours` (3/6/12), `last_sync_at`, `last_error`
- `created_at`, `updated_at`

### 2. `network_sites`
Sites/filiais descobertos no UDM:
- `id`, `controller_id` (FK unifi_controllers), `client_id` (FK clients)
- `site_code`, `site_name`, `device_count`, `client_count`
- `health_status` (JSONB), `last_sync_at`

### 3. `network_topology`
Conexoes LLDP para mapa de rede (apenas method direct):
- `id`, `site_id` (FK network_sites), `client_id`
- `device_mac`, `device_name`, `device_port`
- `neighbor_mac`, `neighbor_name`, `neighbor_port`
- `connection_type` ('ethernet' | 'wireless')

### 4. `unifi_sync_logs`
Historico de cada execucao de sync:
- `id`, `controller_id`, `sync_timestamp`
- `devices_synced`, `alarms_collected`, `alarms_new`, `alerts_posted`
- `status` ('success' | 'error' | 'partial'), `error_message`, `duration_ms`

### Expandir `monitored_devices`
Adicionar campos para dados de rede:
- `mac_address TEXT`
- `firmware_version TEXT`
- `model TEXT`
- `site_id UUID` (FK network_sites, nullable)

### RLS
Todas as tabelas: `is_staff(auth.uid())` para todas as operacoes.

---

## Edge Function: `unifi-sync`

Segue o mesmo padrao de `checkmk-sync` e `tactical-rmm-sync`. Acoes:

| Acao | Descricao |
|---|---|
| `test` | Testa conexao (direct: login+sites / cloud: list hosts) |
| `list_sites` | Lista sites do UDM para visualizacao |
| `sync` | Sincroniza devices + alarmes + topologia |

### Fluxo de Sync

```text
1. Buscar controllers ativos de unifi_controllers
2. Para cada controller:
   a. Verificar se e hora de sincronizar (sync_interval_hours)
   b. Conectar (direct ou cloud)
   c. Listar sites → upsert network_sites
   d. Para cada site:
      - Buscar devices → upsert monitored_devices (external_source='unifi')
      - [direct] Extrair LLDP → upsert network_topology
      - [direct] GET /api/s/{site}/rest/alarm → criar monitoring_alerts
      - Buscar health → alertas de subsistema
   e. Desconectar
   f. Registrar em unifi_sync_logs
```

### Metodo Direct
- Auth: `POST /api/login` (cookie session, `rejectUnauthorized: false`)
- Sites: `GET /api/self/sites`
- Devices: `GET /api/s/{site}/stat/device` (inclui `lldp_table`)
- Alarmes: `GET /api/s/{site}/rest/alarm?archived=false`
- Health: `GET /api/s/{site}/stat/health`
- Logout: `POST /api/logout`
- Timeout: 10s

### Metodo Cloud
- Auth: Header `X-API-KEY: {api_key}`
- Hosts: `GET https://api.ui.com/ea/hosts`
- Devices: `GET https://api.ui.com/ea/sites/{host_id}/devices`
- Sem alarmes (API cloud nao expoe endpoint de alarms)
- Sem LLDP (topologia indisponivel)

### Mapeamento de Alarmes UniFi → monitoring_alerts

| Campo UniFi | Campo monitoring_alerts |
|---|---|
| `key` (EVT_LU_DISCONNECTED etc) | `service_name` |
| Mapeado por severity | `level` (critical/warning/info) |
| `msg` | `title` |
| Descricao formatada | `message` |
| `device_id` do monitored_devices | `device_id` |
| 'active' | `status` |

Mapeamento de severidade:
- `EVT_LU_DISCONNECTED`, `EVT_GW_WANTransition` → critical
- `EVT_AP_Lost`, `EVT_SW_Lost` → critical
- `EVT_LU_Connected`, `EVT_AP_RestartedUnknown` → warning
- Demais → info

### Tratamento de Erros
- Timeout 10s por controller
- Se controller inacessivel: grava `last_error`, NAO gera alertas falsos nos devices
- Retry: 3 tentativas com backoff (1s, 2s, 4s)
- Log de cada execucao em `unifi_sync_logs`

### CRON
Execucao a cada 1 hora. A funcao verifica internamente o `sync_interval_hours` de cada controller e so sincroniza se estiver na hora.

---

## Frontend

### 1. `UnifiConfigForm.tsx` (nova aba em Integracoes)
- RadioGroup: Direct / Cloud
- Campos condicionais:
  - Direct: URL (IP ou DDNS), Usuario, Senha
  - Cloud: API Key, seletor de Host (apos testar)
- Selecao de cliente
- RadioGroup frequencia: 3h / 6h / 12h
- Botao "Testar Conexao" e "Sincronizar Agora"
- Lista de controllers cadastrados com status
- Badge informando: "Alarmes disponiveis apenas com conexao direta"
- Instrucoes inline de DDNS (para clientes sem IP fixo)

### 2. Expandir `IntegrationsTab.tsx`
- Nova aba "Rede" (icone Wifi) entre "Monitor" e "Automacao"

### 3. Expandir `IntegrationStatusPanel.tsx`
- Card de status UniFi: controllers ativos, devices sincronizados, ultimo sync

### 4. Expandir `ClientMappingsTab.tsx`
- Source `unifi` no seletor, listando sites como clientes externos

### 5. Nova aba "Rede" no `ClientDetailPage.tsx`
- Lista de sites/filiais com resumo (devices, clientes Wi-Fi, saude)
- Lista de devices UniFi por site
- Mapa de topologia SVG (apenas para controllers direct com LLDP)

### 6. `NetworkTopologyMap.tsx`
- Visualizacao hierarquica: Gateway → Switches → APs
- Icones por tipo, cores por status (online/offline)
- Filtro por site
- Para controllers cloud: exibe lista simples com aviso

### 7. Pagina de Monitoramento (ja existente)
- Devices UniFi aparecem automaticamente (usam `monitored_devices`)
- Alarmes UniFi aparecem automaticamente (usam `monitoring_alerts`)
- Notificacoes disparam automaticamente via trigger existente `notify_on_monitoring_alert`

---

## Seguranca
- Senhas/API keys criptografadas via `certificate-vault` Edge Function (AES-256-GCM, mesmo padrao dos certificados)
- RLS `is_staff()` em todas as tabelas novas
- Recomendacao ao usuario: conta read-only no UDM
- Edge Function com `verify_jwt = false` (padrao das funcs de sync)

---

## Fases de Implementacao

| Fase | Escopo | Arquivos |
|---|---|---|
| 1 | Migration SQL: 4 tabelas + expand monitored_devices + RLS + indices | Migration SQL |
| 2 | Edge Function `unifi-sync` (test, list_sites, sync com direct+cloud+alarmes) | `supabase/functions/unifi-sync/index.ts`, `supabase/config.toml` |
| 3 | UI Config: `UnifiConfigForm` + aba Rede em Integracoes + status panel + mappings | `UnifiConfigForm.tsx`, `IntegrationsTab.tsx`, `IntegrationStatusPanel.tsx`, `ClientMappingsTab.tsx` |
| 4 | Aba "Rede" no cliente + mapa de topologia SVG | `ClientNetworkTab.tsx`, `NetworkTopologyMap.tsx`, `ClientDetailPage.tsx` |
| 5 | CRON job para sync automatico | SQL insert (pg_cron) |

