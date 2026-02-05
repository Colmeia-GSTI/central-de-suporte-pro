
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

## Fase 3: Melhorias Operacionais (PRÓXIMA)

Da seção 9 do REVIEW (itens 16-21):

| # | Item | Descrição | Prioridade |
|---|------|-----------|------------|
| 1 | Dashboard de conciliação bancária | Comparar extratos vs faturas | Alta |
| 2 | Relatório de aging de recebíveis | Classificar faturas por faixas de atraso | Alta |
| 3 | Busca automática de índices IGPM/IPCA | Integrar com API do Banco Central | Alta |
| 4 | Emissão automática de NFS-e vinculada ao pagamento | Emitir quando fatura é paga | Alta |
| 5 | Baixa manual de pagamento | Registrar pagamento manual com comprovante | Alta |
| 6 | Multa e juros automáticos | Calcular 2% multa + 1% a.m. juros | Alta |
| 7 | Retry automático para falhas de pagamento | Sistema com backoff | Alta |

---

## Fase 4: Novas Funcionalidades (FUTURO)

Items 22-28 do REVIEW: Portal do cliente, segunda via de boleto, parcelamento, régua de cobrança configurável, CNAB 240/400, dashboard de contratos por vencer, relatório fiscal mensal.
