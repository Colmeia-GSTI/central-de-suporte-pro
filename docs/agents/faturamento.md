# Faturamento e Cobrança

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo maduro e amplamente vivo: rota /billing (BillingPage → BillingInvoicesTab) e /billing/delinquency estão ativas, com geração mensal por contrato (frequências, janela days_before_due, first_billing_month, dedup) sólida e cobrança via Asaas (padrão) + Banco Inter (legado, ainda referenciado como branch de provider). Estado granular boleto/nfse/email + máquina de estados invoice. Achados principais: a edge generate-invoice-payments está órfã (0 invoke, fora de cron/config.toml), e a lib billing-fsm.ts está quase inerte — 9 dos 11 exports só são consumidos pelo teste, a UI real usa apenas 2 helpers e calcula o resto inline. Vários exports de useInvoices (useInvoice, useInvalidateInvoices, InvoiceWithErrors) são mortos. Duplicação de lógica de multa/juros e de geração de pagamento em 3-4 lugares.

## Integrações

- Asaas (asaas-nfse): provider padrão de boleto/PIX/NFS-e (create_payment/emit/cancel_payment) — chamado por generate-monthly-invoices, useInvoiceActions, batch-process, second-copy, renegotiate, auto-retry
- Banco Inter (banco-inter + webhook-banco-inter): provider LEGADO, ainda referenciado como branch provider!=asaas em useInvoiceActions e BillingInvoicesTab.handleCancelBoleto
- Resend (send-email-resend): e-mails de fatura/cobrança
- Evolution API (send-whatsapp): cobrança WhatsApp
- poll-services: consulta status de pagamento (Verificar Pagamento / Forçar Polling)
- Supabase Storage (buckets invoice-documents/nfse-files): PDFs de boleto/NFS-e via signed URL (7 dias)
- pg_cron (não versionado no repo): generate-invoices-daily, notify-due-invoices-daily, auto-retry-failed-boletos (documentado em MAPA:95-102)

## Fluxos (rota → componente → hook → edge → tabela)

- /billing → BillingPage → BillingInvoicesTab → useInvoices → tabela invoices + view accounts_receivable (resumo) + nfse_history (badges)
- BillingInvoicesTab 'Gerar Faturas Mensais' → invoke generate-monthly-invoices → contracts(active,>0) → insert invoices → asaas-nfse(create_payment boleto/pix + emit nfse) → send-email-resend → invoice_notification_logs/notifications/invoice_generation_log/invoice_items
- cron generate-invoices-daily (11h) → generate-monthly-invoices (mesmo pipeline, sem role guard pois service role)
- InvoiceActionsPopover/InvoiceInlineActions → useInvoiceActions.handleGeneratePayment → asaas-nfse create_payment (ou banco-inter legado) → invoices.boleto_url/pix_code/boleto_status
- markAsPaid → useInvoiceActions.markAsPaidMutation → manual-payment → invoices.status=paid + financial_entries(receita) + audit_logs
- ManualPaymentDialog → manual-payment (valor/data/método, opcional emit nfse) → invoices + financial_entries
- SecondCopyDialog → calculate-invoice-penalties (multa/juros) + generate-second-copy → asaas-nfse create_payment(override value/due) → invoices.boleto_url/barcode + audit_logs
- RenegotiateInvoiceDialog → renegotiate-invoice → insert N invoices(parcelas, parent_invoice_id) + original status=renegotiated + asaas-nfse cancel_payment
- BillingInvoicesTab 'Faturar Agora' → useBatchProcessing → batch-process-invoices → (por fatura) asaas-nfse + resend-payment-notification → invoices status granulares
- DelinquencyReportPage → invoices(status=overdue)+clients → seleção → batch-collection-notification → send-email-resend/send-whatsapp → invoice_notification_logs
- cron auto-retry-failed-boletos (4x/dia) → invoices(boleto erro, sem asaas_payment_id) → asaas-nfse create_payment → invoices + audit_logs + notifications(3ª falha)
- cron notify-due-invoices (12h) → invoices pending a vencer → send-email-resend/whatsapp (não cobre overdue)
- webhook-banco-inter (legado) → boletos Inter antigos → invoices.status=paid
- poll-services (handleCheckPaymentStatus/handleForcePolling em useInvoiceActions) → consulta status boleto no provedor → invoices.status=paid

