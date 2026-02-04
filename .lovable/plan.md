
# Correção: Parâmetros Incorretos nas Chamadas às Edge Functions

## Problema Identificado

O formulário de contrato está chamando as Edge Functions com parâmetros incompletos ou incorretos:

### Erro 1: banco-inter
- **Enviado**: `{ action: "create_boleto", invoice_id: "..." }`
- **Esperado**: `{ invoice_id: "...", payment_type: "boleto" }` (sem action, pois action é usado apenas para "test" e "cancel")

### Erro 2: resend-payment-notification
- **Enviado**: `{ invoice_id: "..." }`
- **Esperado**: `{ invoice_id: "...", channels: ["email", "whatsapp"] }`

---

## Análise do Código Atual

No arquivo `ContractForm.tsx` (linhas 336-358):

```typescript
// ERRADO - banco-inter
await supabase.functions.invoke("banco-inter", {
  body: {
    action: "create_boleto",  // action só é usado para "test" ou "cancel"
    invoice_id: invoice.id,
    // FALTANDO: payment_type!
  },
});

// ERRADO - resend-payment-notification
await supabase.functions.invoke("resend-payment-notification", {
  body: { invoice_id: invoice.id },
  // FALTANDO: channels!
});
```

---

## Correção Proposta

### Para banco-inter:
```typescript
await supabase.functions.invoke("banco-inter", {
  body: {
    invoice_id: invoice.id,
    payment_type: data.payment_preference === "pix" ? "pix" : "boleto",
    // Remover "action: create_boleto" - não é necessário para criar cobrança
  },
});
```

### Para resend-payment-notification:
```typescript
await supabase.functions.invoke("resend-payment-notification", {
  body: { 
    invoice_id: invoice.id,
    channels: ["email"], // Enviar apenas por email inicialmente
  },
});
```

---

## Arquivo a Modificar

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `src/components/contracts/ContractForm.tsx` | 336-341 | Corrigir chamada banco-inter |
| `src/components/contracts/ContractForm.tsx` | 352-354 | Adicionar channels na notificação |

---

## Código Corrigido Completo

```typescript
// Generate payment via provider if requested
if (data.generate_payment) {
  try {
    if (data.billing_provider === "asaas") {
      await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "create_payment",
          invoice_id: invoice.id,
          billing_type: data.payment_preference === "pix" ? "PIX" : "BOLETO",
        },
      });
    } else {
      // Banco Inter - payment_type é obrigatório, action não é usado
      await supabase.functions.invoke("banco-inter", {
        body: {
          invoice_id: invoice.id,
          payment_type: data.payment_preference === "pix" ? "pix" : "boleto",
        },
      });
    }
  } catch (paymentError) {
    console.error("Error generating payment:", paymentError);
  }
}

// Send notification if requested
if (data.send_notification) {
  try {
    await supabase.functions.invoke("resend-payment-notification", {
      body: { 
        invoice_id: invoice.id,
        channels: ["email"], // channels é obrigatório
      },
    });
  } catch (notifError) {
    console.error("Error sending notification:", notifError);
  }
}
```

---

## Resumo das Alterações

| Edge Function | Antes | Depois |
|---------------|-------|--------|
| banco-inter | `action + invoice_id` | `invoice_id + payment_type` |
| resend-payment-notification | `invoice_id` | `invoice_id + channels` |

### Impacto
- **1 arquivo modificado**: `src/components/contracts/ContractForm.tsx`
- **Nenhuma alteração em banco de dados ou Edge Functions**
- Correção rápida de ~10 linhas
