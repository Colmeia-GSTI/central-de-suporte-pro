
# Investigação: Boleto do Calherão emitido no CNPJ antigo

## 📋 O que aconteceu (cronologia real, do banco)

Cliente afetado: **CALHERRAO & FILHO LTDA – Matriz** (`20113749-…`).  
CNPJ correto: `87.653.887/0001-03`. CNPJ antigo (errado): `93.730.224/0001-30`.  
Asaas customer ID: `cus_000173909063`.

| Data | Evento |
|---|---|
| 2026-05-01 11:01 | Cliente criado no Asaas com o CNPJ **errado** (`93.730.224/0001-30`) → `cus_000173909063`. |
| 2026-05-14 17:21 | CNPJ corrigido no nosso banco para `87.653.887/0001-03`. **Asaas não foi atualizado.** |
| 2026-06-01 11:00 | Geração automática da fatura #371. Boleto criado no Asaas usando `cus_000173909063` → emitido com **CNPJ antigo**. |
| 2026-06-01 13:11 | NFS-e #245 autorizada → saiu com **CNPJ novo** (fluxo de NFS-e faz um PUT no cliente do Asaas que acabou aplicando o CNPJ correto). |
| 2026-06-01 17:59 | Usuário re-salvou o cliente tentando forçar sincronização. |
| Em seguida | Usuário tentou **cancelar o boleto** → erro. |

(O mesmo padrão de “duas chamadas Asaas em paralelo” aparece nos audit_logs: cada fatura recebeu **dois** `asaas_payment_id` em menos de 2s — fluxo de boleto e fluxo de NFS-e criando cobranças concorrentes.)

## 🎯 Causa raiz (3 bugs reais)

### Bug 1 — Boleto Asaas nunca re-sincroniza o cliente
`supabase/functions/asaas-nfse/index.ts`, action `create_payment` (linhas ~1895-1948):  
só **cria** o cliente no Asaas se `asaas_customer_id` estiver vazio. **Nunca faz PUT.** Se o CNPJ mudar localmente depois, o boleto continua sendo emitido com os dados antigos do Asaas.

Já o fluxo de NFS-e usa `ensureCustomerInAsaas` (linhas ~262-289), que **sempre** faz PUT antes de emitir. Por isso a NFS-e saiu certa e o boleto saiu errado.

### Bug 2 — Botão “Cancelar Boleto” vai sempre pro Banco Inter
`src/components/billing/BillingInvoicesTab.tsx` linha 706-725:
```ts
onCancelBoleto={async () => {
  ...
  await supabase.functions.invoke("banco-inter", { body: { action: "cancel", ... } });
}}
```
Hardcoded em `banco-inter`. A fatura do Calherão tem `billing_provider = 'asaas'` → a requisição vai pro provedor errado e dá erro. **Não existe nenhuma action `cancel` na função `asaas-nfse` para cobranças (payments).**

### Bug 3 — Cobrança duplicada por race condition
A geração mensal dispara, no mesmo segundo, criação de boleto + emissão de NFS-e. Cada um chama o Asaas, cria um `payment` e atualiza `invoices.asaas_payment_id`. Resultado: até 2 cobranças no Asaas por fatura (uma órfã). Audit confirma:
- Fatura #371: `pay_b83irkjzbo4saw99` → `pay_w2l6nmjntct4m4ks`
- Fatura #372: `pay_gpft34lhseo985mr` → `pay_606rt4w0m4kemo4c`

## 🛠 Plano de correção

### A) Sincronizar cliente no Asaas **antes** de criar boleto
Em `supabase/functions/asaas-nfse/index.ts`, action `create_payment`: substituir o `if (!customerId) { criar }` por uma chamada a `ensureCustomerInAsaas(...)` (a mesma usada na NFS-e). Isso faz:
- PUT em `/customers/{id}` com `cpfCnpj`, email, endereço, etc., toda vez que vamos emitir;
- se o PUT falhar (cliente removido no Asaas), cria um novo e atualiza o `asaas_customer_id` local.

