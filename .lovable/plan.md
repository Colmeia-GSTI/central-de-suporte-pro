

## Correção: Via Piana e boletos com barcode mas sem PDF

### Problema Atual

A correção anterior adicionou download de PDF no fallback, **porém** a query do fallback filtra apenas faturas com `boleto_barcode IS NULL` (linha 139). O boleto do Via Piana **já tem barcode** (por isso mostra "copiar código"), então o fallback **nunca o encontra** para baixar o PDF.

Há dois cenários a cobrir:
1. **Faturas sem barcode** (já coberto) — recupera barcode + PDF
2. **Faturas COM barcode mas SEM PDF no Storage** (Via Piana, CVR, Ruaro) — precisa apenas baixar o PDF

### Plano

**Arquivo: `supabase/functions/poll-services/index.ts`**

Adicionar uma **segunda query** na função `pollBoletos`, após o loop existente (linha 257):

1. Buscar faturas que tenham `boleto_barcode NOT NULL` mas `boleto_url IS NULL` ou `boleto_url NOT LIKE 'invoice-documents/%'` (ou seja, têm barcode mas o PDF não está no Storage)
2. Para cada uma, extrair o `codigoSolicitacao` do campo `notes`
3. Chamar o endpoint `/cobranca/v3/cobrancas/{id}/pdf` para obter o PDF em base64
4. Upload para `invoice-documents/boletos/{invoice_id}/boleto.pdf`
5. Atualizar `boleto_url` e `boleto_status`
6. Registrar em `invoice_documents`

Isso cobre tanto os boletos antigos (Via Piana) quanto qualquer futuro boleto que receba barcode mas perca o PDF.

### Mudanças Técnicas

| Arquivo | Mudança |
|---|---|
| `supabase/functions/poll-services/index.ts` | Adicionar segundo loop em `pollBoletos` para recuperar PDF de faturas com barcode mas sem PDF no Storage |

### Resultado

- Ao disparar o polling manualmente (botão "Forçar Polling" na aba Boletos), o sistema encontrará o Via Piana e baixará o PDF
- Futuramente, qualquer boleto nessa situação será corrigido automaticamente pelo cron de 6 em 6 horas

