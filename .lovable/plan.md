
# Correcao Automatizada - Fatura Quaza (Vencimento 07 para 14)

## Dados Identificados

| Item | Valor |
|---|---|
| Contrato | Gestao de TI - Remoto (`2bc9ffab-...`) |
| billing_day atual | 7 |
| Fatura | #57 (`36e4ab47-...`) - R$ 650,00 |
| Vencimento atual | 07/03/2026 |
| Boleto | Banco Inter, status "enviado", com barcode e PDF |
| codigoSolicitacao | `05b4be38-b160-4242-ad7e-41ba10d9720a` |

## Etapas da Correcao

### Etapa 1: Atualizar contrato
Alterar `billing_day` de 7 para 14 no contrato, para que futuras faturas sejam geradas com vencimento no dia 14.

```sql
UPDATE contracts SET billing_day = 14, updated_at = now()
WHERE id = '2bc9ffab-b382-4d77-b821-e40460f985ef';
```

### Etapa 2: Cancelar boleto antigo no Banco Inter
Invocar a Edge Function `banco-inter` com action `cancel` para cancelar o boleto no provedor, usando o `codigoSolicitacao` ja armazenado na fatura.

### Etapa 3: Atualizar fatura
Alterar o `due_date` para 14/03/2026 e limpar os campos do boleto cancelado para permitir a geracao de um novo.

```sql
UPDATE invoices SET
  due_date = '2026-03-14',
  boleto_url = NULL,
  boleto_barcode = NULL,
  boleto_status = NULL,
  boleto_sent_at = NULL,
  boleto_error_msg = NULL,
  auto_payment_generated = false,
  updated_at = now()
WHERE id = '36e4ab47-7c23-44d5-98fa-90a63faf4093';
```

### Etapa 4: Gerar novo boleto
Invocar a Edge Function `banco-inter` para gerar um novo boleto com vencimento 14/03/2026.

### Etapa 5: Registrar auditoria
Inserir registro em `audit_logs` documentando a correcao realizada.

## Resumo

| Acao | Detalhe |
|---|---|
| Contrato | billing_day: 7 -> 14 |
| Fatura #57 | due_date: 07/03 -> 14/03 |
| Boleto antigo | Cancelado no Banco Inter |
| Boleto novo | Gerado com vencimento 14/03 |
| Auditoria | Registrada |

## Riscos e Mitigacoes

- O cancelamento do boleto depende da API do Banco Inter estar disponivel. Se falhar, o boleto antigo continua valido ate o vencimento e a geracao do novo sera tentada apos a limpeza dos campos.
- O cliente deve ser informado do novo boleto (envio de notificacao pode ser feito apos a geracao).