## Regras de negócio

- Dedup de fatura por contrato+reference_month, excluindo apenas 'cancelled' (fail-closed se erro) — generate-monthly-invoices/index.ts:314-324
- Gate de frequência: monthly=1,bimonthly=2,quarterly=3,semiannual=6,yearly=12 meses; pula se monthsSince<intervalo — index.ts:384-433
- Valor recorrente = monthly_value × intervalMonths para frequências >1 mês (charges adicionais não multiplicam) — index.ts:603-604
- Janela de geração antecipada: só gera se hoje >= vencimento − days_before_due (default 5) — index.ts:543-586
- first_billing_month: pula competências anteriores ao início de faturamento — index.ts:509
- Vencimento no passado avança a fatura para o mês seguinte (com novo dedup) — index.ts:449-506
- billing_day limitado ao último dia do mês (Math.min) — index.ts:441-442
- end_date guard: pula contrato 'active' com end_date no passado — index.ts:345-379
- Provider forçado a Asaas pós-migração 2026-05-07 (Inter só legado) — index.ts:731
- holdForNfse: retém e-mail para envio consolidado (boleto+nota) quando NFS-e é agendada — index.ts:836,930
- Multa 2% fixa + juros 1% a.m. pro-rata (dias/30) sobre amount — calculate-invoice-penalties/index.ts:70-73
- Mesma fórmula multa/juros duplicada na 2ª via — generate-second-copy/index.ts:94-96
- Renegociação só para status='overdue', 2-12 parcelas, cancela boleto Asaas original — renegotiate-invoice/index.ts:60,83,177
- Renegociação: número de parcela via MAX(invoice_number)+1 (race admitida em ponytail comment) — renegotiate-invoice/index.ts:106-115
- Baixa manual restrita a admin/financial; bloqueia paid/cancelled; grava paid_amount + financial_entries + audit — manual-payment/index.ts:55,109-121,144-170
- markAsPaid rápido usa invoice.amount como paid_amount (pagamento integral presumido) — useInvoiceActions.ts:565,46-56
- Cancelamento de fatura: cancela cobrança Asaas ANTES (fail-closed), sanitiza campos transitórios, audita, resolve nfse em erro — useInvoiceActions.ts:370-429
- Contador de vencidas = status='overdue' OU (pending com due_date<hoje) — useBillingCounters.ts:21
- Resumo 'Recebido' soma paid_amount (não amount) via view accounts_receivable, filtrado por paid_date no período — BillingInvoicesTab.tsx:197-222
- Auto-retry: boleto erro sem asaas_payment_id, created_at>30min, attempts<3; reagenda +3 dias úteis; alerta financeiro na 3ª falha — auto-retry-failed-boletos/index.ts:60-77,101-107,175-183
- Bloqueio de envio de notificação com artefatos incompletos (NFS-e sem pdf/xml, boleto em processamento) — resend-payment-notification/index.ts:104-144
- FSM de permissões (canMarkAsPaid/canCancelInvoice/canResendNotification etc.) por status — billing-fsm.ts:103-173
- Batch 'Faturar Agora' fixa boleto+nfse+email, sem pix/whatsapp — useBatchProcessing.ts:31-38
- 2ª via só para pending/overdue, novo vencimento hoje+5 dias — generate-second-copy/index.ts:76,119-122

## Arquivos-chave

