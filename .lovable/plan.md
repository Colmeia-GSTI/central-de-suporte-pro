
# Fix: Status de Email e Link da NFS-e no Email de Cobranca

## Problemas Encontrados

### 1. `email_error_msg` nao e limpo apos reenvio bem-sucedido

Na fatura #14 da CVR, o status mostra `email_status: enviado` (correto), mas `email_error_msg` ainda contem `"Bloqueado: boleto_pendente"` do erro anterior. Isso acontece porque o bloco de sucesso (linha 324-327 do `resend-payment-notification`) atualiza `email_status` e `email_sent_at`, mas nao limpa o campo `email_error_msg`.

O mesmo problema existe no `notify-due-invoices` -- precisa ser verificado.

**Correcao:** Adicionar `email_error_msg: null` ao update de sucesso.

### 2. Link da NFS-e nao aparece no email

O codigo gera o `nfsePdfSignedUrl` (linha 230-233) mas nunca o utiliza no corpo do email. O cliente recebe apenas o link do boleto e/ou PIX, sem acesso a nota fiscal.

**Correcao:** 
- Adicionar `nfse_pdf_url` nas variaveis de template (`templateVars`)
- Incluir um bloco de "Nota Fiscal" no template padrao do email, com link para o PDF da NFS-e

---

## Alteracoes

### Arquivo: `supabase/functions/resend-payment-notification/index.ts`

**Fix 1 -- Limpar erro anterior no sucesso (linha 324-327):**

Antes:
```typescript
await supabase.from("invoices").update({
  email_status: "enviado",
  email_sent_at: new Date().toISOString(),
}).eq("id", invoice_id);
```

Depois:
```typescript
await supabase.from("invoices").update({
  email_status: "enviado",
  email_sent_at: new Date().toISOString(),
  email_error_msg: null,
}).eq("id", invoice_id);
```

**Fix 2 -- Adicionar `nfse_pdf_url` ao templateVars (linha 236-244):**

Adicionar: `nfse_pdf_url: nfsePdfSignedUrl`

**Fix 3 -- Incluir bloco NFS-e no template padrao (apos o bloco PIX, ~linha 297):**

```html
${nfsePdfSignedUrl ? `
  <div style="margin: 20px 0;">
    <h3>📄 Nota Fiscal de Servico (NFS-e)</h3>
    <p><a href="${nfsePdfSignedUrl}" style="display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 6px;">📄 Visualizar Nota Fiscal</a></p>
  </div>
` : ""}
```

### Arquivo: `supabase/functions/notify-due-invoices/index.ts`

Verificar se o mesmo padrao de "nao limpar email_error_msg" existe la tambem e corrigir.

---

## Sobre Anexos

Os emails enviam **links** (URLs assinadas com validade de 7 dias) para o boleto e a nota fiscal, e nao anexos binarios. Isso e intencional -- o SMTP customizado via `Deno.connect` nao suporta facilmente attachments MIME, e links assinados sao mais leves e confiaveis. O boleto ja vai como link; a nota fiscal passara a ir tambem.

## Arquivos afetados

1. `supabase/functions/resend-payment-notification/index.ts` -- 3 alteracoes pontuais
2. `supabase/functions/notify-due-invoices/index.ts` -- verificar e alinhar mesmo padrao

## Impacto

- `email_error_msg` sera limpo em reenvios bem-sucedidos, eliminando indicadores de erro fantasma na interface
- Clientes passam a receber o link da NFS-e no email de cobranca
- Zero breaking changes -- emails que ja funcionam continuam identicos
