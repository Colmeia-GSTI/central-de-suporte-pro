
# Correcao: Status de Processamento Nao Atualizado Apos Geracao de Fatura

## Problema Diagnosticado

A fatura #2 da Quaza foi criada com sucesso em 06/02/2026 (comprovado pelo `invoice_generation_log` com status "success" e `auto_payment_generated: true`). Porem os 3 campos de rastreamento permaneceram em "pendente":

| Campo | Valor Atual | Esperado |
|---|---|---|
| boleto_status | pendente | gerado ou enviado |
| nfse_status | pendente | gerada ou processando |
| email_status | pendente | enviado |

**Causa raiz:** A Edge Function `generate-monthly-invoices` invoca as sub-funcoes (`banco-inter`, `asaas-nfse`, `send-email-smtp`) mas **nunca atualiza os campos de status na tabela `invoices`** apos cada etapa. Os blocos `try/catch` engolem erros silenciosamente e o `auto_payment_generated = true` e setado antes de confirmar o resultado real.

Alem disso, a tabela `webhook_events` (necessaria para idempotencia de webhooks do Banco Inter) **nao existe** no banco de dados, impedindo que webhooks de confirmacao de pagamento sejam processados.

## Plano de Correcao

### Fase 1: Criar tabela `webhook_events`

Criar via migracao SQL a tabela de idempotencia referenciada pelas Edge Functions `webhook-banco-inter` e `webhook-asaas-nfse`:

```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_source text NOT NULL,
  event_id text NOT NULL,
  event_type text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_webhook_events_source_event 
  ON webhook_events (webhook_source, event_id);
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
-- Politicas: service insere, staff consulta
```

### Fase 2: Atualizar `generate-monthly-invoices` para registrar status

**Arquivo:** `supabase/functions/generate-monthly-invoices/index.ts`

Tres blocos serao corrigidos:

**Bloco 1 - Apos gerar pagamento (linhas 421-456):**
- Sucesso: `UPDATE invoices SET boleto_status = 'gerado' WHERE id = ...`
- Erro: `UPDATE invoices SET boleto_status = 'erro', boleto_error_msg = '...' WHERE id = ...`
- Mover o `auto_payment_generated = true` para dentro do bloco de sucesso

**Bloco 2 - Apos emitir NFS-e (linhas 459-484):**
- Sucesso: `UPDATE invoices SET nfse_status = 'processando' WHERE id = ...` (o Asaas processa de forma assincrona, entao o status inicial e "processando", nao "gerada")
- Erro: `UPDATE invoices SET nfse_status = 'erro', nfse_error_msg = '...' WHERE id = ...`

**Bloco 3 - Apos enviar email (linhas 488-549):**
- Sucesso: `UPDATE invoices SET email_status = 'enviado', email_sent_at = now() WHERE id = ...`
- Erro: `UPDATE invoices SET email_status = 'erro', email_error_msg = '...' WHERE id = ...`

### Fase 3: Corrigir fatura Quaza manualmente

Atualizar via SQL os dados da fatura #2 existente para refletir o estado correto (status "overdue" permanece ate confirmacao de pagamento via webhook ou pagamento manual).

## Detalhes Tecnicos

### generate-monthly-invoices - Bloco de pagamento corrigido
```text
if (providerActive && contract.payment_preference) {
  try {
    // ... invoke banco-inter ou asaas-nfse ...

    // Atualizar status COM o resultado real
    await supabase.from("invoices").update({
      auto_payment_generated: true,
      boleto_status: "gerado",
    }).eq("id", newInvoice.id);

  } catch (paymentError) {
    console.error(...);
    // Registrar ERRO no status
    await supabase.from("invoices").update({
      boleto_status: "erro",
      boleto_error_msg: paymentError.message || "Erro ao gerar pagamento",
    }).eq("id", newInvoice.id);
  }
}
```

### generate-monthly-invoices - Bloco de NFS-e corrigido
```text
if (contract.nfse_enabled) {
  try {
    const { data: nfseResult, error: nfseError } = await supabase.functions.invoke("asaas-nfse", ...);
    
    if (nfseError) {
      await supabase.from("invoices").update({
        nfse_status: "erro",
        nfse_error_msg: nfseError.message || "Erro ao emitir NFS-e",
      }).eq("id", newInvoice.id);
    } else {
      await supabase.from("invoices").update({
        nfse_status: nfseResult?.success ? "processando" : "erro",
        nfse_error_msg: nfseResult?.success ? null : (nfseResult?.error || null),
        auto_nfse_emitted: nfseResult?.success || false,
      }).eq("id", newInvoice.id);
    }
  } catch (nfseErr) {
    await supabase.from("invoices").update({
      nfse_status: "erro",
      nfse_error_msg: nfseErr.message || "Excecao ao emitir NFS-e",
    }).eq("id", newInvoice.id);
  }
}
```

### generate-monthly-invoices - Bloco de email corrigido
```text
if (smtpSettings?.is_active) {
  try {
    await supabase.functions.invoke("send-email-smtp", ...);
    
    await supabase.from("invoices").update({
      email_status: "enviado",
      email_sent_at: new Date().toISOString(),
    }).eq("id", newInvoice.id);
  } catch (emailError) {
    // ... (ja existe o catch)
  }
}
// Adicionar catch para atualizar email_status = 'erro' em caso de falha
```

## Arquivos a Modificar
- **Nova migracao SQL** - Criar tabela `webhook_events`
- `supabase/functions/generate-monthly-invoices/index.ts` - Atualizar status apos cada etapa

## Impacto
- Todas as faturas futuras (de qualquer cliente) terao os indicadores visuais atualizados em tempo real
- Erros serao visiveis na interface em vez de ficarem ocultos nos logs
- Webhooks do Banco Inter poderao funcionar corretamente (tabela de idempotencia criada)
