

## Correção: Campo "motivo" vs "justification" no cancelamento de NFS-e

### Causa Raiz

O dialog de cancelamento **funciona corretamente** (abre, valida, envia). Porém a chamada à edge function `asaas-nfse` envia o campo `motivo` enquanto a função espera `justification`.

**Frontend envia:**
```json
{ "action": "cancel", "invoice_id": "...", "nfse_history_id": "...", "motivo": "..." }
```

**Edge function espera:**
```typescript
const { invoice_id, nfse_history_id, justification } = params;
// justification é undefined → erro 400 MISSING_JUSTIFICATION
```

### Correção

| Arquivo | Mudança |
|---|---|
| `src/components/billing/BillingInvoicesTab.tsx` | Linha ~1084: renomear `motivo` para `justification` no body da chamada |

A mudança é de uma única palavra: `motivo: justification` → `justification: justification` (ou simplesmente `justification`).

### Resultado

- O cancelamento de NFS-e funcionará end-to-end
- A NFS-e #170 do Bocchese poderá ser cancelada com sucesso

