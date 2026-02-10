
# Menu de Acoes para Faturas - Baixa, Cancelar Boleto, Cancelar NFS-e

## Mapeamento Atual

### Onde fica o "Receber" / "A Receber"
- **Componente:** `src/components/billing/BillingInvoicesTab.tsx` (linha 449)
- **Entidade:** E um card de estatisticas ("A Receber") que mostra o total pendente. Nao e um botao de acao.
- **Menu existente:** Ja existe um kebab menu (tres pontinhos) nas linhas 676-822, mas **so aparece para faturas `pending` ou `overdue`**. Faturas pagas ou canceladas nao tem menu.

### Estados atuais

**Fatura (invoices.status):**
- `pending` - aguardando pagamento
- `overdue` - vencida
- `paid` - paga
- `cancelled` - cancelada

**Boleto (invoices.boleto_status):**
- `pendente` - nao gerado
- `gerado` - gerado no provedor
- `enviado` - PDF disponivel
- `erro` - falha na geracao

**NFS-e (nfse_history.status):**
- `processando` - enviada ao Asaas, aguardando retorno
- `autorizada` - emitida e valida
- `rejeitada` - recusada pela prefeitura
- `cancelada` - cancelada
- `erro` - falha

### Acoes existentes no backend
- **Baixa manual:** Edge Function `manual-payment` + dialog `ManualPaymentDialog`
- **Cancelar boleto:** Edge Function `banco-inter` com `action: "cancel"` (ja usado em `BillingBoletosTab`)
- **Cancelar NFS-e:** Edge Function `asaas-nfse` com `action: "cancel"` (ja existe, usa `DELETE /invoices/{asaas_invoice_id}`)
- **Tabela `nfse_history`:** Ja tem campo `motivo_cancelamento` (text) e `data_cancelamento` (timestamptz)

---

## O que sera implementado

