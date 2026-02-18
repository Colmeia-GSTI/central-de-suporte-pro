

# Prioridade Media: bank_accounts, View Contas a Receber, Conciliacao Irreversivel

## Resumo

Tres ajustes de banco de dados e frontend para alinhar o sistema com as regras do BomControle de prioridade media. Nenhuma mudanca destrutiva -- apenas adicoes.

---

## 1. Tabela `bank_accounts` -- Ancora do Caixa

Criar tabela para representar contas bancarias reais, com saldo acumulativo.

**Campos:**
- `id`, `name` (ex: "Banco Inter", "Caixa Empresa")
- `bank_name`, `agency`, `account_number`, `account_type` (corrente/poupanca)
- `initial_balance` (saldo de abertura)
- `current_balance` (atualizado apenas via conciliacao)
- `is_active`, `created_at`, `updated_at`

**Regras:**
- Conta nao pode ser excluida (soft-delete via `is_active = false`)
- RLS: admin/financial podem gerenciar; staff pode visualizar
- Coluna `bank_account_id` adicionada em `bank_reconciliation` para vincular lancamentos a uma conta

---

## 2. View `accounts_receivable` -- Contas a Receber Consolidada

View somente leitura que consolida faturas em formato de contas a receber, sem criar tabela nova.

```text
Campos derivados:
- invoice_id, invoice_number
- client_id, client_name
- contract_id
- amount, due_date, paid_date, paid_amount
- ar_status (mapeado: pending->em_aberto, overdue->atrasado, paid->pago, renegotiated->renegociado, lost->perdido, cancelled->cancelado)
- days_overdue (calculado)
- is_overdue (boolean)
```

Isso permite consultas de inadimplencia e aging sem mudar a estrutura existente.

---

## 3. Conciliacao Irreversivel

Adicionar trigger na tabela `bank_reconciliation` que impede reverter status `matched` para qualquer outro valor.

```text
Regra: Se OLD.status = 'matched', bloquear UPDATE do campo status.
Excecao: Nenhuma. Conciliacao e verdade financeira, evento irreversivel.
```

---

## 4. Atualizacao do Frontend

### BankReconciliationTab
- Adicionar seletor de conta bancaria (dropdown `bank_accounts`)
- Mostrar saldo da conta selecionada no header

### BillingPage
- Nenhuma mudanca estrutural. A view `accounts_receivable` sera usada em relatorios futuros.

---

## Ordem de Execucao

1. Migration SQL: criar `bank_accounts`, view `accounts_receivable`, trigger de conciliacao irreversivel, adicionar `bank_account_id` em `bank_reconciliation`
2. Atualizar `BankReconciliationTab.tsx` para usar contas bancarias
3. Atualizar types (automatico apos migration)

---

## Secao Tecnica

### Migration SQL completa:

**Tabela bank_accounts:**
```sql
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bank_name text,
  agency text,
  account_number text,
  account_type text DEFAULT 'corrente',
  initial_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
-- RLS policies para admin/financial
```

**FK em bank_reconciliation:**
```sql
ALTER TABLE public.bank_reconciliation
  ADD COLUMN bank_account_id uuid REFERENCES public.bank_accounts(id);
```

**View accounts_receivable:**
```sql
CREATE VIEW public.accounts_receivable AS
SELECT
  i.id, i.invoice_number, i.client_id, c.name as client_name,
  i.contract_id, i.amount, i.due_date, i.paid_date, i.paid_amount,
  CASE i.status
    WHEN 'pending' THEN 'em_aberto'
    WHEN 'overdue' THEN 'atrasado'
    WHEN 'paid' THEN 'pago'
    WHEN 'renegotiated' THEN 'renegociado'
    WHEN 'lost' THEN 'perdido'
    WHEN 'cancelled' THEN 'cancelado'
  END as ar_status,
  GREATEST(0, CURRENT_DATE - i.due_date) as days_overdue,
  (i.status = 'overdue' OR (i.status = 'pending' AND i.due_date < CURRENT_DATE)) as is_overdue
FROM invoices i
LEFT JOIN clients c ON c.id = i.client_id
WHERE i.status NOT IN ('cancelled');
```

**Trigger conciliacao irreversivel:**
```sql
CREATE FUNCTION prevent_reconciliation_reversal() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'matched' AND NEW.status IS DISTINCT FROM 'matched' THEN
    RAISE EXCEPTION 'Conciliacao e irreversivel. Nao e possivel reverter status matched.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_reconciliation_immutability
  BEFORE UPDATE ON public.bank_reconciliation
  FOR EACH ROW EXECUTE FUNCTION prevent_reconciliation_reversal();
```

