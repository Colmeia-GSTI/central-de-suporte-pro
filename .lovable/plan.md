
# Plano: Sistema Integrado de Logging e Tratamento de Erros para Operações Financeiras

## Análise do Problema Atual

**Contexto da Falha:**
O usuário teve um erro ao clicar em "Gerar Faturas Mensais" em `/billing`. O sistema atual:
- ✅ Tem um logger (`logger.ts`) mas é pouco utilizado
- ✅ Tem sanitização de erros (`api-error-handler.ts`) mas não está integrada no billing
- ❌ Não registra logs estruturados de operações financeiras
- ❌ Sem retry logic para falhas transitórias
- ❌ Sem painel de visualização de logs (admin/diagnostics)
- ❌ Edge function `generate-monthly-invoices` não retorna erros estruturados de forma consistente

## Solução Proposta em 4 Fases

### Fase 1: Extensão do Logger (Frontend)

**Arquivo:** `src/lib/logger.ts`

Adicionar métodos específicos para Billing:
```
- billingInfo(message, context, data)
- billingError(message, context, error)
- billingGenerateMonthly(status, data) - inicio/sucesso/erro com detalhes
- billingPayment(invoiceId, action, provider, status, error)
```

E um método genérico para salvar logs também no banco:
```
- persistLogToDatabase(entry) - via edge function ou diretamente
```

### Fase 2: Integração em BillingInvoicesTab (Frontend)

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx`

Na função `handleGenerateMonthlyInvoices`:
1. Registrar início da operação com logger.billingGenerateMonthly("starting", {...})
2. Implement retry logic com exponential backoff (3 tentativas, 1s → 2s → 4s)
3. Registrar sucesso/erro com todos os detalhes (contracts processados, faturas geradas, etc)
4. Melhorar feedback ao usuário (progress toast com: "Processando 3 contratos...")

### Fase 3: Edge Function Melhorada (Backend)

**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`

Implementar estrutura de retorno padronizada:
```json
{
  "success": boolean,
  "message": string,
  "timestamp": ISO8601,
  "execution_id": uuid,
  "stats": {
    "total_contracts": number,
    "generated": number,
    "skipped": number,
    "failed": number
  },
  "results": [
    {
      "contract_id": uuid,
      "contract_name": string,
      "status": "created" | "skipped" | "error",
      "invoice_id": uuid | null,
      "error": string | null,
      "duration_ms": number
    }
  ],
  "errors": [
    {
      "contract_name": string,
      "code": string,
      "message": string,
      "timestamp": ISO8601
    }
  ]
}
```

### Fase 4: Painel de Logs (Admin UI)

**Arquivo:** Criar `src/components/settings/LogsViewerTab.tsx`

Local: Settings → Integrações → Logs (nova aba)
Requisitos:
- Visualizar últimos 100 logs
- Filtrar por tipo (billing, payment, nfse, auth, etc)
- Filtrar por nível (error, warning, info, debug)
- Filtrar por data/hora
- Copiar stack trace para debug
- Apenas acessível para admin/financial
- Botão "Baixar Logs" em formato JSON/CSV

### Database Schema para Logs

**Tabela a Criar:** `application_logs`

```sql
CREATE TABLE application_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  level text NOT NULL, -- error, warn, info, debug
  module text NOT NULL, -- billing, auth, payment, nfse, etc
  action text, -- generate-invoices, emit-nfse, etc
  message text NOT NULL,
  context jsonb, -- contract_id, invoice_id, etc
  error_details jsonb, -- stack trace, error message
  execution_id uuid, -- para rastrear operação fim-a-fim
  duration_ms integer,
  created_at timestamptz DEFAULT now(),
  
  -- Índices para performance
  CONSTRAINT app_logs_level_check CHECK (level IN ('error', 'warn', 'info', 'debug'))
);

CREATE INDEX idx_app_logs_created_at ON application_logs(created_at DESC);
CREATE INDEX idx_app_logs_user_id ON application_logs(user_id);
CREATE INDEX idx_app_logs_module_level ON application_logs(module, level);
```