### 1. Expandir o menu de acoes existente (UI)

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx`

O menu kebab atual so aparece para `pending`/`overdue`. Sera expandido para aparecer em **todos os status** (exceto `cancelled`), com acoes condicionais:

| Acao | pending/overdue | paid | cancelled |
|---|---|---|---|
| Dar baixa como recebido | Habilitado | Desabilitado (ja pago) | Oculto |
| Cancelar boleto | Habilitado (se boleto_url existe) | Desabilitado | Oculto |
| Cancelar NFS-e | Habilitado (se NFS-e autorizada) | Habilitado (se NFS-e autorizada) | Oculto |

### 2. Modal de cancelamento de NFS-e com justificativa

**Novo componente:** `src/components/billing/CancelNfseDialog.tsx`

- Textarea com validacao: obrigatorio, min 15 caracteres, max 500
- Contador de caracteres em tempo real
- Botao "Confirmar cancelamento" so habilita com justificativa valida
- Loading state durante processamento
- Acessibilidade: foco automatico no textarea, ESC fecha, navegacao por teclado

### 3. Tabela de auditoria para cancelamentos de NFS-e

**Nova migracao SQL:** Criar tabela `nfse_cancellation_log`

```text
id (uuid, PK)
created_at (timestamptz)
user_id (uuid, ref auth.users)
nfse_history_id (uuid, ref nfse_history)
invoice_id (uuid, ref invoices)
asaas_invoice_id (text)
justification (text, NOT NULL)
status (text: REQUESTED | CANCELLED | FAILED)
error_payload (jsonb)
request_id (text)
```

Com RLS: staff pode ler, service pode inserir.

### 4. Atualizar Edge Function `asaas-nfse` (action: cancel)

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

O `cancel` existente e simples demais -- nao valida justificativa nem registra auditoria. Sera atualizado para:

1. Receber parametro `justification` (obrigatorio, 15-500 chars)
2. Verificar idempotencia: se ja existe `nfse_cancellation_log` com status `CANCELLED` para o mesmo `nfse_history_id`, retornar erro
3. Criar registro em `nfse_cancellation_log` com status `REQUESTED`
4. Chamar `DELETE /invoices/{asaas_invoice_id}` no Asaas
5. Sucesso: atualizar log para `CANCELLED`, atualizar `nfse_history` com `status: cancelada`, `motivo_cancelamento`, `data_cancelamento`
6. Erro (400/401/404/timeout): atualizar log para `FAILED` com `error_payload`

### 5. Cancelar boleto na aba de Faturas

O cancelamento de boleto ja existe na `BillingBoletosTab` via `banco-inter` action `cancel`. Sera reutilizado no menu da `BillingInvoicesTab`:
- Chamar `supabase.functions.invoke("banco-inter", { body: { action: "cancel", invoice_id } })`
- Confirmar via `ConfirmDialog` antes de executar
- Atualizar `boleto_status` para refletir o cancelamento

---

## Checklist de implementacao por etapas

### Etapa 1: Banco de dados
- [ ] Criar tabela `nfse_cancellation_log` com campos listados acima
- [ ] Criar politicas RLS (staff SELECT, service INSERT/UPDATE)
- [ ] Adicionar indice unico `(nfse_history_id, status)` WHERE `status = 'CANCELLED'` para idempotencia

### Etapa 2: Backend (Edge Function)
- [ ] Atualizar `asaas-nfse` action `cancel` para exigir `justification`
- [ ] Adicionar validacao server-side (15-500 chars)
- [ ] Inserir `nfse_cancellation_log` com REQUESTED antes da chamada
- [ ] Verificar idempotencia (ja cancelada?)
- [ ] Tratar respostas 200/400/401/404 do Asaas
- [ ] Atualizar log para CANCELLED ou FAILED
- [ ] Atualizar `nfse_history.motivo_cancelamento` e `data_cancelamento`

### Etapa 3: Frontend - Componente de cancelamento
- [ ] Criar `CancelNfseDialog.tsx` com textarea validada
- [ ] Contador de caracteres (15-500)
- [ ] Botao desabilitado ate justificativa valida
- [ ] Loading state + feedback de sucesso/erro
- [ ] Acessibilidade (foco, ESC, teclado)

### Etapa 4: Frontend - Expandir menu de acoes
- [ ] Remover condicao `status === "pending" || status === "overdue"` do menu kebab
- [ ] Adicionar "Cancelar Boleto" ao menu (condicional: so se `boleto_url` existe e status nao e `paid`/`cancelled`)
- [ ] Adicionar "Cancelar NFS-e" ao menu (condicional: so se existe NFS-e autorizada para a fatura)
- [ ] Tooltip/texto de ajuda quando acao esta desabilitada
- [ ] Integrar `CancelNfseDialog` no fluxo
- [ ] Integrar `ConfirmDialog` para cancelamento de boleto

### Etapa 5: Logs e auditoria
- [ ] Registrar todas as operacoes em `nfse_cancellation_log`
- [ ] Log de correlacao no `asaas-nfse` (ja existe infra de logging)
- [ ] Invalidar queries apos operacoes (`invoices`, `nfse-by-invoices`, `billing-counters`)

---

## Criterios de aceite

- Menu de tres pontinhos visivel para faturas `pending`, `overdue` e `paid`
- "Dar baixa como recebido" disponivel apenas para faturas nao pagas
- "Cancelar boleto" disponivel apenas quando existe boleto gerado e fatura nao esta paga
- "Cancelar NFS-e" disponivel apenas quando existe NFS-e com status `autorizada`
- "Cancelar NFS-e" desabilitado com tooltip explicativo quando nao ha NFS-e vinculada
- Justificativa obrigatoria (15-500 caracteres) validada no front e no back
- Token do Asaas nunca exposto no client
- Registro de auditoria criado ANTES da chamada ao Asaas
- Idempotencia: nao permite cancelar NFS-e ja cancelada
- Fluxo trata erros 400/401/404 com mensagem amigavel
- Apos sucesso, UI atualiza status da NFS-e para "cancelada" e desabilita a acao
- Foco automatico no textarea ao abrir modal; ESC fecha

## Arquivos a criar/modificar

- **Nova migracao SQL** - tabela `nfse_cancellation_log`
- `supabase/functions/asaas-nfse/index.ts` - atualizar action `cancel`
- `src/components/billing/CancelNfseDialog.tsx` - novo componente
- `src/components/billing/BillingInvoicesTab.tsx` - expandir menu de acoes
