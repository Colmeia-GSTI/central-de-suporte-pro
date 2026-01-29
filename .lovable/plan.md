
# Plano Completo: Reestruturação do Sistema de Monitoramento

## Resumo Executivo

Este plano consolida as últimas 4 interações e implementa uma reestruturação completa do sistema de monitoramento, substituindo o **Uptime Kuma** pelo **CheckMK** e otimizando o **Tactical RMM** com visualização detalhada e economia de recursos.

---

## 1. Estratégia de Monitoramento por Tipo de Dispositivo

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ARQUITETURA FINAL DE MONITORAMENTO                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌───────────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │         TACTICAL RMM              │  │           CHECKMK               │ │
│  │                                   │  │                                 │ │
│  │  Notebooks / Desktops             │  │  Servidores (métricas + DB)    │ │
│  │                                   │  │  Impressoras (up/down)          │ │
│  │  Dados:                           │  │  APs/Wi-Fi (up/down)            │ │
│  │  - Status online/offline          │  │  Câmeras (up/down)              │ │
│  │  - Info básica HW (OS, CPU, RAM)  │  │  Switches (up/down)             │ │
│  │  - Média CPU/RAM/Disco (10 leit.) │  │  Roteadores (up/down)           │ │
│  │  - Precisa reboot                 │  │  Firewalls (up/down)            │ │
│  │                                   │  │                                 │ │
│  │  Sync: 3h, 6h ou 12h              │  │  Sync: 3h, 6h ou 12h            │ │
│  └───────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                               │
│                              ▼                  ▼                             │
│                    ┌─────────────────────────────────────────┐               │
│                    │      BANCO DE DADOS UNIFICADO           │               │
│                    │  monitored_devices.service_data (JSONB) │               │
│                    │  monitoring_alerts + service_name       │               │
│                    └─────────────────────────────────────────┘               │
│                                       ▼                                       │
│                    ┌─────────────────────────────────────────┐               │
│                    │    INTERFACE COM DROPDOWN EXPANSÍVEL    │               │
│                    │  Nível 1: Resumo (nome, IP, status)     │               │
│                    │  Nível 2: Detalhes (OS, HW, métricas)   │               │
│                    └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Alterações no Banco de Dados

### 2.1 Expandir tabela `monitored_devices`

```sql
ALTER TABLE monitored_devices 
ADD COLUMN IF NOT EXISTS needs_reboot BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS service_data JSONB DEFAULT '{}';

COMMENT ON COLUMN monitored_devices.needs_reboot IS 
'Indica se o dispositivo precisa de reinicialização (do Tactical RMM)';

COMMENT ON COLUMN monitored_devices.service_data IS 
'Dados detalhados da fonte externa em formato JSON';
```

### 2.2 Expandir tabela `monitoring_alerts`

```sql
ALTER TABLE monitoring_alerts 
ADD COLUMN IF NOT EXISTS service_name TEXT,
ADD COLUMN IF NOT EXISTS check_output TEXT;

COMMENT ON COLUMN monitoring_alerts.service_name IS 
'Nome do serviço CheckMK (ex: CPU utilization, Disk C:, SQL Server)';

COMMENT ON COLUMN monitoring_alerts.check_output IS 
'Saída detalhada do check com informações técnicas para diagnóstico';
```

### 2.3 Estrutura do campo `service_data`

**Para computadores (Tactical RMM):**
```json
{
  "os": "Windows 11 Pro 23H2",
  "os_version": "10.0.22631",
  "platform": "windows",
  "cpu_model": "Intel Core i7-12700",
  "cpu_cores": 12,
  "ram_total_gb": 32,
  "boot_time": "2025-01-28T08:30:00Z",
  "agent_version": "2.7.0",
  "metrics": {
    "cpu_avg_percent": 35.2,
    "ram_avg_percent": 68.5,
    "disk_avg_percent": 45.0,
    "last_updated_at": "2025-01-29T12:00:00Z"
  }
}
```

