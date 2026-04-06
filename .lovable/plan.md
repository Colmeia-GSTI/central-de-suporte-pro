

## Plano: Aumentar tempos de polling do boleto + download de PDF no fallback

### Problema

Quando o Banco Inter demora mais que 30 segundos para processar o boleto, o sistema desiste do polling imediato e o boleto fica sem PDF. O fallback (`poll-services`) recupera o barcode mas não baixa o PDF.

### Correções

#### 1. Aumentar polling imediato (`banco-inter/index.ts`, linha 726-730)

- **Intervalo entre tentativas**: de 5s → **15s**
- **Número de tentativas**: de 6 → **12** (total: ~3 minutos)
- Alterar: `const maxTentativas = 12;` e `setTimeout(r, 15000)`

#### 2. Adicionar download de PDF no fallback (`poll-services/index.ts`, função `pollBoletos`)

Após recuperar o barcode com sucesso (linha ~194), adicionar:

1. Chamar `GET /cobranca/v3/cobrancas/{codigoSolicitacao}/pdf` para obter o PDF em base64
2. Decodificar e fazer upload para o bucket `invoice-documents`
3. Registrar na tabela `invoice_documents`
4. Salvar o caminho do Storage em `boleto_url`
5. Atualizar `boleto_status` para `"enviado"`

### Arquivos a editar

| Arquivo | Mudança |
|---|---|
| `supabase/functions/banco-inter/index.ts` | Aumentar `maxTentativas` para 12, intervalo para 15s |
| `supabase/functions/poll-services/index.ts` | Adicionar download/armazenamento de PDF na função `pollBoletos` |

### Resultado esperado

- Polling imediato aguarda até ~3 minutos (cobre a maioria dos casos)
- Se ainda assim o boleto não ficar pronto a tempo, o fallback periódico recupera barcode **e PDF**
- Todo boleto terá PDF disponível para download e envio por e-mail

