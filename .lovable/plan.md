

# Correcao do Erro "Cannot read properties of null (reading 'due_date')"

## Causa Raiz

O componente `EmitNfseDialog` e renderizado **sempre** no JSX do `BillingInvoicesTab.tsx`, mesmo quando `nfseInvoice` e `null`. Dentro do `EmitNfseDialog` (linha 60), o `useState` tenta acessar `invoice.due_date` imediatamente durante a montagem do componente:

```typescript
const [competenciaDate, setCompetenciaDate] = useState<Date>(() => {
  return new Date(invoice.due_date); // CRASH: invoice e null
});
```

O Radix Dialog monta o componente filho mesmo com `open={false}`, o que causa o crash fatal.

## Correcao

### Arquivo: `src/components/billing/BillingInvoicesTab.tsx`

Adicionar um guard para nao renderizar o componente quando `nfseInvoice` for null:

**Antes:**
```tsx
<EmitNfseDialog
  invoice={nfseInvoice}
  open={!!nfseInvoice}
  onOpenChange={(open) => {
    if (!open) setNfseInvoice(null);
  }}
/>
```

**Depois:**
```tsx
{nfseInvoice && (
  <EmitNfseDialog
    invoice={nfseInvoice}
    open={true}
    onOpenChange={(open) => {
      if (!open) setNfseInvoice(null);
    }}
  />
)}
```

O mesmo padrao sera aplicado a outros dialogs que possam ter o mesmo problema (`PixCodeDialog`, `ManualPaymentDialog`, `SecondCopyDialog`, `RenegotiateInvoiceDialog`, etc.) para prevenir crashes similares.

### Verificacao Adicional

Revisar todos os dialogs renderizados no final do `BillingInvoicesTab` para garantir que nenhum acessa propriedades de objetos potencialmente null durante a montagem.