**Para servidores (CheckMK):**
```json
{
  "services": {
    "ok": 15,
    "warn": 2,
    "crit": 0,
    "unknown": 0
  },
  "last_check_at": "2025-01-29T12:00:00Z"
}
```

---

## 3. Nova Edge Function: `checkmk-sync`

### 3.1 Criar arquivo `supabase/functions/checkmk-sync/index.ts`

**Funcionalidades:**
- `test`: Testar conexão com a API do CheckMK
- `list_folders`: Listar pastas (para mapeamento de clientes)
- `sync`: Sincronizar hosts e estados

**Autenticação CheckMK:**
```typescript
headers: {
  "Authorization": `Bearer ${username} ${automation_secret}`,
  "Accept": "application/json"
}
```

**Endpoints da API CheckMK:**
| Endpoint | Descrição |
|----------|-----------|
| `/api/1.0/domain-types/folder_config/collections/all` | Listar pastas |
| `/api/1.0/domain-types/host_config/collections/all` | Listar hosts |
| `/api/1.0/domain-types/service/collections/all?state!=0` | Serviços com problemas |

**Lógica de detecção de tipo de dispositivo:**
```typescript
function detectDeviceType(host): string {
  const name = host.name.toLowerCase();
  const labels = host.labels || {};
  
  // Por label explícito (preferência)
  if (labels['cmk/device_type']) return labels['cmk/device_type'];
  
  // Por convenção de nome
  if (name.startsWith('srv') || name.includes('server')) return 'server';
  if (name.includes('print') || name.includes('imp')) return 'printer';
  if (name.includes('cam') || name.includes('camera')) return 'camera';
  if (name.startsWith('ap-') || name.includes('wifi')) return 'access_point';
  if (name.startsWith('sw-') || name.includes('switch')) return 'switch';
  if (name.includes('router') || name.includes('rtr')) return 'router';
  if (name.includes('fw') || name.includes('firewall')) return 'firewall';
  if (name.includes('ups') || name.includes('nobreak')) return 'ups';
  
  return 'other';
}
```

**Lógica de sincronização para servidores vs dispositivos de rede:**
- **Servidores**: Buscar contadores de serviços (OK/WARN/CRIT) e criar alertas detalhados
- **Dispositivos de rede**: Apenas status UP/DOWN

### 3.2 Atualizar `supabase/config.toml`

```toml
project_id = "silefpsayliwqtoskkdz"

[functions.bootstrap-admin]
verify_jwt = false

[functions.checkmk-sync]
verify_jwt = false
```

---

## 4. Atualizar Edge Function: `tactical-rmm-sync`

### 4.1 Modificações principais

1. **Aumentar intervalo padrão**: 60min para 180min (3h)
2. **Adicionar busca de detalhes** por agente (apenas online)
3. **Calcular médias** das últimas 10 leituras de CPU/RAM/Disco
4. **Salvar em `service_data`** e `needs_reboot`
5. **Normalizar `device_type`** sempre como `computer`

### 4.2 Novo fluxo de sincronização

```text
1. GET /agents/?detail=true (lista com detalhes básicos)
   ↓
2. Para cada agente ONLINE:
   GET /agents/{agent_id}/ (detalhes: OS, CPU, RAM)
   ↓
3. GET /agents/{agent_id}/checks/ (histórico de checks)
   ↓
4. Calcular médias das últimas 10 leituras
   ↓
5. Salvar em monitored_devices:
   - service_data: { os, hardware, metrics }
   - needs_reboot: true/false
   - device_type: "computer"
```

### 4.3 Lógica de cálculo de médias

```typescript
function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}

// Buscar últimas 10 leituras de CPU
const cpuChecks = checks.filter(c => c.check_type === 'cpuload');
const cpuValues = cpuChecks.slice(-10).map(c => c.last_value || 0);
const cpuAvg = calculateAverage(cpuValues);
```

