

## Diagnóstico: Erro ao cancelar NFS-e da fatura Bocchese

### Causa Raiz

O componente `CancelNfseDialog` na aba de Faturas (`BillingInvoicesTab.tsx`) está com **props incompatíveis**. Na linha 1058, ele é chamado assim:

```tsx
<CancelNfseDialog
  invoice={cancelNfseInvoice}    // ← prop que NÃO EXISTE no componente
  open={!!cancelNfseInvoice}
  onOpenChange={...}
  // ← falta onConfirm (OBRIGATÓRIO)
  // ← falta invoiceNumber
  // ← falta nfseNumber
/>
```

O componente `CancelNfseDialog` espera estas props:
- `onConfirm: (justification: string) => Promise<void>` — **obrigatório, não passado**
- `invoiceNumber` — não passado
- `nfseNumber` — não passado

**Resultado:** O dialog abre mas o botão "Confirmar Cancelamento" chama `onConfirm` que é `undefined`, causando crash. Ou o TypeScript nem compila corretamente. A NFS-e #170 do Bocchese permanece `autorizada`.

### Plano de Correção

**Arquivo: `src/components/billing/BillingInvoicesTab.tsx`** (linhas 1057-1064)

Corrigir a chamada do `CancelNfseDialog` para:

1. Passar `invoiceNumber` e `nfseNumber` extraídos do invoice e do `nfseByInvoice`
2. Implementar `onConfirm` que chama `supabase.functions.invoke("asaas-nfse", { body: { action: "cancel", ... } })` — mesma lógica usada em `NfseDetailsSheet.tsx`
3. Após sucesso, invalidar queries relevantes e fechar o dialog

A lógica de cancelamento será:
- Buscar o `nfse_history` da fatura (via `nfseByInvoice` já disponível)
- Chamar `asaas-nfse` com `action: "cancel"`, passando `nfse_history_id` e `justification`
- Atualizar o status na tabela `nfse_history`
- Mostrar toast de sucesso/erro

### Arquivos a editar

| Arquivo | Mudança |
|---|---|
| `src/components/billing/BillingInvoicesTab.tsx` | Corrigir props do `CancelNfseDialog` com `onConfirm`, `invoiceNumber`, `nfseNumber` |

### Resultado

- O cancelamento de NFS-e funcionará corretamente na aba de Faturas
- A NFS-e #170 do Bocchese poderá ser cancelada via interface
- Nenhuma outra nota terá esse problema no futuro

