
# Plano: Escolha de Provedor de Pagamento (Banco Inter vs Asaas)

## Resumo

Implementar a capacidade de escolher entre **Banco Inter** e **Asaas** como provedor de cobrança (Boleto/PIX) em:
- Contratos (configuração padrão)
- Faturas (configuração individual)
- Geração automática de pagamentos

---

## Análise do Estado Atual

### O que já existe:

| Recurso | Status |
|---------|--------|
| **Banco Inter** | Totalmente funcional para Boleto/PIX |
| **Asaas - NFS-e** | Totalmente funcional |
| **Asaas - Cobranças** | Infraestrutura existente (só usada para testes) |
| **Campo `payment_preference`** | Existe em `contracts` (boleto/pix/both) |
| **Campo `payment_method`** | Existe em `invoices` (armazena método usado) |

### O que está faltando:

- Campo `billing_provider` para indicar **qual provedor** usar
- Ação no Asaas para criar cobranças reais (não apenas testes)
- Lógica de roteamento nas edge functions
- UI para seleção do provedor nos formulários

---

## Etapas de Implementação

### Etapa 1: Migração do Banco de Dados

Adicionar campo `billing_provider` nas tabelas `contracts` e `invoices`:

```sql
-- Adicionar campo billing_provider em contracts
ALTER TABLE public.contracts 
ADD COLUMN IF NOT EXISTS billing_provider TEXT DEFAULT 'banco_inter'
CHECK (billing_provider IN ('banco_inter', 'asaas'));

COMMENT ON COLUMN public.contracts.billing_provider IS 
  'Provedor de cobrança: banco_inter ou asaas';

-- Adicionar campo billing_provider em invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS billing_provider TEXT
CHECK (billing_provider IN ('banco_inter', 'asaas'));

COMMENT ON COLUMN public.invoices.billing_provider IS 
  'Provedor de cobrança usado para esta fatura (herda do contrato se nulo)';

-- Adicionar campos para dados do Asaas na fatura
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT,
ADD COLUMN IF NOT EXISTS asaas_invoice_url TEXT;
```

### Etapa 2: Atualizar Edge Function `asaas-nfse`

Adicionar nova ação `create_payment` para criar cobranças reais:

```typescript
case "create_payment": {
  const { invoice_id, billing_type } = params;
  
  // 1. Buscar dados da fatura
  // 2. Garantir cliente existe no Asaas (asaas_customer_id)
  // 3. Criar cobrança POST /payments
  // 4. Atualizar invoices com asaas_payment_id, boleto_url, pix_code
  // 5. Retornar dados do pagamento
}
```

### Etapa 3: Modificar Fluxo de Geração de Pagamentos

Atualizar `generate-invoice-payments` e `generate-monthly-invoices`:

```typescript
// Determinar provedor a usar
const provider = invoice.billing_provider || 
                 invoice.contracts?.billing_provider || 
                 "banco_inter";

// Rotear para o provedor correto
if (provider === "asaas") {
  await supabase.functions.invoke("asaas-nfse", {
    body: { 
      action: "create_payment",
      invoice_id: invoice.id,
      billing_type: paymentType === "pix" ? "PIX" : "BOLETO"
    }
  });
} else {
  await supabase.functions.invoke("banco-inter", {
    body: { invoice_id: invoice.id, payment_type: paymentType }
  });
}
```

### Etapa 4: Atualizar ContractForm

Adicionar campo de seleção do provedor na seção de Faturamento:

```text
+--------------------------------------------------+
|  💳 Faturamento                                   |
+--------------------------------------------------+
|                                                  |
|  [Dia Vencimento] [Dias Antecedência]            |
|                                                  |
|  Provedor de Cobrança *                          |
|  +--------------------------------------------+  |
|  | ○ Banco Inter    ○ Asaas                  |  |
|  +--------------------------------------------+  |
|                                                  |
|  Preferência de Pagamento                        |
|  +--------------------------------------------+  |
|  | Boleto  |  PIX  |  Boleto + PIX           |  |
|  +--------------------------------------------+  |
|                                                  |
+--------------------------------------------------+
```

