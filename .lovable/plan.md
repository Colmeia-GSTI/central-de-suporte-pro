

# Refatoracao Completa do Layout de Faturamento

## Objetivo

Redesenhar a aba de Faturas inspirando-se no layout ERP da imagem de referencia: tabela densa orientada a dados, filtros por periodo/status no topo, acoes rapidas por linha via icones, e barra de acoes em lote fixa no rodape. Toda a logica de backend permanece intacta.

## Novo Layout (de cima para baixo)

### 1. Barra de Cabecalho
- Titulo "Faturamento" a esquerda
- Filtro de periodo (mes/ano) com date range picker
- Campo de busca com icone de lupa a direita
- Botao "Nova Fatura" (com PermissionGate)

### 2. Barra de Filtros
- Filtros horizontais: Status (Todos/Pendente/Pago/Vencido/Cancelado), Provedor, Tipo NFS-e
- Botao "Aplicar" com icone de filtro
- Botao "Limpar" para resetar filtros

### 3. Cards de Resumo (compactos, inline)
- 3 mini-cards horizontais: A Receber (verde), Vencido (vermelho), Recebido (verde)
- Formato compacto (nao cards grandes, sim badges/chips com valor)

### 4. Tabela Principal (estilo ERP denso)

Colunas:
| Checkbox | Cliente (nome + CNPJ/documento) | Faturamento | Vencimento | Tipo | Situacao | Valor (R$) | Acoes (icones) | Menu |

**Coluna "Cliente"**: Nome em negrito + documento abaixo em texto menor cinza (como na imagem de referencia)

**Coluna "Tipo"**: Badge com o tipo (FATURAMENTO, RENEGOCIACAO, etc.) baseado no campo `reference_month` ou origem

**Coluna "Situacao"**: Badge colorido (FATURADO/PENDENTE/VENCIDO/PAGO/ERRO)

**Coluna "Acoes"**: Icones inline clicaveis (como na imagem):
- Olho (ver detalhes/historico)
- Refresh (reprocessar/emitir completo)
- Setas (transferir/renegociar)
- Grafico (indicador boleto)
- Documento (indicador NFS-e)
- Check (indicador email)
- Envelope (reenviar notificacao)
- Cifrao (pagamento/baixa manual)

**Coluna "Menu"**: Botao tres pontos com DropdownMenu (InvoiceActionsPopover existente)

### 5. Paginacao
- Texto "1 a 12 de 51"
- Botoes: Primeiro, Anterior, "Pagina X de Y", Proxima, Ultimo
- Implementar paginacao no frontend (itens por pagina: 15)

### 6. Barra de Acoes em Lote (rodape fixo)
Aparece SEMPRE na parte inferior, com botoes:
- "Mais Opcoes" (dropdown com NFS-e Avulsa, Gerar Faturas Mensais, Cobranca em Lote)
- "Cancelar Nota Fiscal" (vermelho, desabilitado se nenhum selecionado)
- "Cancelar Boleto/Pix" (vermelho, desabilitado se nenhum selecionado)
- "Reenviar Fatura" (outline, desabilitado se nenhum selecionado)
- "Faturar Agora" (primario amarelo, desabilitado se nenhum selecionado)

## Detalhes Tecnicos

### Arquivo principal: `src/components/billing/BillingInvoicesTab.tsx`
- Reescrever o JSX completo com novo layout
- Adicionar estado de paginacao (`currentPage`, `itemsPerPage = 15`)
- Adicionar `paginatedInvoices = filteredInvoices.slice(start, end)` via useMemo
- Mover acoes rapidas (Gerar Faturas Mensais, Cobranca em Lote, NFS-e Avulsa) para dropdown "Mais Opcoes" no rodape
- Adicionar coluna de acoes inline com icones pequenos
- Manter TODOS os estados, queries, handlers e dialogs existentes

### Componente novo: `src/components/billing/InvoiceInlineActions.tsx`
- Componente que renderiza os icones de acao rapida por linha
- Props: invoice, nfseInfo, handlers (mesmos do InvoiceActionsPopover)
- Icones: Eye (historico), Zap (emitir completo), RefreshCw (reprocessar), BarChart (boleto), FileText (NFS-e), Mail (email), DollarSign (pagamento)
- Cada icone com tooltip e cor contextual (verde=ok, vermelho=erro, cinza=pendente)
- Tamanho compacto (h-4 w-4) com gap-1

### Arquivo mantido: `src/components/billing/InvoiceActionsPopover.tsx`
- Sem alteracoes (ja usa DropdownMenu corretamente)

### Arquivo mantido: `src/hooks/useInvoiceActions.ts`
- Sem alteracoes

### Arquivo mantido: `src/components/billing/InvoiceActionIndicators.tsx`
- Sera substituido pelo novo `InvoiceInlineActions` na tabela
- O componente antigo permanece no codebase para uso em outros contextos

## Backend -- Tudo Preservado

Nenhuma logica de backend sera alterada. Todos os handlers, edge functions, queries e dialogs permanecem identicos:

- Query `invoices` com `.select("*, clients(name), contract_id, billing_provider")`
- Query `nfse-by-invoices`
- Hook `useInvoiceActions` (handleGeneratePayment, handleEmitComplete, handleResendNotification, markAsPaidMutation)
- Handlers locais (handleGenerateMonthlyInvoices, handleBatchNotification)
- Todos os 12 dialogs (BillingBatchProcessing, EmitNfseDialog, EmitNfseAvulsaDialog, PixCodeDialog, InvoiceProcessingHistory, ManualPaymentDialog, SecondCopyDialog, RenegotiateInvoiceDialog, CancelNfseDialog, ConfirmDialog, InvoiceForm Dialog)
- Cancel boleto via edge function `banco-inter`
- Cancel NFS-e via edge function `asaas-nfse`

## Estilo Visual

- Background escuro (#0a0a0a) conforme tema existente
- Tabela densa com linhas compactas (py-2 em vez de p-4)
- Bordas sutis (#2a2a2a)
- Badges coloridos para status (verde, amarelo, vermelho)
- Icones de acao com hover scale e cores contextuais
- Barra de rodape com fundo escuro e borda superior
- Paginacao estilo classico com botoes outline

