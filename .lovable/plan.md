
## Reconciliação completa de cobranças no Asaas

Objetivo: confirmar que não há cobranças duplicadas e que todo `asaas_payment_id` antigo registrado em `audit_logs` foi de fato cancelado no Asaas.

### Etapas (somente leitura no banco; só cancela no Asaas após sua confirmação)

1. **Levantar o universo de clientes ativos** com `asaas_customer_id` definido.

2. **Para cada cliente, consultar `GET /payments?customer={id}&limit=100`** na API do Asaas (já configurada) e listar todas as cobranças `status IN (PENDING, OVERDUE, AWAITING_RISK_ANALYSIS)`.

3. **Cruzar com `public.invoices`**:
   - Marcar como **órfã no Asaas** qualquer payment do Asaas que **não** corresponda ao `asaas_payment_id` atual de nenhuma fatura local desse cliente.
   - Marcar como **duplicata** quando 2+ payments ativos no Asaas apontam para a mesma `externalReference` ou o mesmo valor/vencimento de uma fatura local.

4. **Cruzar com `audit_logs`** (`boleto_regenerated`, `boleto_auto_regenerated`, `asaas_payment_auto_cancelled`): para cada `old_asaas_payment_id` registrado, fazer `GET /payments/{id}` e confirmar `deleted=true` ou status `DELETED`. Listar os que ainda estão ativos.

5. **Relatório CSV** em `/mnt/documents/asaas-reconciliation-YYYYMMDD.csv` com colunas: `client_name`, `client_document`, `asaas_payment_id`, `valor`, `vencimento`, `status_asaas`, `classificacao` (orfa / duplicata / regenerado_nao_cancelado / ok), `invoice_id_local` (se houver), `acao_sugerida`.

6. **Apresentar resumo no chat** (totais por classificação) **antes** de qualquer cancelamento. Nenhum `DELETE` no Asaas será executado nesta primeira passada.

7. **Após você revisar e aprovar**, executar segundo passo (fora deste plano) que itera o CSV e chama `DELETE /payments/{id}` apenas para os marcados como duplicata/órfã/regenerado_nao_cancelado, registrando cada cancelamento em `audit_logs` como `asaas_payment_reconciliation_cancelled`.

### Implementação técnica

- Script Deno standalone executado uma vez como tarefa de manutenção (não fica como edge function permanente).
- Lê `ASAAS_API_KEY` e `ASAAS_BASE_URL` direto dos secrets já existentes.
- Usa `PG*` da sandbox para leitura do banco. Nenhuma migration, nenhum schema novo.
- Rate limit: 1 requisição a cada 250 ms para respeitar a API do Asaas.

### Arquivos gerados

- `/mnt/documents/asaas-reconciliation-YYYYMMDD.csv` (relatório)
- `/mnt/documents/asaas-reconciliation-YYYYMMDD.log` (trace de chamadas)

Nenhum arquivo do projeto será alterado.
