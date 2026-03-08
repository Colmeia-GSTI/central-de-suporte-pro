

# Correção: Histórico de Eventos NFS-e Nunca Registra Nada

## Causa Raiz (2 bugs)

### Bug 1 — Frontend: Coluna inexistente na query
`NfseEventLogsDialog.tsx` linha 202 faz:
```
.select("id, event_type, level, message, correlation_id, details, created_at")
```
A coluna real é `event_level`, não `level`. Isso retorna erro 400 em **todas** as consultas — confirmado nos network requests repetidos com `"column nfse_event_logs.level does not exist"`.

### Bug 2 — Backend: `send-nfse-notification` insere com campo errado
As inserções nas linhas 156-160, 168-172, 304-308, 347-351 usam `event_data` (campo que **não existe** na tabela). Campos obrigatórios `event_level` e `message` estão ausentes. O insert falha silenciosamente (sem throw, sem catch visível), então o envio de email/WhatsApp funciona mas **nenhum evento é registrado**.

A Edge Function `asaas-nfse` usa os campos corretos (`event_level`, `message`, `source`) — por isso os eventos de emissão funcionam, mas os de notificação não.

## Correções

### 1. `src/components/billing/nfse/NfseEventLogsDialog.tsx`
- Alterar select de `level` para `event_level`
- Atualizar interface `NfseEventLog` para remover campo `source` (não existe na tabela) e alinhar com schema real

### 2. `supabase/functions/send-nfse-notification/index.ts`
- Corrigir todas as inserções em `nfse_event_logs` para usar os campos corretos:
  - `event_level` (ex: `"info"`, `"warn"`)
  - `message` (texto descritivo)
  - `source: "send-nfse-notification"`
  - `details` em vez de `event_data`

| Arquivo | Mudança |
|---|---|
| `src/components/billing/nfse/NfseEventLogsDialog.tsx` | Fix select query: `level` → `event_level`; alinhar interface |
| `supabase/functions/send-nfse-notification/index.ts` | Fix 4 inserts: usar `event_level`, `message`, `source`, `details` |

