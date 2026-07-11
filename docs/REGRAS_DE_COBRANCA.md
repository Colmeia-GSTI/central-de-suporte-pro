# Regras de Cobrança Recorrente, Boleto e NFS-e

> Fonte canônica das regras de negócio do ciclo de cobrança. Validada contra o
> sistema em 2026-07-10 (ver §Verificação). Implementação: `generate-monthly-invoices`
> (cron diário 11:00 UTC), `asaas-nfse`, `webhook-asaas-nfse`, `manual-payment`.
> Complementa `docs/MAPA_DE_SETORES.md` §3.5/§3.6.

## R1 — Recorrência gera fatura interna

Todo contrato **ativo** com `monthly_value > 0` gera **uma fatura interna por ciclo**
(`invoices`, competência = `reference_month`).

- **Vencimento**: dia `contracts.billing_day` (default 10), limitado ao último dia do mês.
- **Janela de geração**: a fatura nasce `days_before_due` dias antes do vencimento
  (default 5) — não antes. O cron roda diariamente; é normal um contrato com
  `billing_day` 21/25 não ter fatura no início do mês.
- **Competência inicial**: `first_billing_month`; se o vencimento do mês já passou na
  criação do contrato, a competência avança para o mês seguinte.
- **Unicidade**: no máximo **uma fatura não-cancelada por contrato+competência** —
  garantia dura pelo índice `idx_invoices_contract_month_unique` (exclui só `cancelled`).

## R2 — Fatura conforme os produtos contratados

- Valor = `monthly_value × intervalo da frequência` + adicionais aplicados
  (`contract_additional_charges`, marcados `applied` com `applied_invoice_id`).
- Itens da fatura (`invoice_items`) espelham `contract_services`.
- Ajuste manual de valor exige motivo e é auditado (`audit_logs.invoice_value_adjusted`);
  se houver NFS-e autorizada, dispara cancelamento+reemissão da nota com o novo valor.

## R3/R4 — Um boleto por fatura, com as opções do Asaas

- **Um único payment Asaas por fatura** (`invoices.asaas_payment_id`), criado na mesma
  execução da geração via action `create_payment` (idempotente: reusa o payment
  existente; só regenera com evidência de drift — payment deletado, CNPJ divergente,
  valor sobrescrito — deletando o antigo no Asaas ANTES de criar o novo).
- **Formas de pagamento conforme `contracts.payment_preference`**:
  - `boleto` → boleto Asaas (a fatura Asaas já embute QR PIX do próprio boleto);
  - `pix` → cobrança PIX (`pix_code`);
  - `both` → boleto + PIX na mesma cobrança (nunca duas cobranças).
- Edição de vencimento/valor segue as regras do Asaas (ex.: vencimento no passado é
  recusado — bloqueado na UI). Multa 2% + juros 1% a.m. nativos do payment.
- **Pagamento fora do boleto** (PIX direto, depósito/transferência): não existe
  preferência "depósito" — a baixa é **manual** (`manual-payment`), registrando
  `payment_method` (`deposito`, `pix_manual`, ...) e cancelando a cobrança em aberto
  no Asaas quando aplicável.

## R5 — Uma NFS-e por fatura, dos serviços contratados

- **Política**: NFS-e emitida **na geração da fatura** quando `contracts.nfse_enabled`
  (com `nfse_aliquota > 0`); o auto-emit do webhook de pagamento é apenas **fallback**
  quando nenhuma nota existe. Descrição = `nfse_descricao_customizada` ou os serviços
  do contrato.
- **NFS-e opcional por cliente**: `nfse_enabled=false` ⇒ o fluxo automático NÃO emite;
  emissão manual (UI) continua possível caso o cliente peça.
- **Unicidade**: no máximo **uma nota viva** (`autorizada|processando|pendente`,
  `is_active`) por fatura — guarda idempotente na action `emit` do `asaas-nfse`
  (bypasses: `nfse_history_id` p/ reemissão, `force_new_emission` p/ substituição)
  + índice único `uq_nfse_history_active_per_invoice`.
- E-mail consolidado: com NFS-e habilitada, o e-mail do boleto é retido
  (`email_status='aguardando_nfse'`) e sai um único e-mail boleto+nota na autorização.

## R6 — Frequências e datas alternadas

- `contracts.billing_frequency`: `monthly` (default), `bimonthly`, `quarterly`,
  `semiannual`, `yearly`.
- Contrato não-mensal: fatura só quando `meses desde a última fatura ≥ intervalo`;
  valor = `monthly_value × intervalo` (ex.: trimestral cobra 3× a cada 3 meses).
- "Datas alternadas" = combinação de `billing_day` + `first_billing_month` +
  `billing_frequency` por contrato. Não existe agenda global; cada contrato carrega
  suas próprias datas.

