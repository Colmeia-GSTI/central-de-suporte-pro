

# Exibir "Data do Pagamento" na listagem de faturas

## Diagnóstico

Investiguei todos os fluxos de registro de `paid_date`:

| Fluxo | Registra `paid_date`? | Fonte da data |
|---|---|---|
| Webhook Banco Inter (boleto) | Sim | `dataHoraSituacao` ou `dataSituacao` do payload |
| Webhook Banco Inter (PIX) | Sim | `dataHoraSituacao` do payload |
| Webhook Asaas (NFS-e payment) | Sim | `paymentDate` do Asaas |
| Poll-services (polling) | Sim | `dataSituacao` do Banco Inter |
| Pagamento manual (edge function) | Sim | Data informada pelo usuário |
| Marcar como pago (frontend) | Sim | `new Date().toISOString()` |

**Todos os fluxos de backend já registram corretamente o `paid_date`.** O problema é exclusivamente que o componente `BillingInvoicesTab.tsx` **não exibe** esse campo na tabela/cards.

## Solução

Apenas **1 arquivo** precisa ser alterado:

### `src/components/billing/BillingInvoicesTab.tsx`
- **Desktop**: Adicionar coluna "Dt. Pagamento" na tabela, exibindo `paid_date` formatado como `dd/MM/yyyy` (ou "-" se vazio)
- **Mobile**: Exibir a data de pagamento nos cards quando a fatura estiver paga
- Ajustar `colSpan` dos estados vazios/skeleton para acomodar a nova coluna

O plano anterior está completo — não há lacuna no registro dos dados, apenas na exibição.

