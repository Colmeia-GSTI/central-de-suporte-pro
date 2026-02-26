
# Plano: Historico Financeiro e Resumo de Pagamentos na Listagem de Contratos

## Objetivo

Adicionar colunas de resumo financeiro na listagem de contratos (similar ao print de referencia) e permitir visualizar o historico de parcelas/faturas de cada contrato, agrupadas por ano.

---

## 1. Criar RPC no banco para calcular resumo financeiro por contrato

**Migracao SQL**

Criar uma funcao RPC `get_contracts_invoice_summary` que retorna, para cada contrato, os totais financeiros agregados a partir da tabela `invoices`:

| Campo | Descricao |
|---|---|
| `contract_id` | ID do contrato |
| `total_invoiced` | Soma de `amount` de todas as faturas (exceto canceladas/renegociadas) |
| `paid_count` | Quantidade de faturas com status `paid` |
| `paid_total` | Soma dos valores pagos |
| `overdue_count` | Quantidade de faturas com status `overdue` |
| `overdue_total` | Soma dos valores vencidos |
| `pending_count` | Quantidade de faturas pendentes |
| `next_adjustment` | Data do proximo reajuste (campo `adjustment_date` do contrato) |

A funcao fara um `LEFT JOIN` entre `contracts` e `invoices`, agrupando por `contract_id`, e filtrando faturas com status diferente de `cancelled` e `renegotiated`.

---

## 2. Adicionar colunas na listagem de contratos

**Arquivo:** `src/pages/contracts/ContractsPage.tsx`

Adicionar 3 novas colunas na tabela:

| Coluna | Conteudo |
|---|---|
| Prox. Reajuste | Data formatada do campo `adjustment_date` do contrato |
| Quitado | Badge verde com contagem de faturas pagas + valor total pago |
| Atrasado | Badge vermelha com contagem de faturas vencidas (0 = cinza) |

A query existente sera complementada com uma segunda query usando a RPC `get_contracts_invoice_summary`, que retorna os totais de todos os contratos de uma vez. Os dados serao mapeados por `contract_id` para exibicao.

---

## 3. Criar componente de historico de parcelas (Sheet)

**Novo arquivo:** `src/components/contracts/ContractInvoicesSheet.tsx`

Um Sheet (drawer lateral) que mostra as faturas/parcelas do contrato agrupadas por ano, inspirado no print de referencia:

- **Cabecalho:** Nome do contrato e cliente
- **Agrupamento por ano:** Collapsible com badges coloridas (pagas, vencidas, pendentes)
- **Tabela por ano:** Colunas: Parcela, Competencia, Vencimento, Status (badge), Valor
- **Acoes por linha:** Icones para visualizar boleto, NFS-e, etc. (links para a aba de faturamento)
- **Resumo no rodape:** Total faturado, total pago, total em aberto

A query buscara faturas vinculadas ao `contract_id`, ordenadas por `due_date`, e agrupara no frontend por ano.

---

## 4. Integrar o Sheet na listagem

**Arquivo:** `src/pages/contracts/ContractsPage.tsx`

- Adicionar um botao com icone `DollarSign` na coluna de acoes para abrir o `ContractInvoicesSheet`
- O botao tera tooltip "Historico de parcelas"
- Ao clicar, abre o Sheet com os dados financeiros do contrato

---

## 5. Adicionar link rapido na linha do contrato

A linha do contrato sera clicavel (como na pagina de clientes) para navegar para a pagina de edicao. Os valores de "Quitado" e "Atrasado" serao clicaveis para abrir o Sheet de parcelas diretamente.

---

## Detalhes Tecnicos

### Arquivos Modificados/Criados

| Arquivo | Alteracao |
|---|---|
| **Migracao SQL** | RPC `get_contracts_invoice_summary` |
| `src/pages/contracts/ContractsPage.tsx` | Colunas Prox. Reajuste, Quitado, Atrasado + integracao Sheet |
| `src/components/contracts/ContractInvoicesSheet.tsx` | **Novo** - Sheet com historico de parcelas agrupado por ano |

### Query da RPC

```sql
CREATE OR REPLACE FUNCTION get_contracts_invoice_summary()
RETURNS TABLE (
  contract_id uuid,
  paid_count bigint,
  paid_total numeric,
  overdue_count bigint,
  overdue_total numeric,
  pending_count bigint,
  total_invoiced numeric
) AS $$
  SELECT
    i.contract_id,
    COUNT(*) FILTER (WHERE i.status = 'paid') as paid_count,
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'paid'), 0) as paid_total,
    COUNT(*) FILTER (WHERE i.status = 'overdue') as overdue_count,
    COALESCE(SUM(i.amount) FILTER (WHERE i.status = 'overdue'), 0) as overdue_total,
    COUNT(*) FILTER (WHERE i.status = 'pending') as pending_count,
    COALESCE(SUM(i.amount), 0) as total_invoiced
  FROM invoices i
  WHERE i.contract_id IS NOT NULL
    AND i.status NOT IN ('cancelled', 'renegotiated')
  GROUP BY i.contract_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### Estrutura do Sheet de Parcelas

O componente agrupara faturas por ano usando `date-fns`:

```text
2026
  [2 pagas] [0 vencidas] [1 pendente]
  +---------+-------------+------------+----------+----------+
  | Parcela | Competencia | Vencimento | Status   | Valor    |
  +---------+-------------+------------+----------+----------+
  | 3       | 01/2026     | 07/02/2026 | Quitado  | R$ 390   |
  | 2       | 12/2025     | 07/01/2026 | Quitado  | R$ 390   |
  +---------+-------------+------------+----------+----------+

2025
  [1 paga] [0 vencidas] [0 pendentes]
  ...
```

### Cache e Performance

- A RPC sera chamada em paralelo com a query de contratos, usando query key `["contracts-invoice-summary"]`
- `staleTime: 2 minutos` para evitar chamadas excessivas
- O Sheet de parcelas usara sua propria query `["contract-invoices", contractId]` com `staleTime: 1 minuto`
- Apos acoes de pagamento/geracao de fatura, invalidar `["contracts-invoice-summary"]`

### Impacto no Banco

Uma funcao RPC nova (`get_contracts_invoice_summary`). Nenhuma tabela nova. Nenhuma alteracao em tabelas existentes.
