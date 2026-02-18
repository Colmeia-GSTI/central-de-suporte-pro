

# Analise de Aderencia: Regras BomControle E2E vs. Sistema Atual

## Resumo Executivo

O sistema atual (Colmeia HD Pro) foi construido como um **helpdesk com modulo financeiro acoplado**, e nao como um ERP orientado a eventos financeiros. Isso cria gaps estruturais importantes em relacao ao modelo BomControle. A boa noticia: **nao e necessario reprogramar tudo do zero**. O nucleo (contratos, faturas, NFS-e, boletos, reconciliacao) ja existe e funciona. O que falta sao **camadas intermediarias e separacoes conceituais** que podem ser adicionadas incrementalmente.

---

## 1. CONTRATOS -- Aderencia: 80%

### O que ja temos e funciona:
- Estados: `active`, `expired`, `cancelled`, `pending`
- Apenas contratos ativos geram faturas (filtro `status = active`)
- Alteracoes nao afetam titulos ja gerados (historico em `contract_history`)
- Contratos nao movimentam caixa diretamente

### O que falta:
- **Estado SUSPENSO**: O BomControle define `VIGENTE -> SUSPENSO -> VIGENTE`. Nosso enum `contract_status` nao tem `suspended`. Precisamos adicionar.
- **Maquina de estados formal**: Nao temos trigger validando transicoes de contrato (ex: `cancelled` nao pode voltar a `active`). Temos isso para faturas, mas nao para contratos.

### Acao necessaria:
- Adicionar `suspended` ao enum `contract_status`
- Criar trigger de validacao de transicoes

---

## 2. PARCELAS -- Aderencia: 70%

### O que ja temos:
- O CRON `generate-monthly-invoices` gera uma "parcela" por competencia para cada contrato ativo
- Controle de duplicidade via `reference_month` + `contract_id`

### Gap conceitual:
- No BomControle, existe uma **etapa intermediaria**: `Contrato -> Parcela -> Faturamento`. A parcela e um "evento temporal" separado do titulo financeiro.
- No nosso sistema, **o contrato gera a fatura diretamente** (pula a parcela). Isso significa que nao temos um registro intermediario que permita "parcela gerada mas ainda nao faturada".

### Avaliacao:
- **Para um sistema MSP/helpdesk, o modelo atual e suficiente.** A separacao parcela/faturamento faz mais sentido em ERPs com vendas complexas.
- Se quiser aderencia total, precisariamos criar uma tabela `installments` intermediaria. Mas isso seria uma refatoracao grande com pouco ganho pratico para o caso de uso atual.

### Recomendacao: Manter como esta. O modelo direto (contrato -> fatura) atende ao caso de uso.

---

## 3. FATURAMENTO -- Aderencia: 85%

### O que ja temos:
- Faturas com estados explícitos (`pending`, `paid`, `overdue`, `cancelled`)
- Trigger de maquina de estados validando transicoes
- Faturamento != pagamento (campos separados: `status` vs `paid_date`)
- Erros persistentes (`boleto_error_msg`, `nfse_error_msg`, `email_error_msg`)

### O que falta:
- **Estado `voided` (anulado)**: O BomControle define que "nenhum titulo e apagado". Nosso sistema tem `cancelled` mas nao tem `voided`. Na pratica, usamos `cancelled` para ambos os casos.
- **Campo `reference_month` obrigatorio**: Ja temos, mas nao e `NOT NULL`. Deveria ser obrigatorio para faturas de contrato.

### Acao necessaria: Pequenos ajustes, nenhum retrabalho estrutural.

---

## 4. VENDAS (Hub Operacional) -- Aderencia: 0% (NAO EXISTE)

### Gap critico:
Este e o **maior gap arquitetural**. No BomControle, a "Venda" e a entidade central que orquestra:

```text
Venda
+-- Nota Fiscal (dimensao fiscal)
+-- Boleto (dimensao financeira)
+-- Conta a Receber (dimensao financeira)
```

No nosso sistema, **a fatura (`invoices`) faz o papel de hub**, acumulando responsabilidades comerciais, fiscais e financeiras em uma unica tabela. Isso funciona, mas viola o principio de separacao de dominios.

### Estados paralelos (BomControle):
- Comercial: Orcamento / Venda / Cancelada
- Fiscal: Sem NF / NF Emitida / NF Autorizada
- Financeiro: Sem Boleto / Boleto Gerado

### No nosso sistema:
- Temos `boleto_status`, `nfse_status`, `email_status` como **campos na mesma tabela `invoices`**
- Isso funciona como "estados paralelos" informais, mas sem a separacao formal

### Avaliacao:
- **Para MSP/helpdesk, o modelo atual e pragmatico e funcional.** Criar uma entidade "Venda" separada seria uma refatoracao massiva (nova tabela, migrar todos os fluxos, reescrever UI) com retorno questionavel.
- Os campos de status paralelos (`boleto_status`, `nfse_status`) ja simulam a separacao de dimensoes.

### Recomendacao: Manter. Os campos de status paralelos na tabela `invoices` atendem ao principio sem a complexidade de uma entidade separada.

---

## 5. NOTA FISCAL -- Aderencia: 90%

