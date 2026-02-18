

# Correcao: Menu de Acoes Ausente no Mobile + Erro no "Faturar Agora"

## Problemas Identificados

### 1. Menu "Gerar Boleto" nao aparece (mobile e desktop)
O componente `InvoiceActionsPopover` (menu de 3 pontos com "Gerar Boleto", "Gerar PIX", etc.) **so e renderizado na tabela desktop** (linha 582). Na view mobile (cards, linhas 367-465), ele nao existe -- apenas os icones inline (`InvoiceInlineActions`) sao mostrados, que nao possuem opcao de gerar boleto.

### 2. "Faturar Agora" falha por data de vencimento no passado
O Banco Inter rejeitou o boleto com o erro: *"O valor deve ser igual ou maior a data atual"* -- a fatura #14 tem vencimento em 2026-02-07, que ja passou. O sistema tenta gerar o boleto com a data original, e o banco recusa.

### 3. PixCodeDialog com props incompativeis
Nas linhas 794-801, o `PixCodeDialog` recebe `invoice={pixDialogInvoice}`, mas o componente espera props individuais (`pixCode`, `invoiceNumber`, `amount`, `clientName`). Isso causa erro de renderizacao.

### 4. NFS-e erro de impostos (secundario)
O Asaas retornou "Necessario informar os impostos da nota fiscal" para a fatura #14. Isso e um problema de configuracao tributaria no cadastro, nao de codigo.

---

## Plano de Correcao

### Arquivo 1: `src/components/billing/BillingInvoicesTab.tsx`

**A) Adicionar InvoiceActionsPopover no card mobile**
- Dentro do card mobile (linha ~386), adicionar o botao de 3 pontos com o `InvoiceActionsPopover`, igual ao desktop
- Isso disponibiliza "Gerar Boleto", "Gerar PIX", "Segunda Via", "Renegociar" etc. no celular

**B) Corrigir PixCodeDialog**
- Nas linhas 794-801, trocar `invoice={pixDialogInvoice}` para passar as props corretas: `pixCode`, `invoiceNumber`, `amount`, `clientName`

### Arquivo 2: `supabase/functions/banco-inter/index.ts`

**C) Auto-ajustar data de vencimento vencida**
- Antes de enviar para o Banco Inter, verificar se `dataVencimento` e menor que hoje
- Se for, ajustar automaticamente para hoje (ou hoje + 1 dia util)
- Isso resolve o bloqueio de geracao de boleto para faturas vencidas

### Arquivo 3: `supabase/functions/batch-process-invoices/index.ts`

**D) Mesma validacao de data**
- Garantir que o batch process tambem ajusta datas vencidas antes de chamar o banco-inter

---

## Detalhes Tecnicos

### Mobile: Adicao do menu de 3 pontos
No card mobile, sera adicionado o botao no canto superior direito do card, ao lado dos badges de status:

```text
[Nome do Cliente]          [Badge Status] [...]
#14                        R$ 767,50
Venc: 07/02/2026           [icones inline]
```

### Auto-ajuste de data no Banco Inter
```text
// Antes de enviar para API do Banco Inter:
const hoje = new Date().toISOString().split("T")[0]; // "2026-02-18"
if (dataVencimento < hoje) {
  dataVencimento = hoje; // ajusta para hoje
}
```

### PixCodeDialog fix
```text
// De:
<PixCodeDialog invoice={pixDialogInvoice} ... />

// Para:
<PixCodeDialog
  pixCode={pixDialogInvoice.pix_code!}
  invoiceNumber={pixDialogInvoice.invoice_number}
  amount={pixDialogInvoice.amount}
  clientName={pixDialogInvoice.clients?.name || "Cliente"}
  ...
/>
```