Resultado: qualquer alteração local de CNPJ/endereço/email propaga pro Asaas antes da próxima cobrança.

### B) Roteamento correto do “Cancelar Boleto” por `billing_provider`
Em `src/components/billing/BillingInvoicesTab.tsx` (e no `ContractInvoiceActionsMenu.tsx`), trocar a chamada hardcoded por:

```ts
const provider = invoice.billing_provider ?? "banco_inter";
if (provider === "asaas") {
  await supabase.functions.invoke("asaas-nfse", {
    body: { action: "cancel_payment", invoice_id: invoice.id, motivo: "ACERTOS" },
  });
} else {
  await supabase.functions.invoke("banco-inter", {
    body: { action: "cancel", invoice_id: invoice.id, motivo_cancelamento: "ACERTOS" },
  });
}
```

E implementar a action `cancel_payment` em `asaas-nfse/index.ts`:
- Buscar `invoices.asaas_payment_id`;
- `DELETE /payments/{id}` no Asaas (com tratamento dos erros 400/“invalid_action”/“payment_already_received”);
- Limpar `boleto_url`, `boleto_barcode`, `pix_code`, `asaas_payment_id`, `boleto_status='cancelado'`;
- Registrar em `audit_logs`.

### C) Eliminar race de cobrança duplicada
No `generate-monthly-invoices` (e/ou no `asaas-nfse create_payment`):  
antes de criar um novo payment, checar se `invoices.asaas_payment_id` já existe. Se sim, reaproveitar. Garantir que boleto e NFS-e usem o **mesmo** payment (NFS-e do Asaas aceita `payment` opcional para vincular). Isso elimina cobranças órfãs.

### D) Limpeza específica do caso Calherão (one-shot, manual)
1. No Asaas (painel ou via DELETE /payments/{id}): cancelar `pay_b83irkjzbo4saw99` (órfão) e `pay_w2l6nmjntct4m4ks` (boleto com CNPJ errado).
2. Forçar PUT no `cus_000173909063` com o CNPJ correto (a correção A já fará isso na próxima emissão; opcionalmente rodar um job único agora).
3. Re-emitir boleto da fatura #371 → sairá com CNPJ correto.
4. Repetir verificação para a fatura #372 (Concreteira) por garantia.

### E) Prevenção
- Adicionar log explícito no Asaas sync quando `cpfCnpj` mudar (`old → new`) gravando em `application_logs` para auditoria.
- Quando o usuário editar CNPJ de um cliente que já tem `asaas_customer_id`, disparar imediatamente um `sync_customer` para o Asaas (action nova, leve), em vez de esperar a próxima emissão.

## 🔍 Arquivos que serão alterados
- `supabase/functions/asaas-nfse/index.ts` — refactor `create_payment` (usar `ensureCustomerInAsaas`); nova action `cancel_payment`; nova action `sync_customer`.
- `src/components/billing/BillingInvoicesTab.tsx` — roteamento de cancelar boleto por provider.
- `src/components/contracts/ContractInvoiceActionsMenu.tsx` — idem.
- `src/hooks/useInvoiceActions.ts` — centralizar `handleCancelBoleto(invoice)` que escolhe o provider (DRY).
- `src/components/clients/ClientForm.tsx` (ou equivalente) — chamar `sync_customer` após salvar quando CNPJ mudar.
- `supabase/functions/generate-monthly-invoices/...` — guard contra duplicidade de `asaas_payment_id`.
- `CHANGELOG.md`.

## ✅ Como vou validar
1. Reproduzir: alterar CNPJ de um cliente teste, gerar boleto → confirmar que o boleto sai com CNPJ novo.
2. Clicar “Cancelar boleto” numa fatura `billing_provider=asaas` → confirmar DELETE no Asaas e limpeza dos campos.
3. Rodar `generate-monthly-invoices` duas vezes → confirmar que não cria payment duplicado.
4. Caso Calherão: re-emitir #371 e validar PDF/boleto com `87.653.887/0001-03`.

Sem mudanças destrutivas no schema. Tudo reversível.
