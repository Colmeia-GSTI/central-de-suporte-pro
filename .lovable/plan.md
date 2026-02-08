
# Implementacao: Migracao Storage e Correcao de Retornos Bancarios

## Fase 1: Remover S3 Externo (codigo morto)

### 1.1 Deletar arquivos
- `src/lib/s3-storage.ts` - Classe S3StorageClient inteira (nunca funcionou, usa `process.env`)
- `src/components/settings/S3StorageConfigForm.tsx` - Formulario orfao
- `supabase/functions/test-s3-connection/index.ts` - Edge Function de teste

### 1.2 Atualizar `src/components/settings/IntegrationsTab.tsx`
- Remover import do `S3StorageConfigForm` e icone `HardDrive`
- Reduzir grid de `grid-cols-8` para `grid-cols-7`
- Remover TabsTrigger "Storage" e TabsContent correspondente

---

## Fase 2: Corrigir Retornos Bancarios

### 2.1 `supabase/functions/webhook-banco-inter/index.ts` (linhas 147-150)
Remover URL placeholder invalida:
```
ANTES:
  if (payload.linhaDigitavel) {
    updateData.boleto_url = `https://inter.co/boleto/${payload.codigoBarras}`;
  }

DEPOIS:
  if (payload.urlPdf) {
    updateData.boleto_url = payload.urlPdf;
  }
```

### 2.2 `supabase/functions/banco-inter/index.ts` (linha 571)
Remover fallback invalido:
```
ANTES:
  updateData.boleto_url = details.pdfUrl || `https://inter.co/boleto/${details.codigoBarras}`;

DEPOIS:
  updateData.boleto_url = details.pdfUrl || details.boleto?.urlPdf || details.urlPdf || null;
```

---

## Fase 3: Corrigir Notificacoes

### 3.1 `supabase/functions/resend-payment-notification/index.ts`
Apos envio bem-sucedido de email (linha 245), adicionar update do `email_status`:
```typescript
// Apos results.push({ channel: "email", success: true }):
await supabase.from("invoices").update({
  email_status: "enviado",
  email_sent_at: new Date().toISOString(),
}).eq("id", invoice_id);
```
Apos falha (linha 250):
```typescript
await supabase.from("invoices").update({
  email_status: "erro",
  email_error_msg: errMsg,
}).eq("id", invoice_id);
```

### 3.2 `supabase/functions/notify-due-invoices/index.ts`
Apos envio de email bem-sucedido (linha 216), adicionar:
```typescript
await supabase.from("invoices").update({
  email_status: "enviado",
  email_sent_at: new Date().toISOString(),
}).eq("id", invoice.id);
```

---

## Fase 4: Corrigir Indicador de Email no Frontend

### 4.1 `src/components/billing/BillingInvoicesTab.tsx` (linha 626)
```
ANTES:
  emailStatus={invoice.email_status || "pendente"}

DEPOIS:
  emailStatus={
    invoice.email_status ||
    (invoice.email_sent_at ? "enviado" : invoice.email_error_msg ? "erro" : "pendente")
  }
```

---

## Fase 5: Cleanup

### 5.1 Remover `test-s3-connection` do deploy
- Deletar `supabase/functions/test-s3-connection/index.ts`
- O `supabase/config.toml` nao referencia essa funcao, entao nao precisa alterar

---

## Arquivos Modificados
- **Deletar**: `src/lib/s3-storage.ts`, `src/components/settings/S3StorageConfigForm.tsx`, `supabase/functions/test-s3-connection/index.ts`
- **Editar**: `src/components/settings/IntegrationsTab.tsx`
- **Editar**: `supabase/functions/webhook-banco-inter/index.ts`
- **Editar**: `supabase/functions/banco-inter/index.ts`
- **Editar**: `supabase/functions/resend-payment-notification/index.ts`
- **Editar**: `supabase/functions/notify-due-invoices/index.ts`
- **Editar**: `src/components/billing/BillingInvoicesTab.tsx`

## Riscos
- Tabelas `storage_config` e `invoice_documents` permanecem no banco (nao serao deletadas para seguranca)
- Faturas antigas com URL placeholder (`https://inter.co/boleto/...`) continuarao com link quebrado ate o proximo `poll-boleto-status` atualizar
