
# Varredura E2E Completa -- Problemas Adicionais Descobertos

Alem dos 5 itens do plano original (painel de erros, historico com acoes, filtro "com erro", acoes no dashboard de saude, edicao inline de codigo de servico), esta varredura revelou **7 problemas adicionais** que precisam ser corrigidos ANTES de implementar o painel de recuperacao.

---

## Problemas Descobertos na Varredura

### Problema A: Botao "Cancelar Boleto/Pix" nao faz nada (CRITICO)

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx` (linhas 697-712)

O botao de cancelamento em lote de boletos na barra de acoes inferior so exibe um `toast.info("Cancelando boletos selecionados...")` mas nao executa nenhuma acao real. Nao chama a edge function `banco-inter` com `action: "cancel"`. Isso pode dar ao usuario a impressao de que os boletos foram cancelados quando nada aconteceu.

**Correcao:** Implementar o cancelamento real iterando sobre as faturas selecionadas e chamando `banco-inter` com `action: "cancel"` (mesmo padrao da `BillingBoletosTab.handleBatchCancel`).

### Problema B: `mapBoletoStatus` nao trata status "registrado" e "processando" (MEDIO)

**Arquivo:** `src/components/billing/InvoiceProcessingHistory.tsx` (linhas 80-85)

A funcao `mapBoletoStatus` so reconhece `pendente`, `gerado`, `enviado` e `erro`. O enum `boleto_processing_status` tambem inclui `processando` e `registrado`. Ambos sao mapeados para `pending` pelo fallback, mas `registrado` deveria ser mapeado para `success` (o boleto ja foi aceito pelo banco).

**Correcao:** Adicionar `if (status === "registrado") return "success"` e `if (status === "processando") return "pending"` explicitamente.

### Problema C: `useBillingCounters` nao conta faturas com erro (MEDIO)

**Arquivo:** `src/hooks/useBillingCounters.ts`

O hook retorna 3 contadores: `overdueInvoices`, `processingBoletos`, `pendingNfse`. Nao inclui um contador de erros (boleto_status = 'erro' OU nfse com status 'erro'/'rejeitada' OU email_status = 'erro'). Sem esse dado, a aba "Erros" no `BillingPage` nao teria um badge com contagem.

**Correcao:** Adicionar um quarto contador `errorCount` que consolida faturas com qualquer tipo de erro.

### Problema D: `InvoiceProcessingHistory` nao exibe status "processando" do boleto corretamente (BAIXO)

**Arquivo:** `src/components/billing/InvoiceProcessingHistory.tsx` (linhas 104-117)

A descricao do step de boleto usa `boleto_url` para determinar se foi gerado, mas nao verifica `boleto_barcode`. Um boleto pode ter barcode sem URL (caso do Banco Inter onde a URL e separada). A descricao ficaria incorreta mostrando "Aguardando geracao" quando o boleto ja tem barcode.

**Correcao:** Verificar `invoice.boleto_url || invoice.boleto_barcode` para determinar se o boleto foi gerado.

### Problema E: `BillingBoletosTab` so mostra boletos do Banco Inter (MEDIO)

**Arquivo:** `src/components/billing/BillingBoletosTab.tsx` (linha 182)

A query filtra por `payment_method = 'boleto'`, o que e correto. Porem, a verificacao de integracao no topo da pagina (linhas 98-173) so verifica o Banco Inter. Se o provedor for Asaas, o usuario ve o banner "Banco Inter nao configurado" mesmo que boletos Asaas estejam funcionando.

**Correcao:** Verificar ambos os provedores (Banco Inter e Asaas) e mostrar o banner adequado. Usar o campo `billing_provider` das faturas para contextualizar.

### Problema F: `handleQuickReprocess` na aba NFS-e passa `action: "emit"` sem `contract_id` para avulsas (BAIXO)

**Arquivo:** `src/components/billing/BillingNfseTab.tsx` (linhas 307-333)

O reprocessamento rapido envia `contract_id: nfse.contract_id || undefined`. Para NFS-e avulsas, `contract_id` sera `null/undefined`, mas a action continua sendo `"emit"` (fluxo de contrato). O correto seria enviar `action: "emit_standalone"` quando nao ha contrato.

**Correcao:** Verificar `nfse.contract_id`: se existir, usar `action: "emit"`; se nao, usar `action: "emit_standalone"`.

### Problema G: Tab badge "Erros" ausente no `BillingPage` (INTEGRAÇÃO)

**Arquivo:** `src/pages/billing/BillingPage.tsx`

O `getTabBadge` (linhas 96-115) so retorna badges para `invoices`, `boletos` e `nfse`. A nova aba "Erros" precisara de um badge vermelho com a contagem de erros totais (do contador adicional do Problema C).

---

## Plano de Implementacao Revisado (12 itens totais)

### Fase 1: Correcoes de bugs existentes (antes do painel)

| # | Correcao | Arquivo | Prioridade |
|---|----------|---------|------------|
| A | Implementar cancelamento real de boleto em lote | `BillingInvoicesTab.tsx` | CRITICO |
| B | Mapear status `registrado` e `processando` corretamente | `InvoiceProcessingHistory.tsx` | MEDIO |
| D | Verificar `boleto_barcode` alem de `boleto_url` no historico | `InvoiceProcessingHistory.tsx` | BAIXO |
| F | Usar `emit_standalone` para reprocessar NFS-e avulsa | `BillingNfseTab.tsx` | BAIXO |

### Fase 2: Infraestrutura para o painel de erros

| # | Correcao | Arquivo | Prioridade |
|---|----------|---------|------------|
| C | Adicionar contador de erros ao `useBillingCounters` | `useBillingCounters.ts` | MEDIO |
| G | Adicionar badge de erros na aba do `BillingPage` | `BillingPage.tsx` | BAIXO |

### Fase 3: Implementar o painel de erros (plano original)

| # | Item | Arquivo | Prioridade |
|---|------|---------|------------|
| 1 | Criar `BillingErrorsPanel` centralizado | `BillingErrorsPanel.tsx` (NOVO) | ALTO |
| 2 | Adicionar botoes de acao no `InvoiceProcessingHistory` | `InvoiceProcessingHistory.tsx` | ALTO |
| 3 | Adicionar filtro "Com Erros" na listagem de faturas | `BillingInvoicesTab.tsx` | MEDIO |
| 4 | Adicionar nova aba "Erros" no `BillingPage` | `BillingPage.tsx` | MEDIO |
| 5 | Adicionar acoes nos incidentes do dashboard de saude | `IntegrationHealthDashboard.tsx` | MEDIO |
| E | Verificar provedor (Inter/Asaas) na aba Boletos | `BillingBoletosTab.tsx` | BAIXO |

---

## Resumo de Arquivos a Alterar

| Arquivo | Alteracoes |
|---------|-----------|
| `src/components/billing/BillingErrorsPanel.tsx` | NOVO -- Painel centralizado de erros |
| `src/components/billing/BillingInvoicesTab.tsx` | Fix cancelamento boleto em lote + filtro "Com Erros" |
| `src/components/billing/InvoiceProcessingHistory.tsx` | Fix mapeamento de status + botoes de acao + check barcode |
| `src/components/billing/BillingNfseTab.tsx` | Fix reprocessamento de NFS-e avulsa (emit_standalone) |
| `src/components/billing/BillingBoletosTab.tsx` | Verificar ambos provedores (Inter + Asaas) |
| `src/components/billing/IntegrationHealthDashboard.tsx` | Botoes de acao nos incidentes |
| `src/hooks/useBillingCounters.ts` | Adicionar contador `errorCount` |
| `src/pages/billing/BillingPage.tsx` | Aba "Erros" + badge |

## Cobertura Completa de Cenarios

| Cenario | Coberto? | Onde? |
|---------|----------|-------|
| Boleto com erro de API (Inter) | Sim | Painel Erros + Historico + Regenerar |
| Boleto com erro de API (Asaas) | Sim | Painel Erros + Historico + Regenerar |
| Boleto orfao (sem barcode) | Sim | Painel Erros + Forcar Polling |
| Cancelamento de boleto em lote | Sim | Fix A (bug atual corrigido) |
| NFS-e contrato com erro de codigo | Sim | Painel Erros + Edicao inline |
| NFS-e avulsa com erro | Sim | Painel Erros + Fix F (emit_standalone) |
| NFS-e duplicada (E0014) | Sim | Painel Erros + Vincular Nota |
| NFS-e rejeitada pela prefeitura | Sim | Painel Erros + Editar e Corrigir |
| Email nao enviado | Sim | Painel Erros + Reenviar |
| WhatsApp nao enviado | Sim | Painel Erros + Reenviar |
| Status `registrado` no historico | Sim | Fix B (mapeamento correto) |
| Boleto com barcode sem URL | Sim | Fix D (verificacao dupla) |
| Aba Boletos com provedor Asaas | Sim | Fix E (verificar ambos) |
| Contador de erros na badge | Sim | Fix C + G |