---

## 5. Novo Formulário: `CheckMkConfigForm.tsx`

### 5.1 Criar arquivo `src/components/settings/integrations/CheckMkConfigForm.tsx`

**Campos de configuração:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `url` | text | URL base do CheckMK (ex: `https://checkmk.empresa.com/mysite`) |
| `username` | text | Usuário de automação |
| `secret` | password | Secret de automação |
| `sync_interval_hours` | radio | 3h, 6h ou 12h |
| `import_services` | toggle | Importar contadores de serviços para servidores |
| `alert_levels` | checkboxes | Níveis a importar: WARN, CRIT, UNKNOWN |
| `is_active` | switch | Ativo/Inativo |

**Layout visual:**
```text
┌─────────────────────────────────────────────────────────────┐
│ ✓ CheckMK                               [Configurado]       │
│   Monitoramento de servidores e dispositivos de rede        │
├─────────────────────────────────────────────────────────────┤
│ URL do CheckMK                                               │
│ [https://checkmk.empresa.com/mysite________________]        │
│                                                              │
│ Credenciais de Automação                                     │
│ Usuário    [automation____]  Secret [••••••••______]        │
│                                                              │
│ Intervalo de Sincronização                                   │
│ (○) 3 horas  (●) 6 horas  (○) 12 horas                     │
│                                                              │
│ Níveis de Alerta a Importar                                  │
│ [✓] CRIT (crítico)  [✓] WARN (aviso)  [ ] UNKNOWN          │
│                                                              │
│ [✓] Importar contadores de serviços para servidores         │
│                                                              │
│ [Testar Conexão]                          [Salvar]          │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Atualizar Formulário: `TacticalRmmConfigForm.tsx`

### 6.1 Modificações

1. **Intervalo de sincronização**: Mudar de minutos para horas (3h, 6h, 12h)
2. **Adicionar toggles**:
   - "Importar detalhes de hardware (CPU, RAM, OS)"
   - "Importar métricas de performance (médias)"
   - "Importar status de reinicialização pendente"
3. **Atualizar descrição**: "Gerencie computadores remotamente (sync: 3-12h)"

---

## 7. Componentes de Visualização com Dropdown Expansível

### 7.1 Criar `src/components/inventory/DeviceExpandableRow.tsx`

**Hierarquia de informações:**

**Nível 1 - Listagem (sempre visível):**
| Campo | Formato |
|-------|---------|
| Nome | Texto |
| IP Local | Texto (font-mono) |
| Precisa Reboot | Badge Sim/Não |
| Status | Badge Online/Offline |

**Nível 2 - Dropdown (on-click):**
| Seção | Campos |
|-------|--------|
| Sistema Operacional | Nome + Versão + Plataforma |
| Hardware | CPU (modelo + núcleos), RAM total |
| Métricas (Médias) | CPU %, RAM %, Disco % com barras visuais |
| Agente | Versão, Último boot, Última atualização |

### 7.2 Criar `src/components/inventory/DeviceDetailsPanel.tsx`

Painel interno do dropdown com layout organizado em seções.

### 7.3 Criar `src/components/inventory/MetricGauge.tsx`

Componente de barra de progresso visual para métricas:
```text
┌─────────┐
│ CPU     │
│  35%    │
│ ████░░░ │
└─────────┘
```

**Cores por faixa:**
- 0-50%: Verde (bg-status-success)
- 51-80%: Amarelo (bg-status-warning)
- 81-100%: Vermelho (bg-status-danger)

### 7.4 Estrutura visual do dropdown

```text
┌───────────────────────────────────────────────────────────────────────────┐
│ ▶ 💻 PC-FINANCEIRO    192.168.1.45    ✓ Não    🟢 Online      [Expandir] │
├───────────────────────────────────────────────────────────────────────────┤
│ (Expandido)                                                                │
│ ┌─────────────────────────────────────────────────────────────────────┐   │
│ │ Sistema Operacional                                                   │   │
│ │ Windows 11 Pro 23H2 (10.0.22631)                                     │   │
│ ├─────────────────────────────────────────────────────────────────────┤   │
│ │ Hardware                                                              │   │
│ │ CPU: Intel Core i7-12700 (12 núcleos)  •  RAM: 32 GB                 │   │
│ ├─────────────────────────────────────────────────────────────────────┤   │
│ │ Métricas (Média últimas leituras)                   Atualizado: 2h   │   │
│ │ ┌─────────┐ ┌─────────┐ ┌─────────┐                                  │   │
│ │ │ CPU     │ │ RAM     │ │ Disco   │                                  │   │
│ │ │  35%    │ │  68%    │ │  45%    │                                  │   │
│ │ │ ████░░░ │ │ ██████░ │ │ ████░░░ │                                  │   │
│ │ └─────────┘ └─────────┘ └─────────┘                                  │   │
│ ├─────────────────────────────────────────────────────────────────────┤   │
│ │ Agente                                                               │   │
│ │ Versão: 2.7.0  •  Último boot: 28/01/2025 08:30                     │   │
│ └─────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Atualizar Componentes Existentes

