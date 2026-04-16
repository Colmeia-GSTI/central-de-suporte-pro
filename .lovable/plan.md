

## Plano: Configurar CRON + Dados de Teste + Validar Alertas

### Correção 1 — doc-utils.ts
Já corrigido. O arquivo está limpo, sem duplicatas.

### Correção 2 — CRON para check-doc-expiries
Inserir o agendamento via SQL (insert tool, não migração):

```sql
SELECT cron.schedule(
  'check-doc-expiries-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://silefpsayliwqtoskkdz.supabase.co/functions/v1/check-doc-expiries',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpbGVmcHNheWxpd3F0b3Nra2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDY5OTEsImV4cCI6MjA4NTE4Mjk5MX0.jInzavP_pXbuKvgfb4AVobm9E3yNnwewgR2o1IcK7ic"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

### Correção 3 — Dados de teste
Inserir 2 licenças de teste para o cliente Abido (`51385ab8-82f5-4ba0-9b08-77bf711c522e`):

| Produto | Vencimento | Expectativa |
|---|---|---|
| Bitdefender GravityZone - TESTE | hoje + 5 dias | severity = warning |
| Microsoft 365 Business - TESTE | hoje - 3 dias | severity = critical |

### Correção 4 — Executar e validar
1. Deploy da Edge Function `check-doc-expiries`
2. Invocar via `curl_edge_functions`
3. Verificar doc_alerts populada com 2 registros
4. Confirmar severidades corretas

### Arquivos
| Arquivo | Ação |
|---|---|
| `src/lib/doc-utils.ts` | Nenhuma (já corrigido) |
| CRON (SQL insert) | Agendar job diário |
| doc_licenses (SQL insert) | 2 registros de teste |
| Edge Function | Deploy + invoke manual |