## Fluxo de Operação Completo

```
Usuario clica "Gerar Faturas Mensais"
         ↓
[Frontend] logger.billingGenerateMonthly("starting", {contract_count: 5})
         ↓
[Frontend] Tenta invocar edge function (retry: max 3 vezes)
         ↓
[Backend] Edge function processa com tracking de execution_id
         ↓
[Backend] Para cada contrato:
  - Registra tentativa com logger
  - Em sucesso: retorna invoice_id
  - Em erro: retorna error code + message
         ↓
[Backend] Persiste logs estruturados em application_logs table
         ↓
[Frontend] Recebe resposta com execution_id
         ↓
[Frontend] Registra resultado final com execution_id
         ↓
[Frontend] Mostra toast com status detalhado
         ↓
[Admin] Pode ver logs completos em Settings → Logs
```

## Implementação Técnica - Detalhes

### 1. Extensão do Logger (logger.ts)

Adicionar novo método:
```typescript
billingOperation(action: string, status: "start" | "success" | "error", data: {
  execution_id: string;
  contract_count?: number;
  generated?: number;
  failed?: number;
  error?: string;
  duration_ms?: number;
}) {
  this.info(
    `Billing: ${action} - ${status}`,
    "Billing",
    { ...data, action, status }
  );
}
```

### 2. Edge Function: Retorno Padronizado

Retornar objeto estruturado com `execution_id` único para rastreamento fim-a-fim.

### 3. Retry Logic no Frontend

```typescript
const retryWithBackoff = async (fn, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delayMs = Math.pow(2, attempt) * 1000;
      logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} em ${delayMs}ms`, "Billing");
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};
```

### 4. UI Progress Feedback

Em vez de simples toast:
```
[Loading] Processando 5 contratos...
[Progress] ✓ QUAZA - Fatura #123 criada
[Progress] ✓ ABC Corp - Fatura #124 criada
[Progress] ✗ XYZ Ltda - Erro: Dados faltando
[Success] 2 de 3 faturas geradas com sucesso
[Info] Ver detalhes em Configurações → Logs (ID: abc-123-def-456)
```

## Arquivos a Modificar/Criar

| Arquivo | Tipo | Conteúdo |
|---------|------|----------|
| `src/lib/logger.ts` | Edit | Adicionar métodos billing-específicos + persistToDatabase |
| `src/components/billing/BillingInvoicesTab.tsx` | Edit | Integrar logging + retry logic + melhor UX |
| `src/components/settings/LogsViewerTab.tsx` | Create | Painel de visualização de logs (admin only) |
| `src/components/settings/IntegrationsTab.tsx` | Edit | Adicionar aba "Logs" |
| `supabase/functions/generate-monthly-invoices/index.ts` | Edit | Estruturar retorno + persistent logs |
| `supabase/functions/save-application-log/index.ts` | Create | Edge function para salvar logs no DB |
| Migração SQL | Create | Criar tabela application_logs |

## Timeline & Prioridade

1. **Alta (Imediato):** 
   - Extensão do logger com métodos billing
   - Retry logic em BillingInvoicesTab
   - Edge function com retorno estruturado

2. **Média (Semana 1):**
   - Painel LogsViewerTab
   - Integração com application_logs table
   - Melhor feedback ao usuário (toast com detalhes)

3. **Baixa (Futura):**
   - Alertas automáticos (Slack/Email) para erros críticos
   - Análise de padrões de erro
   - Auto-retry em background jobs

## Benefícios

✅ **Para Suporte:** Pode diagnosticar problemas rapidamente via Logs panel
✅ **Para Dev:** Retry automático resolve falhas transitórias (network, timeout)
✅ **Para Usuário:** Feedback claro do que aconteceu + ID para rastreamento
✅ **Para Auditoria:** Histórico completo de todas operações financeiras
✅ **Para Monitoramento:** Base para alertas futuros e análise de erros