### 8.1 `src/components/clients/ClientAssetsList.tsx`

- Substituir tabela simples por tabela com linhas expansíveis
- Usar `DeviceExpandableRow` para dispositivos RMM
- Manter compatibilidade com ativos manuais (sem expansão)

### 8.2 `src/pages/inventory/InventoryPage.tsx`

- Adicionar nova aba "Dispositivos Monitorados" 
- Exibir todos os dispositivos de todos os clientes
- Permitir filtro por cliente
- Usar mesmo componente expansível

### 8.3 `src/pages/monitoring/MonitoringPage.tsx`

- Adicionar ícones por tipo de dispositivo na tabela
- Adicionar coluna "Serviços" para servidores (contadores OK/WARN/CRIT)
- Atualizar função `handleRefresh` para chamar CheckMK ao invés de Uptime Kuma
- Adicionar suporte ao novo campo `needs_reboot`

**Ícones por tipo de dispositivo:**
| Tipo | Ícone Lucide | Cor |
|------|--------------|-----|
| computer | Laptop | Azul |
| server | Server | Roxo |
| printer | Printer | Cinza |
| access_point | Wifi | Verde |
| camera | Camera | Laranja |
| switch | Network | Azul escuro |
| router | Globe | Verde |
| firewall | Shield | Vermelho |
| ups | Battery | Amarelo |

### 8.4 `src/components/monitoring/GroupedAlertsTable.tsx`

- Exibir `service_name` (ex: "CPU utilization", "Disk C:")
- Exibir `check_output` como mensagem detalhada
- Exemplo: "Disk C: CRITICAL - 97.3% used (only 12.5 GB free)"

### 8.5 `src/components/settings/IntegrationsTab.tsx`

- Substituir `UptimeKumaConfigForm` por `CheckMkConfigForm`
- Manter `TacticalRmmConfigForm`

### 8.6 `src/components/settings/ClientMappingsTab.tsx`

- Substituir referências a `uptime_kuma` por `checkmk`
- Atualizar labels: "CheckMK" ao invés de "Uptime Kuma"
- Atualizar chamadas de função: `checkmk-sync` ao invés de `uptime-kuma-sync`
- Atualizar cache keys e storage

---

## 9. Arquivos a Remover (após validação)

| Arquivo | Motivo |
|---------|--------|
| `supabase/functions/uptime-kuma-sync/index.ts` | Substituído pelo CheckMK |
| `src/components/settings/integrations/UptimeKumaConfigForm.tsx` | Não mais necessário |

---

## 10. Resumo de Arquivos

### Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `supabase/functions/checkmk-sync/index.ts` | Edge function de sincronização CheckMK |
| `src/components/settings/integrations/CheckMkConfigForm.tsx` | Formulário de configuração |
| `src/components/inventory/DeviceExpandableRow.tsx` | Linha expansível de dispositivo |
| `src/components/inventory/DeviceDetailsPanel.tsx` | Painel de detalhes no dropdown |
| `src/components/inventory/MetricGauge.tsx` | Barra de progresso para métricas |

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/tactical-rmm-sync/index.ts` | Adicionar busca de detalhes, cálculo de médias, service_data, needs_reboot |
| `src/components/settings/integrations/TacticalRmmConfigForm.tsx` | Intervalos em horas, toggles de métricas |
| `src/components/settings/IntegrationsTab.tsx` | Substituir Uptime Kuma por CheckMK |
| `src/components/settings/ClientMappingsTab.tsx` | Suporte a CheckMK, remover uptime_kuma |
| `src/components/clients/ClientAssetsList.tsx` | Usar componente expansível |
| `src/pages/inventory/InventoryPage.tsx` | Adicionar aba de dispositivos monitorados |
| `src/pages/monitoring/MonitoringPage.tsx` | Ícones por tipo, coluna serviços, campo reboot |
| `src/components/monitoring/GroupedAlertsTable.tsx` | Exibir service_name e check_output |
| `supabase/config.toml` | Adicionar checkmk-sync |

### Arquivos a Remover

| Arquivo | Motivo |
|---------|--------|
| `supabase/functions/uptime-kuma-sync/index.ts` | Substituído pelo CheckMK |
| `src/components/settings/integrations/UptimeKumaConfigForm.tsx` | Não mais necessário |

---

## 11. Otimização de Recursos

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Uptime Kuma sync | 5-30 min | Removido |
| Tactical RMM sync | 15-60 min | 180-720 min (3-12h) |
| CheckMK sync | N/A | 180-720 min (3-12h) |
| **Execuções/dia** | ~96+ | ~4-8 |
| **Dados por sync** | Apenas status | Status + Hardware + Médias |
| **Telemetria real-time** | Importada | Permanece na fonte |

---

## 12. Cronograma de Implementação

| Fase | Tarefas | Prioridade |
|------|---------|------------|
| 1 | Migração banco (needs_reboot, service_data, service_name, check_output) | Alta |
| 2 | Edge function `checkmk-sync` | Alta |
| 3 | Formulário `CheckMkConfigForm` | Alta |
| 4 | Atualizar `ClientMappingsTab` (CheckMK) | Alta |
| 5 | Atualizar `IntegrationsTab` (substituir Uptime Kuma) | Alta |
| 6 | Atualizar `tactical-rmm-sync` (detalhes + médias) | Alta |
| 7 | Atualizar `TacticalRmmConfigForm` (intervalos + toggles) | Média |
| 8 | Criar componentes expansíveis (DeviceExpandableRow, etc.) | Média |
| 9 | Atualizar `ClientAssetsList` com dropdown | Média |
| 10 | Atualizar `InventoryPage` com aba de dispositivos | Média |
| 11 | Atualizar `MonitoringPage` (ícones, serviços) | Média |
| 12 | Atualizar `GroupedAlertsTable` (detalhes do check) | Média |
| 13 | Remover Uptime Kuma (após 2 semanas de validação) | Baixa |
| 14 | Atualizar `supabase/config.toml` | Alta |

---

## 13. Benefícios Esperados

| Benefício | Impacto |
|-----------|---------|
| **Redução de custos** | 90%+ menos execuções de funções |
| **Monitoramento completo** | Servidores com métricas detalhadas de bancos de dados |
| **Visualização rica** | Dropdown com informações técnicas sob demanda |
| **Alertas inteligentes** | Mensagens com contexto técnico (ex: "Disco C: 97% usado") |
| **Economia de storage** | Apenas médias, não histórico completo |
| **Manutenção proativa** | Indicador de reboot pendente visível |