- `src/pages/billing/BillingPage.tsx` — Shell de abas do Faturamento (Faturas/NFS-e/Conciliação/Fiscal/Saúde/Contas/Serviços/Códigos) + redirect de tabs deprecated e badges de contadores
- `src/pages/billing/DelinquencyReportPage.tsx` — Relatório de inadimplência: agrupa invoices overdue por cliente, aging, top5, export CSV e cobrança em lote
- `src/hooks/useInvoices.ts` — Hook centralizado de listagem de invoices (filtros/fields) + useInvoice(id) + useInvalidateInvoices _(uso: parcial)_
- `src/hooks/useInvoiceActions.ts` — Handlers de ação por fatura: gerar boleto/pix, markAsPaid (via manual-payment), cancelar, reenviar notificação, emitir completo, regerar, polling
- `src/hooks/useBatchProcessing.ts` — Mutation que dispara batch-process-invoices (boleto+nfse+email, sem pix/whatsapp)
- `src/hooks/useBillingCounters.ts` — Contadores agregados (vencidas, boletos processando, nfse pendente, erros) para badges
- `src/components/billing/hooks/useInvoiceFilters.ts` — Isola estado de filtros/paginação do BillingInvoicesTab (status/pm/período/datas)
- `src/lib/billing-fsm.ts` — FSM de fatura: computeInvoiceDerivedState + 8 helpers de permissão (canMarkAsPaid, canResendNotification...) + display _(uso: parcial)_
- `src/lib/currency.ts` — Formatação BRL (formatCurrency), parse e máscara de moeda
- `src/components/billing/BillingInvoicesTab.tsx` — Tela principal de faturas: lista/tabela+mobile, filtros, resumo global (accounts_receivable), ações em lote, gerar mensais, cancelar boleto/nfse
- `src/components/billing/InvoiceActionsPopover.tsx` — Menu dropdown de ações por fatura (gerar/pagar/renegociar/2ª via/nfse/cancelar)
- `src/components/billing/InvoiceInlineActions.tsx` — Botões inline rápidos (boleto/nfse/email/pagamento) na linha da fatura
- `src/components/billing/InvoiceTableRow.tsx` — Linha da tabela de fatura (desktop) com slots de ações
- `src/components/billing/StatusBadges.tsx` — Badges unificados: InvoiceStatusBadge/BoletoStatusBadge/NfseStatusBadge/EmailStatusBadge/ContractStatusBadge
- `src/components/billing/InvoiceStatusFilter.tsx` — Select reutilizável de filtro de status (8 opções + limpar)
- `src/components/billing/ManualPaymentDialog.tsx` — Diálogo de baixa manual (valor/data/método) → manual-payment
- `src/components/billing/SecondCopyDialog.tsx` — 2ª via: calcula multa/juros e gera novo boleto → calculate-invoice-penalties + generate-second-copy
- `src/components/billing/RenegotiateInvoiceDialog.tsx` — Renegociação em N parcelas → renegotiate-invoice
- `src/components/billing/RegenerateBoletoDialog.tsx` — Regerar boleto (atualiza cadastro CNPJ/endereço) via asaas
- `src/components/billing/CancelInvoiceAlertDialog.tsx` — Confirmação de cancelamento de fatura com motivo obrigatório
- `src/components/billing/EditInvoiceDialog.tsx` — Editar vencimento/valor da fatura pending/overdue
- `src/components/billing/NewInvoiceDialog.tsx` — Wrapper de diálogo para InvoiceForm (nova fatura avulsa)
- `src/components/billing/InvoiceForm.tsx` — Formulário Zod de criação de fatura avulsa
- `src/components/billing/PixCodeDialog.tsx` — Exibe PIX copia-e-cola/QR
- `src/components/billing/InvoiceProcessingHistory.tsx` — Sheet com histórico de processamento/logs da fatura
- `src/components/billing/InvoiceNotificationHistory.tsx` — Histórico de notificações (email/whatsapp) da fatura
- `src/components/billing/BankReconciliationTab.tsx` — Aba de conciliação bancária (tangencial ao módulo invoices)
- `src/components/billing/AgingReportWidget.tsx` — Widget de aging de recebíveis (tangencial)
- `src/components/billing/IntegrationHealthDashboard.tsx` — Painel de saúde das integrações de cobrança
- `supabase/functions/generate-monthly-invoices/index.ts` — Geração mensal por contrato: dedup, end_date/frequência/janela/first_billing_month, cria invoice + asaas (boleto/pix) + NFS-e + email + retry NFS-e
- `supabase/functions/generate-monthly-invoices/logic.ts` — Núcleo puro/testável (validate + decisão skip/insert) espelhando o index para Vitest
- `supabase/functions/generate-invoice-payments/index.ts` — Gera boleto/pix para faturas pending sem pagamento (batch/single) — sem auth, default provider banco_inter _(uso: nao)_
- `supabase/functions/batch-process-invoices/index.ts` — Processa lote de faturas (boleto/pix/nfse/email) sequencialmente com role guard e Zod
- `supabase/functions/batch-collection-notification/index.ts` — Cobrança em lote (reminder/urgent/final) por email/whatsapp
- `supabase/functions/calculate-invoice-penalties/index.ts` — Calcula multa (2%) + juros (1% a.m. pro-rata) para faturas overdue; dry_run opcional
- `supabase/functions/auto-retry-failed-boletos/index.ts` — Cron: retenta boletos com erro (sem asaas_payment_id, >30min, attempts<3), reagenda +3 dias úteis, alerta na 3ª falha
- `supabase/functions/notify-due-invoices/index.ts` — Cron: lembrete de faturas a vencer (email/whatsapp), com dedup — cobre só pending, não overdue
- `supabase/functions/notify-due-invoices/logic.ts` — Núcleo puro/testável do fluxo de lembrete (validate + dedup + email)
- `supabase/functions/manual-payment/index.ts` — Baixa manual: marca paid + paid_amount, cria financial_entries + audit, opcional NFS-e; role admin/financial
- `supabase/functions/renegotiate-invoice/index.ts` — Renegocia fatura overdue em 2-12 parcelas, marca original renegotiated, cancela boleto Asaas
- `supabase/functions/generate-second-copy/index.ts` — 2ª via de boleto para pending/overdue com multa/juros e novo vencimento (+5d) via asaas/inter
- `supabase/functions/resend-payment-notification/index.ts` — Reenvia cobrança (email/whatsapp) com bloqueio de artefatos incompletos (nfse/boleto), signed URLs
- `supabase/functions/banco-inter/index.ts` — Integração legada Banco Inter (mTLS): gera/cancela boleto/pix — provider legado _(uso: parcial)_
- `supabase/functions/webhook-banco-inter/index.ts` — Webhook legado do Banco Inter (confirma pagamento de boletos Inter antigos) _(uso: parcial)_

