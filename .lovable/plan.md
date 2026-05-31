# Validação do fluxo de reajuste — diagnóstico e correções

## ✅ O que JÁ funciona corretamente

### 1. Persistência do novo valor nos próximos meses
A função `apply-contract-adjustment` faz, em transação lógica:
- Atualiza `contracts.monthly_value` para o novo valor
- Atualiza proporcionalmente todos os `contract_services` (unit_value e value)
- Registra histórico em `contract_adjustments` e `contract_history`
- Define `contracts.adjustment_date = hoje + 1 ano`

A função `generate-monthly-invoices` (cron 11h) lê **sempre** `contracts.monthly_value × intervalMonths`. Ou seja, no caso do **Gayger** (R$ 50/mês, trimestral):
- Hoje → fatura = 50 × 3 = R$ 150
- Após reajuste de 10% → `monthly_value` vira R$ 55 → próxima fatura = 55 × 3 = **R$ 165**

✅ **Confirmado: o reajuste vale automaticamente para todos os meses seguintes, inclusive em ciclos trimestrais/semestrais/anuais.**

### 2. Cron diário de verificação existe
Job `check-adjustments-daily` roda todo dia às **10h UTC** e chama `check-contract-adjustments`, que:
- Se índice = `FIXO` → aplica automaticamente via `apply-contract-adjustment`
- Se índice = `IGPM/IPCA/INPC` → cria notificação no sino para admin + financeiro

---

## ⚠️ Problemas encontrados (precisam ser corrigidos)

### Problema 1 — Muitos contratos sem `adjustment_date`
Levantamento atual: **26 de 38 contratos ativos** estão com `adjustment_date = NULL`, incluindo o **Gayger**.
Impacto: o cron `check-contract-adjustments` filtra `WHERE adjustment_date = today`, então esses contratos **nunca disparam aviso de reajuste anual**.

### Problema 2 — Notificação só dispara no dia exato
A função só notifica `adjustment_date = hoje`. Se o cron falhar num dia, ou se o financeiro estiver de férias, o aviso é perdido. Não há lembrete antecipado.

### Problema 3 — Sem aviso prévio
O financeiro precisa de tempo para apurar o índice acumulado (IGPM/IPCA dos últimos 12m) **antes** do vencimento. Hoje o sistema avisa só no dia D.

---

## 🛠️ O que vou fazer

### A) Migration: preencher `adjustment_date` dos contratos legados
Para todos os contratos ativos sem `adjustment_date`:
- Se houver `start_date` → `adjustment_date = start_date + 1 ano` (ajustando se já passou, soma anos até cair no futuro)
- Caso contrário → `adjustment_date = hoje + 1 ano`

Resultado esperado: Gayger e os outros 25 contratos passam a entrar no cron de verificação.

### B) Melhorar `check-contract-adjustments` (lembretes antecipados)
Adicionar notificações progressivas:
- **D-30** → notificação `info`: "Contrato X terá reajuste anual em 30 dias (índice IGPM). Apure o acumulado."
- **D-7** → notificação `warning`: "Contrato X tem reajuste em 7 dias."
- **D-0** → comportamento atual (auto-aplica FIXO ou notifica `warning` para revisão manual).
- **D+1 até D+30** → se ainda não foi aplicado, notificação `warning` diária com link direto para o card de reajuste (evita esquecimento).

Idempotência: gravar uma flag/última data notificada em `contract_history` (`action='adjustment_reminder'`) para não duplicar no mesmo dia.

### C) Default no cadastro de contrato
Em `ContractForm.tsx` (criação): se `adjustment_date` ficar vazio, calcular automaticamente `start_date + 1 ano` ao salvar (proteção para novos contratos).

### D) Indicador visual no `ContractAdjustmentCard`
O card já mostra "Próximo em X meses". Vou adicionar:
- Badge **âmbar** quando faltar ≤ 30 dias ("Reajuste em breve")
- Badge **vermelho** quando `adjustment_date ≤ hoje` ("Reajuste vencido — aplicar agora")

---

## Resumo da entrega

1. Migration para corrigir os 26 contratos sem data
2. Edge function `check-contract-adjustments` ampliada (D-30, D-7, D-0, vencidos)
3. Default automático ao criar contrato novo
4. Badges de urgência no card de reajuste
5. Atualização do `CHANGELOG.md`

**Não muda:** schema das tabelas, lógica do `generate-monthly-invoices`, integração Asaas, valores existentes. Só preenche datas faltantes e amplia a régua de notificação.
