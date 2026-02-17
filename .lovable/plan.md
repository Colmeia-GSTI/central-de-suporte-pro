
# Correcoes Definitivas Validadas por Testes

## Resultados dos Testes

Os testes revelaram que o plano anterior **NAO resolveria o problema de NFS-e** porque continha um bug critico nao detectado antes. Alem disso, confirmaram problemas no Banco Inter.

### BUG CRITICO DESCOBERTO: Campo `code` nao existe na API Asaas

A chamada real `POST /asaas-nfse { action: "list_services", city: "PASSO FUNDO" }` retornou:

```text
{ "description": "01.07.01 - Suporte tecnico...", "id": "527787", "issTax": 0 }
```

A API Asaas **NAO retorna campo `code`**. Retorna apenas `description`, `id` e `issTax`. O codigo do servico esta embutido no inicio do campo `description` (ex: `"01.07.01"`).

O codigo atual faz `s.code` que e `undefined`, portanto o match **NUNCA funciona** -- esta e a causa raiz real de TODAS as falhas de NFS-e.

### Estado Atual das Faturas #14 e #15

| Campo | Valor | Status |
|-------|-------|--------|
| boleto_status | pendente | OK |
| boleto_error_msg | null | OK (limpo) |
| payment_method | null | FALTA |
| billing_provider | banco_inter | OK |
| boleto_sent_at | null | FALTA |
| boleto_barcode | null | FALTA |
| boleto_url | null | FALTA |
| nfse municipal_service_id | null | FALHOU |

### Confirmacao: MunicipalServiceId correto

Para o codigo `010701` (normalizado: `010701`) em Passo Fundo, o `municipalServiceId` correto e `527787`.

---

## Correcoes Necessarias

### Fase 1: Fix critico na resolucao de municipalServiceId (Asaas NFS-e)

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

O match precisa extrair o codigo do campo `description` em vez de ler o campo `code` (que nao existe).

Alterar a funcao `tryResolve` (2 locais: `emit` e `emit_standalone`) para:
- Extrair o codigo do inicio de `s.description` usando regex: `/^(\d{2}\.\d{2}\.\d{2})/`
- Normalizar o codigo extraido (remover pontos) e comparar com o target
- Exemplo: `"01.07.01 - Suporte tecnico..."` -> extrai `"01.07.01"` -> normaliza para `"010701"` -> match com `"010701"`

Tambem corrigir o log `codigos_disponiveis` que faz `s.code` (undefined) -> usar `s.description.match(...)` 

### Fase 2: Asaas `create_payment` - campos faltantes

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

No update da fatura apos criar cobranca (linhas ~1833-1890):
- Para BOLETO: adicionar `payment_method: "boleto"`, `boleto_status: "enviado"`, `boleto_sent_at: new Date().toISOString()`
- Para PIX: adicionar `payment_method: "pix"`
- Buscar `identificationField` via `GET /payments/{id}/identificationField` (endpoint separado conforme documentacao Asaas)

### Fase 3: Banco Inter - campos faltantes e acesso correto

**Arquivo:** `supabase/functions/banco-inter/index.ts`

1. Adicionar `billing_provider: "banco_inter"` no updateData (linha ~681)
2. Adicionar `boleto_sent_at: new Date().toISOString()` quando boleto completo
3. Corrigir acesso no polling: `details.boleto.codigoBarras` e `details.boleto.linhaDigitavel` em vez de `details.codigoBarras`
4. Obter PDF via endpoint dedicado `GET /cobranca/v3/cobrancas/{id}/pdf` (retorna base64) e salvar no bucket `invoice-documents`

### Fase 4: Banco Inter polling fallback

**Arquivo:** `supabase/functions/poll-boleto-status/index.ts`

1. Corrigir acesso aos dados: usar `boletoData.boleto.codigoBarras` / `boletoData.boleto.linhaDigitavel` como fonte primaria
2. Obter PDF via endpoint `/pdf` (base64) em vez de URL
3. Salvar PDF no Storage

### Fase 5: Webhook Banco Inter

**Arquivo:** `supabase/functions/webhook-banco-inter/index.ts`

O webhook recebe payload direto do Banco Inter com estrutura diferente. Verificar e alinhar acesso aos campos de boleto.

### Fase 6: Batch processing - remover sobrescrita

**Arquivo:** `supabase/functions/batch-process-invoices/index.ts`

Remover linhas 96-104 que sobrescrevem `boleto_status: "enviado"` apos chamar a edge function. A edge function ja cuida do status internamente.

---

## Resumo de Arquivos

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/asaas-nfse/index.ts` | Fix match via `description` (nao `code`), campos no `create_payment` |
| `supabase/functions/banco-inter/index.ts` | `billing_provider`, acesso correto boleto, PDF via `/pdf` (base64) |
| `supabase/functions/poll-boleto-status/index.ts` | Acesso correto boleto, PDF base64 |
| `supabase/functions/webhook-banco-inter/index.ts` | Alinhar campos |
| `supabase/functions/batch-process-invoices/index.ts` | Remover update redundante |

## Resultado Esperado

1. NFS-e para CVR e RUARO emitidas com `municipalServiceId: 527787` (Passo Fundo, 01.07.01)
2. Boletos com todos os campos preenchidos (`payment_method`, `boleto_status`, `boleto_sent_at`)
3. PDFs de boleto salvos no Storage S3 interno
4. Polling e webhook do Banco Inter acessando campos na estrutura correta da API v3
