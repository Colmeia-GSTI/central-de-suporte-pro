

## Plano: Sincronização TRMM e UniFi com Documentação Técnica

### Banco de dados

**Migração 1** — Novas colunas e tabela:

```sql
-- Campo de mapeamento TRMM na tabela clients
ALTER TABLE public.clients ADD COLUMN trmm_client_name text;

-- Tabela de log de sincronização
CREATE TABLE public.doc_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  source text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  devices_synced int NOT NULL DEFAULT 0,
  details jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'success',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doc_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage doc_sync_log" ON public.doc_sync_log
  FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
```

### Edge Function: `sync-doc-devices`

Nova Edge Function dedicada à sincronização com doc_devices (separada das funções existentes que sincronizam com `monitored_devices`).

**Ações suportadas:**

- `sync_trmm` — Recebe `client_id`, busca `trmm_client_name` do cliente, chama a API do TRMM (`GET /agents/`), filtra por `client_name`, faz upsert em `doc_devices` usando `trmm_agent_id` como chave. Campos protegidos (ram, primary_user, physical_location, notes) nunca sobrescritos se já preenchidos. Detecta conflitos de hostname. Registra em `doc_sync_log`.

- `sync_unifi` — Recebe `client_id`, busca controllers do cliente em `unifi_controllers`, para cada controller ativo:
  1. Autentica (direct login ou cloud API key)
  2. Busca dispositivos → upsert em `doc_devices` (switches, APs, gateways)
  3. Busca SSIDs → atualiza campo `ssids` nos APs
  4. Busca VLANs → upsert em `doc_vlans`
  5. Busca firewall rules → upsert em `doc_firewall_rules`
  6. Busca port forwards → upsert em `doc_firewall_rules`
  7. Busca VPNs → upsert em `doc_vpn`
  8. Atualiza `doc_infrastructure` (gateway_model, gateway_ip_wan, etc.)
  9. Registra em `doc_sync_log`

- `sync_all` — Executa ambos para o `client_id`.

**Regra de proteção de dados manuais:** Ao fazer upsert, se o registro existente tem `data_source` contendo `+manual`, nunca sobrescrever os campos protegidos. Se o técnico edita um campo de um registro integrado, o frontend muda `data_source` para `trmm+manual` ou `unifi+manual`.

**Detecção de conflitos TRMM:** Se um agente TRMM tem hostname igual a um `doc_devices` existente sem `trmm_agent_id`, não faz merge automático. Retorna lista de conflitos no response.

### Frontend — Componentes modificados

**1. `DocSectionClientInfo.tsx`** — Adicionar campo "Nome do cliente no TRMM" (`trmm_client_name`) no formulário e modo leitura.

**2. `DocTableWorkstations.tsx`** — Adicionar:
- Coluna "Origem" com badges (TRMM=azul, Manual=cinza, TRMM+Manual=verde)
- Botão "Sincronizar TRMM" no topo (chama Edge Function, mostra loading, toast resultado)
- Banner de conflitos quando existirem dispositivos com hostname duplicado

**3. `DocTableNetworkDevices.tsx`** — Adicionar:
- Coluna "Origem" com badges (UniFi=azul, Manual=cinza, UniFi+Manual=verde)
- Botão "Sincronizar UniFi" no topo

**4. `DocSectionSecurity.tsx`** — Adicionar botão "Sincronizar UniFi" no topo (sincroniza VLANs, firewall, VPN)

**5. `ClientDocumentation.tsx`** — Adicionar barra de status de integração no topo:
- Status TRMM: última sync, dispositivos sincronizados, ou "Não configurado"
- Status UniFi: última sync, contadores, ou "Não configurado"
- Botão "Sincronizar tudo"

**6. Hook `useDocSync.ts`** — Novo hook para:
- Buscar último log de sync (`doc_sync_log`) por source e client_id
- Executar sync (invoke Edge Function)
- Verificar se TRMM/UniFi estão configurados para o cliente

### Lógica de `data_source` na edição

Nos componentes `DocTableWorkstations` e `DocTableNetworkDevices`, ao salvar edição de um item com `data_source = 'trmm'`, automaticamente mudar para `'trmm+manual'`. Idem para `'unifi'` → `'unifi+manual'`.

### Arquivos

| Arquivo | Ação |
|---|---|
| Migração SQL | `trmm_client_name` + `doc_sync_log` |
| `supabase/functions/sync-doc-devices/index.ts` | Criar — Edge Function de sync |
| `src/hooks/useDocSync.ts` | Criar — hook de status e execução de sync |
| `src/components/clients/documentation/DocSyncStatusBar.tsx` | Criar — barra de status no topo |
| `src/components/clients/documentation/DocSectionClientInfo.tsx` | Editar — campo `trmm_client_name` |
| `src/components/clients/documentation/DocTableWorkstations.tsx` | Editar — coluna Origem, botão sync, conflitos |
| `src/components/clients/documentation/DocTableNetworkDevices.tsx` | Editar — coluna Origem, botão sync |
| `src/components/clients/documentation/DocSectionSecurity.tsx` | Editar — botão sync UniFi |
| `src/components/clients/ClientDocumentation.tsx` | Editar — integrar barra de status |