## R7 — Ajustes são respeitados em todo o ciclo

**Reajuste contratual** (`contract_adjustments`, cron `check-adjustments-daily` 10:00 UTC):
- Lembretes em D-30/D-7/D-0 e diários até D+30 (idempotentes via `contract_history`).
- Índice `FIXO` com percentual: **auto-aplica no D-0** via `apply-contract-adjustment`;
  IGPM/IPCA/INPC: aplicação **manual** (aba Reajuste do contrato).
- A aplicação atualiza `contracts.monthly_value`, reajusta `contract_services`
  proporcionalmente, avança `adjustment_date` +1 ano e audita em
  `contract_adjustments` + `contract_history`.
- **Propagação**: o gerador lê `monthly_value` ao vivo → a fatura seguinte (e o boleto
  e a NFS-e dela) já sai com o novo valor; trimestrais saem 3× o novo valor. O cron de
  reajuste (10:00 UTC) roda ANTES da geração (11:00 UTC) — reajuste do dia entra na
  fatura do próprio dia. Fatura já gerada antes da aplicação mantém o valor antigo
  (comportamento esperado; vale a partir da competência seguinte).

**Ajuste de valor/vencimento de fatura** (`EditInvoiceDialog`):
- Exige motivo (≥10 chars), audita (`invoice_value_adjusted`), bloqueia vencimento no
  passado quando há boleto.
- **Propaga ao boleto**: `regenerate_payment` (cancela o antigo no Asaas) +
  `create_payment` (novo boleto com valor/vencimento novos).
- **Propaga à NFS-e** (opcional): `cancel_and_reissue_nfse` reemite a nota autorizada
  com o novo valor (sujeito à janela de cancelamento da prefeitura).

Ressalvas conhecidas (2026-07-10):
- A regeneração do boleto é **não-atômica**: se o `create_payment` falhar após o
  cancelamento do antigo, a fatura fica `boleto_status='pendente'` sem cobrança — e o
  `auto-retry-failed-boletos` NÃO a recupera (só olha `'erro'`). Foi o que deixou a
  fatura #663 sem boleto. Correção sugerida: incluir `pendente` sem `asaas_payment_id`
  no filtro do auto-retry.
- Lembretes de reajuste param em D+30 — reajuste esquecido além disso fica silencioso
  (hoje: 0 contratos nessa condição; todos os 35 têm data futura).
- `apply-contract-adjustment` não arredonda (ruído de float no histórico; o valor do
  contrato arredonda pela coluna) e não tem trava contra dupla aplicação manual.

## Verificação (executada em 2026-07-10)

| Regra | Resultado |
|---|---|
| R1 cobertura mensal mai–jul | ✅ sem faltas reais (ausências explicadas pela janela/avanço de competência) |
| R1 unicidade fatura | ✅ 0 duplicatas por contrato+competência |
| R2 valores de julho | ✅ 0 divergências (mensais = `monthly_value`; trimestrais = 3×) |
| R3/R4 boleto único + opções | ✅ 0 `asaas_payment_id` duplicado; abertas com boleto/pix conforme preferência; 2 legados Inter (pagos) |
| R5 nota única | ✅ guarda + índice (corrigido em 2026-07-10; 49 duplicatas históricas remediadas) |
| R5 nota opcional | ✅ automático respeita `nfse_enabled`; notas de contrato desabilitado foram manuais |
| R6 frequência trimestral | ❌ **BUG (corrigido em 2026-07-10)**: filtro `status not in ("cancelled","voided")` inválido — `voided` não existe no enum `invoice_status` → o erro 22P02 era engolido e o dedup + gate de frequência ficavam cegos; trimestrais cobrados todo mês (faturas #662/#785 indevidas) e ~19 re-INSERTs/dia bloqueados só pelo índice |

### Pendências conhecidas (2026-07-10)
- Normalizar `payment_method` (`boleto`/`BOLETO`, `PIX`/`pix_manual`) — cosmético/relatórios.
- Fatura #663 (Topomen) vencida sem boleto gerado (pós-ajuste de valor) — decisão do
  usuário em 2026-07-10: NÃO regenerar (cliente tende a pagar por depósito/baixa manual).

### Remediação de 2026-07-10 (bug do gate de frequência)
Faturas indevidas #662 (Gayger, R$ 150) e #785 (Juremir, R$ 75) de jul/2026 — trimestre
já coberto pela fatura de jun — canceladas por completo: NFS-e (315 e 344) canceladas,
boletos deletados no Asaas (`asaas_payment_cancelled`) e faturas `cancelled`
(`audit_logs.invoice_cancelled`). Nenhuma havia sido paga. Próximo ciclo correto: 2026-09.
