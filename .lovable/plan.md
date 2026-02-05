

# Fase 4 - Novas Funcionalidades

## Resumo dos Itens Aprovados

| # | Item | Status |
|---|------|--------|
| 1 | Portal do Cliente (Financeiro para client_master) | Implementar |
| 2 | Segunda Via de Boleto | Implementar |
| 3 | Renegociacao de Divida | Implementar |
| 4 | Regua de Cobranca | Nao implementar |
| 5 | CNAB 240/400 | Nao implementar |
| 6 | Dashboard Contratos por Vencer | Nao implementar |
| 7 | Relatorio Fiscal Mensal | Implementar |

---

## Item 1: Portal do Cliente - Aba Financeira (somente client_master)

**Objetivo:** Adicionar uma aba "Financeiro" no portal do cliente, visivel apenas para usuarios com role `client_master`, exibindo faturas, boletos, PIX e NFS-e da empresa vinculada.

### O que sera feito:

**Novo componente** `ClientPortalFinancialTab.tsx`:
- Listagem de faturas da empresa (pending, paid, overdue) com filtros por status
- Para cada fatura: numero, valor, vencimento, status, acoes
- Botao "Copiar PIX" quando `pix_code` existir
- Botao "Ver Boleto" abrindo `boleto_url` em nova aba
- Botao "Copiar Codigo de Barras" quando `boleto_barcode` existir
- Download de NFS-e (PDF) quando houver `nfse_history` autorizada vinculada
- Historico de pagamentos (faturas com status `paid`, mostrando `paid_date` e `paid_amount`)

**Cards de resumo no topo:**
- Total em aberto (pending)
- Total vencido (overdue) com destaque vermelho
- Total pago no mes atual

**Alteracao no** `ClientPortalPage.tsx`:
- Nova aba "Financeiro" na lista de tabs, condicionada a `isClientMaster`
- A query de faturas filtra por `client_id` da empresa vinculada
- A query de NFS-e filtra por `client_id` para listar notas disponiveis para download

**Seguranca (RLS):**
- As politicas ja existentes de `invoices` nao cobrem clientes. Sera necessario criar uma policy de SELECT para `client` e `client_master` que valide via `client_contacts` (mesmo padrao usado em `assets` e `tickets`)
- Idem para `nfse_history` - policy de SELECT para clientes

---

## Item 2: Segunda Via de Boleto

**Objetivo:** Permitir gerar uma nova via do boleto com data atualizada e multa/juros calculados para faturas vencidas.

### O que sera feito:

**Nova edge function** `generate-second-copy/index.ts`:
- Recebe `invoice_id`
- Valida que a fatura existe e esta `overdue` ou `pending`
- Calcula multa (2%) e juros (1% a.m. pro-rata) usando a funcao SQL `calculate_penalties` ja existente
- Chama a API do provedor (Banco Inter ou Asaas, conforme `billing_provider`) para gerar novo boleto com valor atualizado
- Atualiza `boleto_url`, `boleto_barcode`, `fine_amount`, `interest_amount` na fatura
- Retorna URL do novo boleto

**Novo componente** `SecondCopyDialog.tsx`:
- Dialog mostrando: valor original, multa calculada, juros calculados, valor total atualizado
- Botao "Gerar Segunda Via" que chama a edge function
- Apos sucesso, abre o boleto em nova aba

**Integracao na UI:**
- Botao "Segunda Via" no menu de acoes das faturas overdue em `BillingInvoicesTab`
- Botao "Segunda Via" na aba financeira do portal do cliente (para client_master)

---

## Item 3: Renegociacao de Divida

**Objetivo:** Permitir que o admin/financeiro cancele uma fatura vencida e gere N novas faturas parceladas como acordo de renegociacao.

### O que sera feito:

**Nova edge function** `renegotiate-invoice/index.ts`:
- Recebe: `invoice_id`, `number_of_installments`, `include_penalties` (boolean)
- Valida que a fatura esta `overdue`
- Calcula valor total (com ou sem multa/juros conforme flag)
- Divide em N parcelas iguais (ou com ajuste na ultima)
- Cria N novas faturas com:
  - `parent_invoice_id` = fatura original
  - `installment_number` = 1, 2, 3...
  - `total_installments` = N
  - `status` = pending
  - `due_date` = vencimentos mensais a partir da data atual
  - `payment_method` herdado da fatura original
- Cancela a fatura original (status -> cancelled)
- Cria registro em `audit_logs`

**Novo componente** `RenegotiateInvoiceDialog.tsx`:
- Mostra dados da fatura original (valor, cliente, vencimento)
- Toggle "Incluir multa e juros no acordo"
- Campo para numero de parcelas (2 a 12)
- Preview das parcelas geradas (valor e data de cada uma)
- Botao "Confirmar Renegociacao"

**Integracao na UI:**
- Botao "Renegociar" no menu de acoes das faturas `overdue` em `BillingInvoicesTab`
- Indicador visual nas faturas parceladas (badge "Parcela 1/3")

---

## Item 7: Relatorio Fiscal Mensal

**Objetivo:** Gerar relatorio consolidado mensal de NFS-e emitidas, canceladas e impostos retidos para contabilidade.

### O que sera feito:

**Novo componente** `FiscalReportTab.tsx` (ou widget):
- Seletor de mes/ano de referencia
- Tabela resumo com:
  - Total de NFS-e emitidas (status = autorizada)
  - Total de NFS-e canceladas
  - Valor total de servicos
  - ISS retido total
  - PIS, COFINS, CSLL, IRRF, INSS (somatorios)
  - Valor liquido total
- Listagem detalhada de cada NFS-e do periodo
- Botao "Exportar CSV" para envio ao contador

**Novo componente** `FiscalReportExport.tsx`:
- Gera arquivo CSV com colunas: numero_nfse, data_emissao, cliente, valor_servico, valor_iss, valor_pis, valor_cofins, valor_csll, valor_irrf, valor_inss, valor_liquido, status

**Integracao na UI:**
- Nova aba "Fiscal" no `BillingPage.tsx` (entre Conciliacao e Servicos)
- Acessivel para admin e financial

---

## Detalhes Tecnicos

### Migracao de Banco de Dados

```text
Novas RLS Policies necessarias:
1. invoices - SELECT para client/client_master (via client_contacts)
2. nfse_history - SELECT para client/client_master (via client_contacts)
```

Nenhuma alteracao de schema necessaria - os campos `parent_invoice_id`, `installment_number`, `total_installments` ja existem na tabela `invoices`.

### Edge Functions

| Funcao | Autenticacao | Descricao |
|--------|-------------|-----------|
| `generate-second-copy` | JWT obrigatorio | Gera segunda via de boleto |
| `renegotiate-invoice` | JWT obrigatorio (admin/financial) | Cria acordo de renegociacao |

### Componentes React

| Componente | Local |
|-----------|-------|
| `ClientPortalFinancialTab.tsx` | `src/components/client-portal/` |
| `SecondCopyDialog.tsx` | `src/components/billing/` |
| `RenegotiateInvoiceDialog.tsx` | `src/components/billing/` |
| `FiscalReportTab.tsx` | `src/components/billing/` |
| `FiscalReportExport.tsx` | `src/components/billing/` |

### Ordem de Implementacao

1. Migracao (RLS policies para portal do cliente)
2. Portal do Cliente - Aba Financeira
3. Segunda Via de Boleto (edge function + dialog)
4. Renegociacao de Divida (edge function + dialog)
5. Relatorio Fiscal Mensal (componente + exportacao CSV)

