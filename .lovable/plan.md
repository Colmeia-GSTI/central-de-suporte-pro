
# Corrigir Clique no Boleto e Resolver NFS-e do Comercial

## Problema 1: Clique no boleto abre tela de PIX

O icone de boleto (Barcode) na listagem de faturas sempre executa `setPixDialogInvoice(invoice)`, que abre o dialogo de PIX independentemente de a fatura ter boleto ou PIX. O comportamento correto deve ser:

- Se tem `boleto_url` (PDF): abrir o PDF em nova aba
- Se tem `boleto_barcode` mas nao tem `boleto_url`: exibir o codigo de barras para copia
- Se tem `pix_code` e nao tem boleto: abrir o dialogo PIX
- Se nao tem nada: nao fazer nada (ou mostrar aviso)

### Mudancas

**Arquivo: `src/components/billing/BillingInvoicesTab.tsx`**

Substituir a linha 450:
```text
onBoletoClick={() => setPixDialogInvoice(invoice)}
```

Por uma funcao inteligente `handleBoletoClick(invoice)` que:

1. Se `invoice.boleto_url` existe, abre `window.open(invoice.boleto_url, "_blank")`
2. Se `invoice.boleto_barcode` existe (sem URL), copia o barcode para a area de transferencia e exibe toast "Codigo de barras copiado!"
3. Se so tem `invoice.pix_code`, abre o dialogo PIX (comportamento atual)
4. Se nao tem nenhum, exibe toast informativo "Nenhum boleto ou PIX gerado"

**Arquivo: `src/components/billing/InvoiceInlineActions.tsx`**

Atualizar o tooltip do boleto para ser mais descritivo:
- Com URL: "Abrir PDF do boleto"
- Com barcode sem URL: "Copiar codigo de barras"
- Sem nada: "Boleto pendente"

---

## Problema 2: NFS-e do Comercial com erro E0014

A fatura #9 do Clube Comercial tem uma unica entrada em `nfse_history` com status "erro" e codigo E0014 (DPS duplicada -- a nota ja foi emitida na prefeitura mas o sistema nao tem o registro como "autorizada"). A prioridade do reduce funciona corretamente, mas nao existe um registro "autorizada" para priorizar.

A solucao ja implementada na `BillingNfseTab` (linha expandida com erro + botao "Vincular Nota") permite ao usuario vincular a nota externa. No entanto, na aba de Faturas o indicador de NFS-e aparece vermelho sem explicacao.

### Mudancas

**Arquivo: `src/components/billing/BillingInvoicesTab.tsx`**

Melhorar o `onNfseClick` para que, quando o status for "erro", abra diretamente a aba de NFS-e com filtro de erro, em vez de abrir o dialogo de emissao de NFS-e. Atualmente (linha 451):

```text
onNfseClick={() => setNfseInvoice(invoice)}
```

Alterar para: se a NFS-e tem status "erro" ou "rejeitada", navegar para `/billing?tab=nfse` para que o usuario veja o erro expandido e as acoes de correcao. Se nao tem NFS-e ou esta pendente, manter o comportamento de abrir o dialogo de emissao.

**Arquivo: `src/components/billing/InvoiceInlineActions.tsx`**

Atualizar o tooltip da NFS-e para incluir a mensagem de erro quando disponivel:
- Status "erro": "NFS-e com erro - clique para ver detalhes"
- Status "autorizada": "NFS-e autorizada"

---

## Resumo de Arquivos

| Arquivo | Mudanca |
|---------|---------|
| `src/components/billing/BillingInvoicesTab.tsx` | Funcao `handleBoletoClick` inteligente + `onNfseClick` com redirecionamento para erros |
| `src/components/billing/InvoiceInlineActions.tsx` | Tooltips atualizados para boleto e NFS-e |

## Resultado

| Cenario | Antes | Depois |
|---------|-------|--------|
| Clicar boleto com PDF | Abre PIX | Abre PDF em nova aba |
| Clicar boleto com barcode sem PDF | Abre PIX | Copia barcode |
| Clicar boleto com PIX apenas | Abre PIX | Abre PIX (mantido) |
| Clicar NFS-e com erro | Abre dialogo emissao | Navega para aba NFS-e com detalhes do erro |