### Etapa 5: Atualizar InvoiceForm

Adicionar opção de provedor ao criar fatura avulsa:

```text
+--------------------------------------------------+
|  Nova Fatura                                     |
+--------------------------------------------------+
|  Cliente *          [Selecionar...]              |
|  Contrato (opcional) [Vincular...]               |
|  Valor (R$) *       [0,00]                       |
|  Vencimento *       [Data]                       |
|                                                  |
|  Provedor de Cobrança (opcional)                 |
|  +--------------------------------------------+  |
|  | Padrão do contrato | Banco Inter | Asaas  |  |
|  +--------------------------------------------+  |
|  (Se não selecionado, usa o padrão do contrato   |
|   ou Banco Inter se for fatura avulsa)           |
|                                                  |
|  Observações        [                         ]  |
+--------------------------------------------------+
```

### Etapa 6: Atualizar BillingInvoicesTab

Modificar `handleGeneratePayment` para usar o provedor correto:

```typescript
const handleGeneratePayment = async (
  invoiceId: string, 
  paymentType: "boleto" | "pix",
  provider: "banco_inter" | "asaas"
) => {
  if (provider === "asaas") {
    const { data, error } = await supabase.functions.invoke("asaas-nfse", {
      body: { 
        action: "create_payment",
        invoice_id: invoiceId,
        billing_type: paymentType === "pix" ? "PIX" : "BOLETO"
      }
    });
    // ... tratamento
  } else {
    const { data, error } = await supabase.functions.invoke("banco-inter", {
      body: { invoice_id: invoiceId, payment_type: paymentType }
    });
    // ... tratamento existente
  }
};
```

Atualizar menu de ações da fatura:

```text
+------------------+
| 💳 Gerar Boleto  |
|   ├ Banco Inter  |
|   └ Asaas        |
| 📱 Gerar PIX     |
|   ├ Banco Inter  |
|   └ Asaas        |
| ⚡ Emitir Tudo   |
+------------------+
```

### Etapa 7: Atualizar Emissão Completa

Modificar `handleEmitComplete` para respeitar o provedor:

```typescript
const provider = invoice.billing_provider || 
                 selectedContract?.billing_provider || 
                 "banco_inter";

// Gerar boleto
if (!invoice.boleto_url) {
  if (provider === "asaas") {
    await supabase.functions.invoke("asaas-nfse", {
      body: { action: "create_payment", invoice_id: invoice.id, billing_type: "BOLETO" }
    });
  } else {
    await supabase.functions.invoke("banco-inter", {
      body: { invoice_id: invoice.id, payment_type: "boleto" }
    });
  }
}
// Repetir para PIX...
```

---

## Arquivos a Serem Modificados/Criados

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/migrations/xxx_add_billing_provider.sql` | CRIAR | Adicionar campos |
| `supabase/functions/asaas-nfse/index.ts` | MODIFICAR | Nova ação `create_payment` |
| `supabase/functions/generate-invoice-payments/index.ts` | MODIFICAR | Roteamento por provedor |
| `supabase/functions/generate-monthly-invoices/index.ts` | MODIFICAR | Roteamento por provedor |
| `src/components/contracts/ContractForm.tsx` | MODIFICAR | Campo billing_provider |
| `src/components/financial/InvoiceForm.tsx` | MODIFICAR | Campo billing_provider |
| `src/components/billing/BillingInvoicesTab.tsx` | MODIFICAR | Seleção de provedor |
| `supabase/functions/webhook-asaas-nfse/index.ts` | MODIFICAR | Processar pagamentos |

---

## Seção Técnica

### Schema Atualizado

```sql
-- contracts
billing_provider TEXT DEFAULT 'banco_inter' CHECK (billing_provider IN ('banco_inter', 'asaas'))