### O que ja temos e funciona:
- Tabela `nfse_history` separada (nao misturada com faturas)
- NF nasce da fatura (que faz papel de "venda")
- NF nao substitui a fatura
- Cancelamento e logico (campo `motivo_cancelamento`, `data_cancelamento`)
- Erros fiscais nao apagam a fatura
- Auditoria em `nfse_event_logs`

### O que falta:
- Nada critico. A separacao ja existe na pratica.

---

## 6. BOLETO -- Aderencia: 85%

### O que ja temos:
- Campos dedicados na fatura: `boleto_url`, `boleto_barcode`, `boleto_status`
- Boleto != pagamento (bem separado)
- Geracao via Banco Inter e Asaas

### O que falta:
- **Boleto como entidade separada**: No modelo ideal, boleto seria uma tabela propria vinculada a fatura, permitindo multiplos boletos (2a via, cancelamento, reemissao). Hoje tudo fica em campos da fatura.
- Na pratica, o modelo atual funciona para o caso de uso MSP.

---

## 7. CONTAS A RECEBER -- Aderencia: 40%

### Gap significativo:
- Temos `financial_entries` mas e uma tabela generica (receitas e despesas manuais)
- **Nao temos uma tabela dedicada de "Contas a Receber"** com estados proprios (`EM_ABERTO`, `PAGO`, `ATRASADO`, `RENEGOCIADO`, `PERDIDO`)
- A fatura (`invoices`) acumula esse papel tambem
- Falta o estado `PERDIDO` (titulo incobravel)

### O que ja temos que cobre parcialmente:
- `invoices.status` com `pending` (em aberto), `paid`, `overdue`, `cancelled`
- Renegociacao via `renegotiate-invoice` (cria novas faturas, cancela original)
- `parent_invoice_id` para rastreabilidade

### Acao necessaria:
- Adicionar estado `lost` ao enum `invoice_status` para titulos incobriveis
- Ou: criar view `accounts_receivable` que consolida faturas em formato de contas a receber

---

## 8. INADIMPLENCIA -- Aderencia: 60%

### O que ja temos:
- `AgingReportWidget` e `DelinquencyReportPage` (calculados, nao persistidos -- conforme regra)
- Filtro por vencimento e nao-pagamento

### O que falta:
- Consolidacao por cliente
- Estados de negociacao (`NAO_NEGOCIADO`, `NEGOCIADO`, `PERDIDO`)
- Integracao com conciliacao

---

## 9. RENEGOCIACAO -- Aderencia: 90%

### O que ja temos:
- Edge Function `renegotiate-invoice` completa
- Cria novos titulos com parcelas
- Preserva historico via `parent_invoice_id`
- Guard de arredondamento (Math.max 0.01)
- Titulo original vai para `cancelled`

### O que falta:
- Titulo original deveria ir para `renegotiated` ao inves de `cancelled` (para diferenciar)

---

## 10-11. CONTA BANCARIA e CONCILIACAO -- Aderencia: 50%

### O que ja temos:
- `bank_reconciliation` com matching automatico por score
- `financial_entries` com flag `is_reconciled`

### O que falta:
- **Tabela `bank_accounts`**: Nao existe. Nao temos representacao de contas bancarias reais com saldo.
- **Saldo acumulativo**: Nao existe calculo de saldo bancario
- **Regra "so conciliacao altera saldo"**: Nao implementada (nao temos saldo)
- **Conciliacao irreversivel**: Nao temos constraint impedindo reverter conciliacao

---

## 12-13. FLUXO DE CAIXA e RESULTADO -- Aderencia: 20%

### O que falta:
- Nao temos tela de fluxo de caixa (previsto vs realizado)
- Nao temos DRE ou resultado financeiro
- Estas sao funcionalidades de ERP que vao alem do escopo MSP/helpdesk

---

## Resumo de Gaps por Prioridade

### Prioridade Alta (Impacto no dia-a-dia):
1. Adicionar estado `suspended` ao enum de contratos
2. Adicionar estado `lost` ao enum de faturas (titulo incobravel)
3. Criar maquina de estados para contratos (trigger)

### Prioridade Media (Melhoria de gestao):
4. Criar tabela `bank_accounts` para contas bancarias
5. Criar view de Contas a Receber consolidada
6. Melhorar painel de inadimplencia com estados de negociacao
7. Tornar conciliacao irreversivel

### Prioridade Baixa (Aderencia ERP completa):
8. Criar entidade "Venda" separada
9. Criar tabela intermediaria de parcelas
10. Tela de fluxo de caixa
11. DRE / resultado financeiro

---

## Recomendacao Final

O sistema atual funciona bem como **plataforma MSP com financeiro integrado**. Ele nao e (e nao precisa ser) um ERP completo. As regras do BomControle que fazem sentido adotar sao:

1. **Imutabilidade**: Ja temos (nenhum registro e deletado)
2. **Estados explicitos**: Parcialmente (falta `suspended` e `lost`)
3. **Separacao fiscal/financeiro**: Ja temos via `nfse_history` separado
4. **Maquina de estados**: Temos para faturas, falta para contratos

As regras que **nao se aplicam** ao nosso caso de uso:
- Entidade "Venda" separada (over-engineering para MSP)
- Parcelas como etapa intermediaria (direto contrato -> fatura e suficiente)
- DRE e resultado financeiro (escopo ERP)

Posso implementar os itens de **prioridade alta** imediatamente. Deseja prosseguir com esses ajustes, ou prefere discutir algum ponto especifico antes?

