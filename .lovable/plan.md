

## Plano: Sistema de Alertas de Vencimento na Documentação

### 1. Banco de Dados — Migração

```sql
CREATE TABLE public.doc_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  alert_type text NOT NULL, -- 'license' / 'domain' / 'link' / 'software' / 'provider'
  reference_table text NOT NULL,
  reference_id uuid NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  expiry_date date NOT NULL,
  days_remaining int NOT NULL,
  severity text NOT NULL DEFAULT 'info', -- 'critical' / 'warning' / 'info'
  status text NOT NULL DEFAULT 'active', -- 'active' / 'acknowledged' / 'resolved'
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doc_alerts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_doc_alerts_client_status ON public.doc_alerts(client_id, status);
CREATE UNIQUE INDEX idx_doc_alerts_ref ON public.doc_alerts(reference_table, reference_id) WHERE status = 'active';
CREATE POLICY "Staff can manage doc_alerts" ON public.doc_alerts FOR ALL TO authenticated USING (public.is_staff(auth.uid()));
```

### 2. Edge Function: `check-doc-expiries`

Varre 5 tabelas para gerar/atualizar alertas:

| Tabela | Campo data | Campo alerta | Campo nome |
|---|---|---|---|
| `doc_licenses` | `expiry_date` | `alert_days` | `product_name` |
| `doc_domains` | `expiry_date` | `alert_days` | `domain` |
| `doc_internet_links` | `contract_expiry` | `alert_days` (default 30) | `provider` |
| `doc_software_erp` | `support_expiry` | 30 (fixo) | `name` + `vendor` |
| `doc_external_providers` | `contract_expiry` | 30 (fixo) | `company_name` + `service_type` |

Lógica idempotente:
- `days_remaining <= alert_days` → upsert alerta ativo (INSERT ou UPDATE)
- `days_remaining > alert_days` com alerta ativo → marcar `resolved`
- `days_remaining < 0` → severity `critical`, "Vencido há X dias"
- `days_remaining <= 7` → `critical`; `<= 30` → `warning`; resto → `info`

Ao criar novo alerta: insere notificação para técnicos do cliente (tabela `notifications`), com `related_type = 'client'` e `related_id = client_id`.

### 3. Hook: `useDocAlerts.ts`

- Busca alertas ativos por `client_id` via React Query
- Mutation `acknowledge(alertId)` → update status + acknowledged_by/at
- Retorna contadores por seção (mapa `sectionId → count`) e por severidade

### 4. Painel de Alertas (`DocAlertsPanel.tsx`)

Componente acima da `DocSyncStatusBar`:
- Se zero alertas → não renderiza
- Banner colapsável: "X alertas de vencimento" + badge vermelho/amarelo
- Lista expandida com ícone de severidade, título, descrição, data, botão "Reconhecer"
- Ordenação: critical primeiro, depois `days_remaining` ASC

### 5. Badges nas Seções do Acordeão

Atualizar `ClientDocumentation.tsx`:
- Usar `useDocAlerts(clientId)` para obter contadores por seção
- Mapear `alert_type` → seção: license→7, domain→9, link→3, software→8, provider→13
- Renderizar badge numérico vermelho/amarelo no `AccordionTrigger` das seções com alertas

### 6. Indicadores nas Tabelas

As tabelas já usam `daysUntil()` localmente. Manter esse cálculo local (mais simples e responsivo) — os alertas servem para o painel e notificações, não para substituir os badges inline.

### Arquivos

| Arquivo | Ação |
|---|---|
| Migração SQL | Criar `doc_alerts` |
| `supabase/functions/check-doc-expiries/index.ts` | Criar |
| `src/hooks/useDocAlerts.ts` | Criar |
| `src/components/clients/documentation/DocAlertsPanel.tsx` | Criar |
| `src/components/clients/ClientDocumentation.tsx` | Editar — integrar painel + badges |

