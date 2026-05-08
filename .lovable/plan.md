# Plano: Diagnóstico E2E do Faturamento e correção dos erros recentes

## Contexto
A página `/billing` está quebrada com o erro de runtime:
`ReferenceError: InvoiceTableRow is not defined` em `BillingInvoicesTab.tsx:684`.

O componente `src/components/billing/InvoiceTableRow.tsx` existe, mas **não está importado** no `BillingInvoicesTab.tsx` — provavelmente uma refatoração de hoje extraiu a linha da tabela para um arquivo separado e esqueceu o import.

Esse erro impede qualquer teste posterior do fluxo, então é correção #1.

## Estratégia em 3 fases

### Fase 1 — Hotfix imediato (desbloqueia a tela)
1. Adicionar `import { InvoiceTableRow } from "@/components/billing/InvoiceTableRow";` em `BillingInvoicesTab.tsx`.
2. Validar que `InvoiceTableRow` exporta named export (caso seja default, ajustar import).
3. Verificar visualmente em `/billing` (preview) que a tabela renderiza sem erro.

### Fase 2 — Auditoria do que foi alterado hoje
Listar e revisar arquivos do faturamento modificados nas últimas ~24h:
- `src/components/billing/*` (em especial: `BillingInvoicesTab`, `InvoiceTableRow`, `InvoiceActionsPopover`, `InvoiceInlineActions`, `BillingErrorsPanel`, `NfseAvulsaDialog`)
- `src/hooks/useInvoices.ts`, `useInvoiceActions.ts`, `useBillingCounters.ts`
- `src/lib/edgeFunctionError.ts` (criado nesta sessão)
- `supabase/functions/generate-monthly-invoices/index.ts` (hotfix Bortolini/Capasemu da sessão anterior — verificar se foi aplicado)

Para cada arquivo: checar imports faltando/quebrados, props incompatíveis, refs a símbolos removidos. Ferramenta: `rg` + leitura cirúrgica.

### Fase 3 — Teste E2E do fluxo (manual via browser tools + queries SQL)
Rodar cada cenário no preview, capturar console + network + estado no banco:

1. **Listagem de Faturas** (`/billing` tab Faturas)
   - Carregamento inicial, filtros (status, período, payment_method), busca textual, paginação.
2. **Filtro "Com erros"** (redirect deprecado `?tab=errors`)
   - Confirmar que invoices Bortolini/Capasemu aparecem corretamente classificadas.
3. **Criar fatura nova** (`?action=new`) — InvoiceForm submit.
4. **Ações por linha** (InvoiceInlineActions + Popover):
   - Baixar boleto / copiar código de barras / abrir PIX
   - Emitir NFS-e (EmitNfseDialog)
   - Reenviar notificação, registrar pagamento manual, 2ª via, renegociar, cancelar NFS-e
5. **NFS-e tab** — listagem, retry de erros, histórico.
6. **Conciliação bancária** — abrir tab, render sem erro.
7. **Saúde / Contas / Serviços / Códigos Tributários** — abrir cada tab, render sem erro.
8. **Counters** (`useBillingCounters`) — badges batem com queries diretas no banco.
9. **Edge Functions críticas** — chamar via `supabase--curl_edge_functions`:
   - `generate-monthly-invoices` (dry-run se houver flag)
   - `generate-invoice-payments`
   - `batch-collection-notification`
   - `manual-payment`, `generate-second-copy`, `renegotiate-invoice`
   - Verificar logs de cada uma após chamada.
10. **Estado dos boletos Bortolini + Capasemu** — confirmar via SQL que o hotfix da sessão anterior foi aplicado (boleto_status correto, sem erro residual).

### Entregáveis
- Relatório E2E: cenário → resultado (✅/❌) → causa raiz se falhar → correção aplicada.
- Lista consolidada de bugs encontrados, categorizados por severidade.
- Correções aplicadas em commits atômicos.
- Atualização do `CHANGELOG.md`.

## Detalhes técnicos
- Não vou rodar `npm run build`/`tsc` manualmente (harness faz automaticamente).
- Para testes que mutam dados (criar fatura, registrar pagamento), confirmar com você antes ou usar dados de teste descartáveis.
- Edge functions com webhook (Asaas, Banco Inter) **não** serão disparadas — apenas inspeção de código e logs históricos.
- Vou usar `supabase--read_query` para validar invariantes no banco (ex: nenhuma invoice com `boleto_status='erro'` e `boleto_url` preenchido simultaneamente).

## Riscos
- Algumas ações (registrar pagamento, cancelar NFS-e) são destrutivas — vou pular ou pedir confirmação explícita.
- O hotfix de `generate-monthly-invoices` da sessão anterior pode não ter sido aplicado; se não foi, vou propor reaplicar antes do E2E.

## Pergunta antes de começar
Posso executar ações **não destrutivas** no preview (abrir tabs, listar, baixar PDFs) sem pedir confirmação a cada passo? Para qualquer ação destrutiva (criar/editar/deletar registros, disparar emissões reais de NFS-e ou notificações) eu paro e pergunto.
