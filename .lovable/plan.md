
# Plano de Ação - Sistema de Cobrança

Baseado no documento REVIEW_SISTEMA_COBRANCA.md

---

## ✅ Fase 1: Correções Críticas (CONCLUÍDA)

1. ✅ Fix build error (import esm.sh → npm:)
2. ✅ Preencher `payment_method` na geração de faturas
3. ✅ Incluir `contract_services` na geração de `invoice_items`
4. ✅ Recriar índices críticos removidos
5. ✅ Corrigir webhook para atualizar faturas "overdue"
6. ✅ Corrigir campo `mensagem_retorno` no webhook
7. ✅ Remover FK bidirecional invoice-nfse (`nfse_history_id`)
8. ✅ Verificação de duplicatas mais robusta (`cancelled` + `voided`)
9. ✅ Migração de todas as 42 edge functions de esm.sh → npm:

---

## ✅ Fase 2: Integridade de Dados (CONCLUÍDA)

1. ✅ Máquina de estados para faturas (trigger `validate_invoice_status_transition`)
   - Transições válidas: pending→[paid,overdue,cancelled], overdue→[paid,cancelled], paid→[cancelled]
2. ✅ Idempotência em webhooks (tabela `webhook_events` com UNIQUE constraint)
   - Implementado em `webhook-asaas-nfse` e `webhook-banco-inter`
3. ✅ Prevenção de notificações duplicadas (tabela `invoice_notification_logs`)
   - Implementado em `notify-due-invoices` com dedup por invoice+type+channel
4. ⏳ Retry com backoff para pagamentos — adiado para Fase 3 (generate-invoice-payments já tem error handling)

---

## ✅ Fase 3: Melhorias Operacionais (CONCLUÍDA)

1. ✅ Dashboard de conciliação bancária
   - Nova aba "Conciliação" no BillingPage
   - Tabela `bank_reconciliation` com status (pending/matched/unmatched/ignored)
   - Cards de métricas: pendentes, conciliados, não conciliados, taxa de conciliação
2. ✅ Relatório de aging de recebíveis
   - Widget `AgingReportWidget` com faixas 1-15, 16-30, 31-60, 61-90, 90+ dias
   - Barras visuais com proporção de valores e contagem
3. ✅ Busca automática de índices IGPM/IPCA/INPC
   - Edge function `fetch-economic-indices` integrada com API do Banco Central (SGS)
   - Tabela `economic_indices` com acumulado 12 meses
   - Widget `EconomicIndicesWidget` na aba Conciliação
4. ✅ Emissão automática de NFS-e vinculada ao pagamento
   - Webhook `webhook-asaas-nfse` auto-emite NFS-e quando fatura é paga
   - Verifica `nfse_service_code` no contrato antes de emitir
   - Campo `auto_nfse_emitted` para controle de duplicidade
5. ✅ Baixa manual de pagamento
   - Edge function `manual-payment` com autenticação
   - Dialog `ManualPaymentDialog` com valor, data, método, observações
   - Opção de emitir NFS-e junto com o pagamento
   - Cria `financial_entry` e `audit_log` automaticamente
6. ✅ Multa e juros automáticos
   - Edge function `calculate-invoice-penalties` (2% multa + 1% a.m. juros pro-rata)
   - Campos `fine_amount`, `interest_amount`, `total_with_penalties` (GENERATED) na tabela invoices
   - Função SQL `calculate_penalties()` para cálculos ad-hoc
   - Suporte a dry_run para simulação

---

## Fase 4: Novas Funcionalidades (FUTURO)

Items 22-28 do REVIEW: Portal do cliente, segunda via de boleto, parcelamento, régua de cobrança configurável, CNAB 240/400, dashboard de contratos por vencer, relatório fiscal mensal.