## Pontos de atenção / riscos

- Duplicação de regra de multa/juros (2% + 1% a.m.) em calculate-invoice-penalties e generate-second-copy — fonte de verdade única faltando (candidato a src/lib).
- Duplicação de lógica de geração de pagamento em 3-4 pontos: generate-monthly-invoices (inline), generate-invoice-payments (morta), useInvoiceActions.handleEmitComplete e batch-process-invoices.
- batch-process-invoices sem idempotência: reprocessar as mesmas faturas pode duplicar cobrança no Asaas (não checa asaas_payment_id existente antes de create_payment).
- renegotiate-invoice usa MAX(invoice_number)+1 — race sob concorrência gera invoice_number duplicado (ponytail comment já reconhece; upgrade = sequence no banco).
- Falta de checagem de role em batch-collection-notification, notify-due-invoices e generate-invoice-payments; batch-collection é chamada do frontend com token do usuário mas não re-valida papel na edge.
- webhook-banco-inter ausente do config.toml → verify_jwt=true bloquearia o callback do banco (impacto limitado a boletos Inter legados ainda abertos).
- Branch de provider 'banco_inter' morto no frontend: UI força Asaas (InvoiceActionsPopover gera sempre asaas), mas handleGeneratePayment/handleCancelBoleto ainda carregam o caminho Inter.
- markAsPaidMutation assume pagamento integral (paid_amount=amount); pagamento parcial exige 'Baixa Manual' — risco de baixa incorreta se operador usar 'Marcar como Pago (rápido)' num pagamento parcial.
- Leituras mortas de status 'processando' no boleto_status (enum não possui) em useInvoiceActions:142, resend-payment-notification e batch-process-invoices — inofensivas, candidatas a limpeza.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `generate-invoice-payments (edge function)` (supabase/functions/generate-invoice-payments/index.ts) — Órfã: nenhum invoke no frontend/edges, fora do config.toml e da tabela de cron. Superseda por generate-monthly-invoices (geração inline) + batch-process-invoices
- `useInvoice(id)` (src/hooks/useInvoices.ts:183) — Hook de fatura única exportado mas sem nenhum caller
- `useInvalidateInvoices` (src/hooks/useInvoices.ts:212) — Helper de invalidação sem callers; BillingInvoicesTab e useInvoiceActions duplicam invalidateQueries inline
- `InvoiceWithErrors` (src/hooks/useInvoices.ts:55) — Type export sem importadores (era do BillingErrorsPanel removido/consolidado)
- `computeInvoiceDerivedState / getDerivedStateDisplay` (src/lib/billing-fsm.ts:67,198) — Só consumidos pelo próprio teste; a UI não deriva estado via FSM (usa StatusBadges + inline)
- `canResendNotification / canRegenerateBoleto / canEmitNfse / canCancelInvoice / canForcePolling` (src/lib/billing-fsm.ts:114-172) — 5 helpers de permissão só usados no teste; InvoiceActionsPopover só importa canCancelBoleto e canMarkAsPaid e calcula o resto inline (isPendingOrOverdue etc.)
- `boleto_status === 'processando' (leitura morta)` (src/hooks/useInvoiceActions.ts:142) — Enum boleto_processing_status = pendente|gerado|enviado|erro; 'processando' nunca ocorre (checkArtifactReadiness). Mesma leitura morta em resend-payment-notification e batch-process-invoices

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA §3 (linha 312) lista generate-invoice-payments como edge ATIVA do módulo; na prática está órfã (0 invoke, fora de config.toml e da tabela de cron 95-102). MAPA:324 só a cita como 'duplicação de lógica', não como morta.
- MAPA:323/1449 afirma que billing-fsm.ts está 'alinhada' e resta só limpeza de leituras mortas; NÃO registra que 9 dos 11 exports da FSM (computeInvoiceDerivedState, getDerivedStateDisplay, canResendNotification, canRegenerateBoleto, canEmitNfse, canCancelInvoice, canForcePolling) só são consumidos pelo teste — a UI usa apenas canCancelBoleto+canMarkAsPaid. A investida de centralização está praticamente inerte.
- MAPA não registra os exports mortos de useInvoices.ts (useInvoice, useInvalidateInvoices, InvoiceWithErrors); além disso useInvoiceActions/BillingInvoicesTab duplicam invalidateQueries inline em vez de usar useInvalidateInvoices.
- MAPA:1407 conta 'Faturamento e Cobrança (12)' incluindo admin-cancel-asaas-payment (fora do escopo passado) e generate-invoice-payments (órfã) — a contagem não reflete o que está efetivamente cablado.
- MAPA lista os edges do módulo (312) sem banco-inter/webhook-banco-inter (classificados noutra seção como 'Pagamento externo'), mas banco-inter continua sendo invocado a partir do código do módulo (useInvoiceActions:86,238,259; BillingInvoicesTab:354,886) como branch de provider legado — a fronteira do módulo no MAPA está desatualizada.
- CONVERGE (confirmação, não divergência): MAPA:1073/1086/1429 já registra webhook-banco-inter fora do config.toml (verify_jwt=true) — confirmado ausente de config.toml.
- CONVERGE: MAPA:331 (renegotiate MAX+1 race), :332 (DelinquencyReport ignora fine/interest → subestima Total Vencido, confirmado em DelinquencyReportPage:154 soma só amount), :334 (batch-process-invoices sem idempotência) e :330 (notify-due-invoices não cobre overdue) — todos confirmados no código.

