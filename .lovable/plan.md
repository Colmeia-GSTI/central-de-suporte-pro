

# Diagnóstico: Por que o boleto da CVR não atualizou automaticamente

## Evidências encontradas

### 1. Webhook do Banco Inter NUNCA foi acionado
- A tabela `webhook_events` com `webhook_source = 'banco_inter'` está **completamente vazia** (0 registros)
- A tabela `audit_logs` não tem **nenhum** registro com action `WEBHOOK_BANCO_INTER` ou `WEBHOOK_PAYMENT_CONFIRMED` vindo de webhook
- **Todos** os pagamentos confirmados (faturas #57, #58, #60) foram detectados exclusivamente via `POLLING_PAYMENT_CONFIRMED` (poll-services)
- O log do edge function `webhook-banco-inter` mostra apenas `shutdown` — nunca recebeu uma requisição real

**Conclusão: O webhook do Banco Inter não está funcionando. Nenhum pagamento jamais foi detectado via webhook neste projeto.**

### 2. O CRON de polling não inclui `boleto_payments`
O CRON job `poll-services-6h` envia o body:
```json
{"services": ["boleto", "nfse"]}
```
Ele **não inclui** `"boleto_payments"` na lista de serviços. O código do `poll-services` usa como default `["boleto", "asaas_nfse", "boleto_payments"]` quando nenhum `services` é passado, mas o CRON **explicitamente** passa apenas `["boleto", "nfse"]`.

Isso significa que a rotina automática de 6h **nunca verifica se boletos foram pagos**. Apenas verifica status de boletos pendentes (sem código de barras) e NFS-e.

### 3. Timeline da Fatura #58 (CVR)
| Evento | Data |
|---|---|
| Pagamento real no banco | 2026-03-09 |
| Detecção pelo sistema | 2026-03-11 07:22:18 (hoje, via polling manual) |
| Atraso | ~2 dias |

## Causas-raiz

1. **Webhook inoperante**: O Banco Inter nunca enviou (ou o sistema nunca recebeu) notificações de webhook. Possíveis razões: webhook não cadastrado corretamente, URL incorreta, ou secret `WEBHOOK_SECRET_BANCO_INTER` não configurado
2. **CRON sem polling de pagamentos**: O job de polling a cada 6h não inclui o serviço `boleto_payments`, então nunca verifica pagamentos automaticamente

## Plano de Correção

### Correção 1: Atualizar CRON para incluir `boleto_payments`
Executar SQL para atualizar o CRON existente adicionando `boleto_payments` aos serviços e reduzindo o intervalo de 6h para 2h:

```sql
SELECT cron.unschedule('poll-services-6h');

SELECT cron.schedule(
  'poll-services-2h',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url := '...poll-services',
    body := '{"services": ["boleto", "boleto_payments", "asaas_nfse