-- invoices
billing_provider TEXT CHECK (billing_provider IN ('banco_inter', 'asaas'))
asaas_payment_id TEXT     -- ID do pagamento no Asaas
asaas_invoice_url TEXT    -- URL da fatura no Asaas
```

### Nova Ação no `asaas-nfse`

```typescript
case "create_payment": {
  const { invoice_id, billing_type } = params;
  
  // Buscar fatura
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, client_id, amount, due_date, invoice_number, clients(name, document, asaas_customer_id)")
    .eq("id", invoice_id)
    .single();
  
  // Garantir cliente no Asaas
  let customerId = invoice.clients?.asaas_customer_id;
  if (!customerId) {
    // Criar cliente no Asaas
    const customer = await asaasRequest(settings, "/customers", "POST", {...});
    customerId = customer.id;
    await supabase.from("clients").update({ asaas_customer_id: customerId }).eq("id", invoice.client_id);
  }
  
  // Criar cobrança
  const payment = await asaasRequest(settings, "/payments", "POST", {
    customer: customerId,
    billingType: billing_type || "BOLETO",
    value: invoice.amount,
    dueDate: invoice.due_date,
    description: `Fatura #${invoice.invoice_number}`,
    externalReference: invoice.id,
  });
  
  // Atualizar fatura
  const updateData = {
    asaas_payment_id: payment.id,
    asaas_invoice_url: payment.invoiceUrl,
    billing_provider: "asaas",
  };
  
  if (billing_type === "BOLETO" || billing_type === "UNDEFINED") {
    updateData.boleto_url = payment.bankSlipUrl;
    updateData.boleto_barcode = payment.identificationField;
  }
  if (billing_type === "PIX") {
    updateData.pix_code = payment.payload; // QR Code PIX copia-e-cola
  }
  
  await supabase.from("invoices").update(updateData).eq("id", invoice_id);
  
  return response({ success: true, payment_id: payment.id, ...payment });
}
```

### Formulário de Contrato - Schema Zod

```typescript
const contractSchema = z.object({
  // ... campos existentes
  billing_provider: z.enum(["banco_inter", "asaas"]).default("banco_inter"),
  payment_preference: z.enum(["boleto", "pix", "both"]).default("boleto"),
});
```

### Webhook para Baixa Automática

O webhook `webhook-asaas-nfse` será atualizado para processar confirmações de pagamento:

```typescript
if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
  const externalReference = payment.externalReference; // invoice_id
  if (externalReference) {
    await supabase
      .from("invoices")
      .update({ 
        status: "paid", 
        paid_date: payment.paymentDate,
        payment_method: payment.billingType 
      })
      .eq("id", externalReference);
  }
}
```

---

## Fluxo de Decisão

```text
┌─────────────────────────────────────────────────────────────┐
│                    Gerar Cobrança                           │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │ invoice.billing_provider     │
              │     está definido?           │
              └──────────────────────────────┘
                    │                │
                   Sim              Não
                    │                │
                    ▼                ▼
            ┌───────────┐   ┌──────────────────────────┐
            │ Usar esse │   │ contract.billing_provider │
            │ provedor  │   │     está definido?        │
            └───────────┘   └──────────────────────────┘
                                  │              │
                                 Sim            Não
                                  │              │
                                  ▼              ▼
                          ┌───────────┐   ┌─────────────┐
                          │ Usar do   │   │ Usar padrão │
                          │ contrato  │   │ banco_inter │
                          └───────────┘   └─────────────┘
                                  │              │
                                  └──────┬───────┘
                                         │
                                         ▼
                         ┌───────────────────────────────┐
                         │ Provedor = banco_inter?       │
                         └───────────────────────────────┘
                               │                │
                              Sim              Não (asaas)
                               │                │
                               ▼                ▼
                     ┌───────────────┐  ┌───────────────┐
                     │ Chamar        │  │ Chamar        │
                     │ banco-inter   │  │ asaas-nfse    │
                     │ edge function │  │ create_payment│
                     └───────────────┘  └───────────────┘
```

---

## Resultado Esperado

1. **Contratos** terão campo para definir provedor padrão (Banco Inter ou Asaas)
2. **Faturas avulsas** poderão sobrescrever o provedor
3. **Geração automática** respeitará a configuração do contrato/fatura
4. **Ações manuais** (menu de ações) permitirão escolher o provedor
5. **Baixa automática** funcionará via webhooks de ambos provedores
6. **Compatibilidade** mantida com fluxos existentes (padrão Banco Inter)
