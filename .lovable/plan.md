
# Correção de Bugs no Formulário de Contrato + Geração de Cobrança Inicial

## Problemas Identificados

### 1. Serviços de Novos Contratos Não São Salvos (Bug Crítico)
**Localização**: `src/components/contracts/ContractForm.tsx`, linha 260

**Problema**: O código usa `contractId` (que é `undefined` para novos contratos) em vez de `contractIdValue` (que contém o ID do contrato recém-criado).

```typescript
// CÓDIGO ATUAL (BUGADO)
if (contractId && contractServices.length > 0) {
  // Delete existing services
  await supabase
    .from("contract_services")
    .delete()
    .eq("contract_id", contractId);  // <- contractId é undefined para novos contratos!
```

### 2. Serviços Parecem Não Aparecer
**Causa**: O cache do React Query não invalida automaticamente quando serviços são criados em outra aba. Quando o usuário cria um serviço em `/billing?tab=services` e depois vai criar um contrato, o cache pode estar desatualizado.

### 3. Falta Opção de Gerar Cobrança no Cadastro
**Necessidade**: Ao criar um contrato, permitir gerar automaticamente a primeira fatura seguindo o dia de vencimento configurado.

---

## Solução Proposta

### Correção 1: Salvar Serviços de Novos Contratos

Modificar a lógica de salvamento para usar `contractIdValue` corretamente:

```typescript
// CÓDIGO CORRIGIDO
// Save contract services (usa contractIdValue para novos contratos)
if (contractIdValue && contractServices.length > 0) {
  // Para edição, deletar serviços existentes
  if (isUpdate) {
    await supabase
      .from("contract_services")
      .delete()
      .eq("contract_id", contractIdValue);
  }

  // Insert new services
  const servicesToInsert = contractServices.map((s) => ({
    contract_id: contractIdValue, // <- Usar contractIdValue aqui!
    service_id: s.service_id,
    name: s.service_name,
    quantity: s.quantity,
    unit_value: s.unit_value,
    value: s.subtotal,
  }));

  const { error: servicesError } = await supabase
    .from("contract_services")
    .insert(servicesToInsert);
  if (servicesError) throw servicesError;
}
```

### Correção 2: Invalidar Cache de Serviços

No componente `ServiceForm` (quando um serviço é criado/atualizado), garantir que invalide também a query `services-active`:

```typescript
queryClient.invalidateQueries({ queryKey: ["services"] });
queryClient.invalidateQueries({ queryKey: ["services-active"] }); // <- Adicionar
```

### Correção 3: Nova Opção "Gerar Primeira Cobrança"

Adicionar ao formulário de contrato:
- Checkbox: "Gerar primeira cobrança ao salvar"
- Quando marcado, após criar o contrato, calcular a data de vencimento e criar a fatura

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/contracts/ContractForm.tsx` | Corrigir bug do `contractIdValue` + adicionar opção de gerar cobrança |
| `src/components/services/ServiceForm.tsx` | Invalidar cache `services-active` |
| Schema (opcional) | Nenhuma alteração necessária - usa estrutura existente |

---

## Interface Proposta

Na seção de Faturamento do formulário de contrato:

```
┌─────────────────────────────────────────────────────────────┐
│  💳 Faturamento                                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Dia do Vencimento:     [10]   Dias de Antecedência: [5]   │
│                                                             │
│  Provedor de Cobrança:  [Banco Inter ▼]                    │
│  Preferência:           [Boleto ▼]                         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑ Gerar primeira cobrança ao criar contrato        │   │
│  │                                                      │   │
│  │   A fatura será gerada para o mês atual com        │   │
│  │   vencimento no dia 10/02/2026                     │   │
│  │                                                      │   │
│  │   Valor: R$ 650,00                                 │   │
│  │   Competência: 2026-02                             │   │
│  │                                                      │   │
│  │   ☑ Gerar boleto/PIX automaticamente              │   │
│  │   ☑ Enviar notificação por email                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Geração de Cobrança Inicial

```
┌────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│  Criar         │     │  Salvar         │     │  Gerar Fatura    │
│  Contrato      │────▶│  Serviços       │────▶│  Inicial         │
│  + Serviços    │     │  (contractId)   │     │  (se marcado)    │
└────────────────┘     └─────────────────┘     └────────┬─────────┘
                                                         │
                                                         ▼
                                               ┌──────────────────┐
                                               │  Gerar Cobrança  │
                                               │  (boleto/PIX)    │
                                               │  via provider    │
                                               └────────┬─────────┘
                                                         │
                                                         ▼
                                               ┌──────────────────┐
                                               │  Enviar Email    │
                                               │  (se habilitado) │
                                               └──────────────────┘
```

---

## Detalhes de Implementação

### Novo Campo no Schema do Formulário

```typescript
const contractSchema = z.object({
  // ... campos existentes ...
  
  // Novos campos para cobrança inicial
  generate_initial_invoice: z.boolean().default(false),
  generate_payment: z.boolean().default(true),
  send_notification: z.boolean().default(true),
});
```

### Lógica de Criação da Fatura Inicial

Após criar o contrato com sucesso:

```typescript
if (data.generate_initial_invoice && contractIdValue) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const referenceMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  
  // Calcular data de vencimento
  const billingDay = data.billing_day || 10;
  const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
  const actualBillingDay = Math.min(billingDay, lastDayOfMonth);
  const dueDate = `${referenceMonth}-${String(actualBillingDay).padStart(2, "0")}`;
  
  // Criar fatura
  const invoiceAmount = calculatedTotal > 0 ? calculatedTotal : data.monthly_value;
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      client_id: data.client_id,
      contract_id: contractIdValue,
      amount: invoiceAmount,
      due_date: dueDate,
      reference_month: referenceMonth,
      status: "pending",
      billing_provider: data.billing_provider,
      notes: `Primeira fatura - ${data.name}`,
    })
    .select("id, invoice_number")
    .single();
  
  if (!invoiceError && invoice) {
    // Gerar cobrança via provider (se solicitado)
    if (data.generate_payment) {
      await supabase.functions.invoke(
        data.billing_provider === "asaas" ? "asaas-nfse" : "banco-inter",
        {
          body: {
            invoice_id: invoice.id,
            payment_type: data.payment_preference === "both" ? "boleto" : data.payment_preference,
            ...(data.billing_provider === "asaas" && {
              action: "create_payment",
              billing_type: data.payment_preference === "pix" ? "PIX" : "BOLETO",
            }),
          },
        }
      );
    }
    
    // Enviar notificação (se solicitado)
    if (data.send_notification) {
      await supabase.functions.invoke("resend-payment-notification", {
        body: { invoice_id: invoice.id },
      });
    }
  }
}
```

---

## Resumo das Alterações

| Item | Tipo | Impacto |
|------|------|---------|
| Corrigir salvamento de serviços | Bug fix | Crítico - serviços agora serão salvos |
| Invalidar cache de serviços | Melhoria | UX - serviços aparecem imediatamente |
| Opção gerar cobrança inicial | Nova feature | Permite cobrar no momento da criação |

### Arquivos Modificados
- `src/components/contracts/ContractForm.tsx` - Correção principal + nova feature
- `src/components/services/ServiceForm.tsx` - Invalidação de cache adicional
