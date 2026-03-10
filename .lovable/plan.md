

# Correção: E0014 falso positivo — permitir cancelar e reemitir NFS-e com erro

## Problema

Quando uma NFS-e falha no Asaas com erro E0014 ("DPS duplicada"), o sistema bloqueia completamente a reemissão. Porém, o E0014 pode ser um falso positivo — a nota não existe de fato no Portal Nacional, é apenas um erro interno do Asaas. O usuário fica preso sem opção de corrigir.

O fluxo atual (linhas 554-654 do `asaas-nfse/index.ts`):
1. Detecta `asaas_invoice_id` existente → consulta status no Asaas
2. Se status = ERROR e código = E0014 → lança erro 409 e bloqueia
3. Frontend exibe toast "use Vincular Nota Existente" — mas não há nota para vincular

## Solução

### 1. Edge function: adicionar ação `retry_failed` ao `asaas-nfse`
Nova ação que:
- Cancela/deleta a invoice com erro no Asaas (DELETE `/invoices/{id}`)
- Limpa o `asaas_invoice_id` do registro `nfse_history`
- Redefine status para "pendente"
- Registra evento no `nfse_event_logs`
- Retorna sucesso para que o frontend possa reemitir em seguida

### 2. Edge function: relaxar bloqueio E0014 no `emit`
Adicionar parâmetro `force_new_emission: true` que, quando presente:
- Ignora a verificação de `asaas_invoice_id` existente
- Permite criar nova invoice no Asaas do zero
- Usado internamente após o `retry_failed` limpar o registro

### 3. Frontend: `BillingErrorsPanel` — botão "Cancelar e Reemitir"
No `handleReprocessNfse`, quando o erro retornado contém "E0014" ou "DPS_DUPLICADA":
- Em vez de exibir toast genérico, oferecer ação "Cancelar nota com erro e reemitir"
- Fluxo: chama `retry_failed` → depois chama `emit` normalmente
- Toast de sucesso: "Nota anterior cancelada. Reemissão em andamento."

### 4. Frontend: `NfseDetailsSheet` — mesma lógica para reenvio individual
Atualizar o handler de reenvio para detectar E0014 e oferecer a mesma opção.

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| `supabase/functions/asaas-nfse/index.ts` | Adicionar ação `retry_failed`; adicionar param `force_new_emission` no `emit` |
| `src/components/billing/BillingErrorsPanel.tsx` | Detectar E0014 no reprocessamento e oferecer "cancelar e reemitir" |
| `src/components/nfse/NfseActionsMenu.tsx` | Mesma lógica de retry para E0014 no reenvio |

