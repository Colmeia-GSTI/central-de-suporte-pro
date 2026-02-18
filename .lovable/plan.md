
# Investigacao Completa: Boleto Pendente + Icone Verde NFS-e

## Causas Raiz Identificadas

### Problema 1: Boleto pendente (RUARO e CVR)

As faturas #14 e #15 tem `auto_payment_generated: true` mas NENHUM dado de boleto (`boleto_barcode: null`, `boleto_url: null`, `boleto_sent_at: null`). Isso indica que o sistema marcou o pagamento como "gerado" prematuramente, sem que a chamada ao Banco Inter tenha realmente produzido resultado. Nao ha mensagem de erro (`boleto_error_msg: null`), o que significa que a geracao silenciosamente falhou ou nunca foi executada.

**Correcao:** Resetar `auto_payment_generated` para `false` nestas faturas para permitir nova geracao, e investigar se o fluxo de geracao automatica (`generate-invoice-payments`) possui tratamento adequado de falhas.

### Problema 2: Invoice `nfse_status` nao atualizado (BUG ESTRUTURAL)

A edge function `asaas-nfse` cria/atualiza registros na tabela `nfse_history` mas **NUNCA** atualiza o campo `nfse_status` na tabela `invoices`. O `poll-asaas-nfse-status` tambem nao faz isso. Somente `batch-process-invoices` e `generate-monthly-invoices` atualizam este campo.

Resultado: As NFS-e de RUARO e CVR estao **autorizadas** (status `autorizada` com PDF e XML no `nfse_history`), mas as faturas mostram `nfse_status: pendente`.

**Correcao:**
- SQL imediato: Atualizar `nfse_status` das faturas #14 e #15 para refletir o estado real
- Codigo: Adicionar atualizacao de `nfse_status` na `asaas-nfse` (quando status muda) e no `poll-asaas-nfse-status` (quando detecta autorizacao)

### Problema 3: Icone verde de NFS-e nao mostra PDF (BUG FRONTEND)

A query `nfseByInvoice` (linha 147 de `BillingInvoicesTab.tsx`) seleciona apenas `invoice_id, status, numero_nfse` -- **NAO inclui `pdf_url` nem `xml_url`**. O tipo `NfseByInvoice` (linha 57) tambem nao possui estes campos.

Consequencia: Mesmo com NFS-e autorizada com PDF disponivel, o handler `onNfseClick` nao tem acesso ao `pdf_url` e abre o dialogo de emissao em vez de oferecer download do PDF.

**Correcao:**
- Incluir `pdf_url` e `xml_url` na query e no tipo
- Alterar `onNfseClick`: quando status for `autorizada` e `pdf_url` existir, abrir o PDF diretamente (ou gerar signed URL se for path do Storage)
- Alterar `onBoletoClick`: manter logica atual (ja abre PDF quando `boleto_url` existe)

### Problema 4: Tooltip do icone verde nao indica acao

Quando a NFS-e esta autorizada, o tooltip diz apenas "NFS-e autorizada". Deveria dizer "Abrir PDF da NFS-e" para indicar que e clicavel com acao direta. O mesmo para boleto: quando pronto, o tooltip ja diz "Abrir PDF do boleto" (isso esta correto).

---

## Plano de Correcoes

### Fase 1: Correcao de dados (SQL)

- Atualizar `nfse_status: 'gerada'` e `nfse_generated_at` nas faturas #14 e #15 (refletindo que a NFS-e foi autorizada)
- Resetar `auto_payment_generated: false` para permitir nova tentativa de geracao de boleto

### Fase 2: Backend - `asaas-nfse/index.ts`

Apos criar/atualizar um registro em `nfse_history`, tambem atualizar o campo `nfse_status` na tabela `invoices`:
- Quando status = `processando`: `nfse_status: 'processando'`
- Quando status = `autorizada`: `nfse_status: 'gerada'`, `nfse_generated_at: now()`
- Quando status = `erro`: `nfse_status: 'erro'`, `nfse_error_msg: mensagem`

Locais a alterar: action `emit` e action `emit_standalone` (apos o insert/update em nfse_history)

### Fase 3: Backend - `poll-asaas-nfse-status/index.ts`

Quando o polling detecta que uma NFS-e mudou para `AUTHORIZED`:
- Atualizar `nfse_status: 'gerada'` e `nfse_generated_at` na fatura associada

### Fase 4: Frontend - `BillingInvoicesTab.tsx`

1. Alterar tipo `NfseByInvoice` (linha 57):
   ```
   { status: string; numero_nfse: string | null; pdf_url?: string | null; xml_url?: string | null }
   ```

2. Alterar query (linha 147): adicionar `pdf_url, xml_url` no select

3. Alterar `onNfseClick` (linhas 429-436 e 565-571):
   - Se status `autorizada` e `pdf_url` existir: gerar signed URL (se path do Storage) e abrir PDF
   - Se status `erro`/`rejeitada`: redirecionar para aba NFS-e (manter comportamento atual)
   - Senao: abrir dialogo de emissao (manter comportamento atual)

### Fase 5: Frontend - `invoiceIndicators.ts`

Alterar tooltip da NFS-e autorizada (linha 67):
- De: `"NFS-e autorizada"`
- Para: `"Abrir PDF da NFS-e"` (quando pdf_url existe) ou `"NFS-e autorizada"` (quando pdf nao existe)

---

## Resumo de Arquivos

| Arquivo | Alteracao |
|---------|-----------|
| SQL direto | Corrigir `nfse_status` e `auto_payment_generated` das faturas #14/#15 |
| `supabase/functions/asaas-nfse/index.ts` | Atualizar `invoices.nfse_status` apos operacoes em `nfse_history` |
| `supabase/functions/poll-asaas-nfse-status/index.ts` | Atualizar `invoices.nfse_status` quando NFS-e e autorizada |
| `src/components/billing/BillingInvoicesTab.tsx` | Tipo + query + click handler para PDF direto |
| `src/utils/invoiceIndicators.ts` | Tooltip contextual com pdf_url |

## Resultado Esperado

1. Faturas #14/#15 mostrarao NFS-e como "gerada" (icone verde)
2. Clique no icone verde de NFS-e abrira o PDF diretamente
3. Clique no icone verde de boleto abrira o PDF diretamente (ja funciona quando boleto_url existe)
4. Boletos poderao ser regenerados apos reset do `auto_payment_generated`
5. Futuras emissoes de NFS-e atualizarao automaticamente o status na fatura
