
# Plano — Cenário A (Renegociação/Upgrade do contrato AIRDUTO)

## Contexto
Reajuste de R$ 1.500 → R$ 2.300 foi uma **renegociação/upgrade de escopo**, não reajuste anual de índice. A próxima fatura (vencimento 10/06, R$ 2.300, Asaas, NFS-e 010701/6%) já vai sair correta amanhã 31/05 às 11h pelo cron — nada a corrigir no fluxo de geração.

## O que vou fazer (build mode)

### 1. Registrar o motivo no histórico do contrato
Inserir uma linha em `contract_history` do contrato AIRDUTO com:
- `action`: `renegotiation`
- `comment`: "Renegociação de escopo — valor mensal ajustado de R$ 1.500,00 para R$ 2.300,00 com inclusão/ajuste de serviços."
- `changes`: `{ "type": "renegotiation", "old_value": 1500, "new_value": 2300 }`

Assim a auditoria deixa de ser só "alteração genérica" e fica explícito que foi renegociação.

### 2. Definir próxima data de reajuste anual
Setar `contracts.adjustment_date` = **2027-05-30** (1 ano a partir de hoje) para que o cron `check-adjustments-daily` passe a monitorar este contrato no próximo ciclo anual com o índice atual (IGPM).

### 3. Melhoria preventiva no formulário de edição
Adicionar um **alerta visual amarelo** no `ContractForm.tsx` que aparece quando o usuário muda o `monthly_value` de um contrato existente:

> ⚠️ Você está alterando o valor mensal direto. Se for um **reajuste anual de índice** (IGPM/IPCA), prefira usar o botão **"Aplicar Reajuste"** na página do contrato — ele registra o histórico, atualiza os serviços proporcionalmente e agenda o próximo ciclo automaticamente.
>
> Para **renegociação/upgrade**, pode continuar editando direto.

Isso previne que no futuro o reajuste anual seja feito errado de novo.

### 4. Validação amanhã (31/05)
Após as 11h vou consultar o banco e confirmar:
- Fatura nova criada para AIRDUTO, competência 2026-06, valor R$ 2.300, provedor Asaas
- `asaas_payment_id` preenchido (boleto/PIX gerado no Asaas)
- NFS-e agendada (`nfse_status`)
- Reporto o resultado aqui

## O que NÃO vou fazer
- ❌ Não inserir em `contract_adjustments` (esse é o histórico de reajustes de índice — não se aplica)
- ❌ Não disparar notificação de reajuste para o financeiro (não foi reajuste)
- ❌ Não mexer em `contract_services` (já estão somando R$ 2.300 corretamente)

## Arquivos afetados
- `src/components/contracts/ContractForm.tsx` (alerta visual)
- Banco: 1 INSERT em `contract_history` + 1 UPDATE em `contracts.adjustment_date`
- `CHANGELOG.md` (registrar)

**Posso implementar?**
