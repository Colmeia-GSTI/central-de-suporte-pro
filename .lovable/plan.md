
# Tela de Gestao de Contas Bancarias

## Resumo

Adicionar uma nova aba "Contas" no modulo de Faturamento (`BillingPage`) com CRUD completo para gerenciar contas bancarias. A aba permite criar, editar e desativar (soft-delete) contas, exibindo saldo inicial, saldo atual e detalhes bancarios.

---

## O que ja existe e funciona

- Tabela `bank_accounts` no banco com RLS (admin/financial podem gerenciar, staff pode visualizar)
- Tipos TypeScript gerados automaticamente
- Componente `BankAccountSelector` que lista contas ativas
- Aba de Conciliacao que filtra por conta bancaria

## O que sera criado

### 1. Componente `BillingBankAccountsTab`

Novo componente em `src/components/billing/BillingBankAccountsTab.tsx`:

- **Listagem**: Tabela com todas as contas (ativas e inativas), exibindo nome, banco, agencia, conta, tipo, saldo inicial, saldo atual e status
- **Criar**: Botao "Nova Conta" abre dialog com formulario
- **Editar**: Botao de editar em cada linha abre dialog preenchido
- **Desativar/Reativar**: Toggle de status (soft-delete, sem exclusao real)
- **Validacoes**: Nome obrigatorio, saldo inicial numerico

### 2. Componente `BankAccountFormDialog`

Dialog reutilizavel para criar e editar contas:

- Campos: Nome (obrigatorio), Banco, Agencia, Numero da Conta, Tipo (corrente/poupanca), Saldo Inicial
- Saldo Atual nao e editavel (controlado apenas por conciliacao)
- Validacao via formulario controlado

### 3. Integracao no `BillingPage`

- Adicionar aba "Contas" (icone `Landmark`) ao array `BILLING_TABS`
- Restringir acesso: apenas `admin` e `financial` podem ver a aba (usando `canManage` que ja existe)
- Atualizar grid de tabs de 9 para 10 colunas no desktop

---

## Secao Tecnica

### Arquivos a criar:
- `src/components/billing/BillingBankAccountsTab.tsx` -- listagem + logica CRUD
- `src/components/billing/BankAccountFormDialog.tsx` -- dialog de formulario

### Arquivos a editar:
- `src/pages/billing/BillingPage.tsx` -- adicionar aba "Contas" ao array de tabs e ao conteudo

### Queries e Mutations:
- `queryKey: ["bank-accounts"]` -- lista todas as contas (ativas e inativas)
- `insert` em `bank_accounts` -- criar nova conta
- `update` em `bank_accounts` -- editar conta existente
- `update is_active` -- desativar/reativar (sem delete)

### Permissoes:
- Aba visivel apenas para quem tem `can("financial", "edit")` (admin e financial)
- RLS ja configurado no banco: admin/financial podem ALL, staff pode SELECT

### Invalidacao de cache:
- Apos criar/editar/desativar, invalidar `["bank-accounts"]` e `["bank-accounts-active"]` (usado pelo `BankAccountSelector` na aba de conciliacao)
