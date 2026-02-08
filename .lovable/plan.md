

# Varredura E2E - Erros, Otimizacoes e Correcoes

## Problemas Encontrados

### 1. CRITICO: Filtro de busca de faturas nao funciona
**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx` (linhas 149-164)

O campo de busca (`search`) esta incluido no `queryKey` (linha 150), o que dispara uma nova query a cada digitacao, mas **a variavel `search` nunca e usada na query SQL** (linhas 152-163). O filtro de texto simplesmente nao faz nada -- o usuario digita e nada muda.

**Correcao:** Filtrar faturas no frontend (`invoices.filter(...)`) pelo nome do cliente e numero da fatura, ou usar `.ilike()` no Supabase. Filtrar no frontend e mais simples e eficiente aqui, ja que os dados ja estao carregados.

---

### 2. CRITICO: Query de faturas sem limite no BillingInvoicesTab
**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx` (linha 152-161)

A query de faturas nao tem `.limit()`. Com o tempo, isso pode retornar centenas/milhares de faturas, causando lentidao e estouro do limite de 1000 registros do Supabase.

**Correcao:** Adicionar `.limit(200)` ou implementar paginacao.

---

### 3. MEDIO: Query NFS-e sem filtro carrega TODOS os registros
**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx` (linhas 168-186)

A query `nfse-by-invoices` carrega **todas** as NFS-e do banco, sem filtro por `invoice_id`. Isso e ineficiente e vai piorar com o volume.

**Correcao:** Filtrar apenas pelas faturas atualmente vissiveis: `.in("invoice_id", invoices.map(i => i.id))`.

---

### 4. MEDIO: Codigo duplicado entre `BillingInvoicesTab` e `ContractInvoiceActionsMenu`
**Arquivos:** `BillingInvoicesTab.tsx` (~250 linhas de logica) e `ContractInvoiceActionsMenu.tsx` (~260 linhas)

As funcoes `handleGeneratePayment`, `handleEmitComplete`, `handleResendNotification` e `markAsPaidMutation` estao copiadas quase identicamente em ambos os arquivos. Qualquer correcao em um precisa ser replicada no outro.

**Correcao:** Extrair um hook customizado `useInvoiceActions()` que centraliza toda a logica de acoes sobre faturas.

---

### 5. BAIXO: InvoiceActionIndicators com status incompativeis
**Arquivo:** `src/components/billing/InvoiceActionIndicators.tsx` (linhas 6-14)

O componente espera `boletoStatus` como `"pendente" | "gerado" | "enviado" | "erro"`, mas o banco de dados armazena o enum `boleto_processing_status` com os mesmos valores. O problema e que na linha 857, usamos `as any` para forcar o tipo, indicando incompatibilidade de tipos.

**Correcao:** Usar os tipos do enum diretamente do Supabase em vez de strings hardcoded.

---

### 6. BAIXO: `nfseStatus` no InvoiceActionIndicators nunca mostra "gerada"
**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx` (linha 861)

O `nfseStatus` esta sendo alimentado pelo campo `invoice.nfse_status` da tabela `invoices`, mas o status real da NFS-e vem da tabela `nfse_history` (acessada via `nfseByInvoice`). O campo `invoice.nfse_status` pode estar dessincronizado do status real.

**Correcao:** Usar `nfseByInvoice[invoice.id]?.status || "pendente"` para o indicador, com mapeamento dos status da tabela `nfse_history` para os aceitos pelo componente.

---

### 7. BAIXO: Polling do banco-inter bloqueia a Edge Function por ate 60s
**Arquivo:** `supabase/functions/banco-inter/index.ts` (linhas 548-585)

O loop de polling interno (12 tentativas x 5s = 60s) pode causar timeout da Edge Function. Se o boleto demora para ser processado pelo banco, a funcao fica bloqueada.

**Correcao:** Reduzir para 6 tentativas (30s max) e confiar no `poll-services` como fallback para os casos que excedem esse tempo. O webhook ja cuida dos updates em tempo real.

---

### 8. BAIXO: `toggleSelectAll` seleciona TODAS as faturas, nao apenas as filtradas
**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx` (linhas 438-444)

Se o usuario filtra por "Pendente", o botao "selecionar todos" seleciona todas as faturas incluindo pagas/canceladas (porque `invoices` contem todos os resultados da query).

**Correcao:** Aplicar o mesmo filtro de busca antes de selecionar.

---

## Plano de Implementacao

### Fase 1: Correcoes criticas (impacto imediato)

1. **Implementar filtro de busca funcional** no `BillingInvoicesTab`:
   - Criar `filteredInvoices` com `invoices.filter()` usando `search` para filtrar por nome do cliente e numero da fatura
   - Substituir `invoices` por `filteredInvoices` no render da tabela e nos calculos de totais
   - Remover `search` do `queryKey` (evita re-fetch desnecessario)

2. **Adicionar limite na query de faturas** (`.limit(500)`)

3. **Otimizar query NFS-e** para filtrar apenas faturas vissiveis

### Fase 2: Otimizacoes de codigo

4. **Extrair hook `useInvoiceActions`** com:
   - `handleGeneratePayment(invoiceId, type, provider)`
   - `handleEmitComplete(invoice, nfseByInvoice)`
   - `handleResendNotification(invoiceId, channels)`
   - `markAsPaid(invoiceId)`
   - Estados: `generatingPayment`, `processingComplete`, `sendingNotification`

5. **Corrigir `nfseStatus` nos indicadores** usando dados reais do `nfseByInvoice`

6. **Corrigir `toggleSelectAll`** para usar `filteredInvoices`

### Fase 3: Otimizacoes de backend

7. **Reduzir timeout de polling do banco-inter** de 60s para 30s

## Arquivos Modificados

- `src/components/billing/BillingInvoicesTab.tsx` - Correcoes 1, 2, 3, 5, 6, 8
- `src/hooks/useInvoiceActions.ts` - Novo hook (correcao 4)
- `src/components/contracts/ContractInvoiceActionsMenu.tsx` - Refatorar para usar o hook
- `supabase/functions/banco-inter/index.ts` - Correcao 7

## Riscos

- O hook `useInvoiceActions` centraliza logica que antes era local -- testar ambos os pontos de uso (BillingInvoicesTab e ContractHistorySheet)
- A reducao do polling de 60s para 30s pode causar mais boletos ficando em estado "pendente" temporariamente, mas o `poll-services` e webhooks compensam

