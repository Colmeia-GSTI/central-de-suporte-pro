# Plano de Conserto — Integração Banco Inter

> **Status:** FIXES APLICADOS (commit 5fb3377) — pendente teste em sandbox.
> **Criado:** 2026-05-23
> **Contexto:** Inter foi migrado para Asaas (07/05). Jonatas quer reativar para alguns clientes, mas a integração tinha 2 bugs que precisam ser corrigidos antes.

## Bug #1 — Pagamento não baixa automaticamente (webhook)

### Causa raiz (confirmada por código + doc oficial)
A API do Banco Inter autentica webhooks via **mTLS** (Mutual TLS) + OAuth2 — não por header customizado. Fonte oficial confirma: "A API do Banco Inter utiliza mTLS, e as chamadas são autenticadas via OAuth 2.0."

O código atual (`webhook-banco-inter/index.ts`, `verifyWebhookAuth`, linhas 90-124) **exige** um header `X-Webhook-Secret` ou `X-Webhook-Signature` que o Banco Inter **nunca envia**. Resultado: todo webhook é rejeitado com HTTP 401 → pagamento nunca baixa.

Agravante: o webhook é registrado no Inter SEM token na URL (`banco-inter/index.ts` linha 304):
```
const webhookUrl = `${SUPABASE_URL}/functions/v1/webhook-banco-inter`;
```

Como edge functions (Supabase/Lovable Cloud) **não expõem o certificado do cliente mTLS** para validação no código, mTLS real não é validável na camada da função. O padrão de mercado para esse cenário é **token na query string da URL do webhook**.

### Fix proposto
1. Registrar o webhook com token: `.../webhook-banco-inter?token=${webhook_token}` (o `webhook_token` já existe no ConfigForm mas não é usado).
2. Em `webhook-banco-inter`, trocar `verifyWebhookAuth` (header) por validação de token na query string contra `WEBHOOK_SECRET_BANCO_INTER`.
3. Manter idempotência (já existe via `webhook_events`).

**Risco:** baixo. Não altera lógica de processamento de pagamento, só a autenticação de entrada.

## Bug #2 — Boleto às vezes não gera (timeout de polling)

### Causa raiz (confirmada)
A API v3 do Inter cria boleto de forma **assíncrona**: o POST retorna só `codigoSolicitacao`; o código de barras vem depois. O código atual faz **polling síncrono dentro da edge function** (`banco-inter/index.ts` linhas 726-730): até 12 tentativas × 15s = **até 3 minutos** de espera.

Edge functions têm timeout de execução (~150s). O loop estoura o timeout antes de gravar o `updateData` (que está na linha ~820, depois do loop). Quando estoura: função morre, boleto fica sem barcode → "não gerou". É intermitente porque depende da velocidade de processamento do Inter (rápido = funciona; lento = timeout).

### Redundância nociva
Já existe a edge function `poll-services` que faz EXATAMENTE esse trabalho de forma assíncrona: busca boletos com `codigoSolicitacao` no `notes`, completa barcode + PDF. O polling inline é redundante e é a causa do timeout.

### Fix proposto
1. Em `banco-inter/index.ts`, REMOVER o loop de polling síncrono (linhas ~725-818).
2. Após criar o boleto e receber `codigoSolicitacao`, gravar imediatamente: `notes` com `codigoSolicitacao:...`, `boleto_status='pendente'`, e retornar sucesso ao usuário ("boleto em processamento, disponível em instantes").
3. Deixar o `poll-services` (assíncrono, via cron) completar barcode + PDF.

**Risco:** baixo na lógica, MAS depende de pré-requisito crítico abaixo.

### ⚠️ PRÉ-REQUISITO CRÍTICO A VERIFICAR
O `poll-services` precisa estar agendado via **pg_cron** rodando periodicamente (ex.: a cada 1-2 min). Esse cron NÃO está nas migrations versionadas — provavelmente foi criado direto no painel Supabase/Lovable. **Jonatas precisa confirmar no Supabase Dashboard → Database → Cron Jobs se existe um job chamando `poll-services`.** Se não existir, criar antes de aplicar o fix #2, senão o boleto fica pendente para sempre.

## Ordem de execução sugerida
1. **Verificar cron do `poll-services`** (pré-requisito do fix #2).
2. Aplicar fix #1 (webhook token) — destrava baixa de pagamento.
3. Aplicar fix #2 (remover polling inline) — destrava geração consistente.
4. Configurar secret `WEBHOOK_SECRET_BANCO_INTER` (se ainda não existe).
5. Re-registrar o webhook no Inter (botão "register_webhook" do ConfigForm) com a nova URL com token.
6. Testar em sandbox antes de produção.

## O que NÃO está quebrado (preservar)
- OAuth com fallback de scopes (individual → combinado): correto.
- Criação do cliente mTLS (`createMtlsClient`): correto.
- Payload do boleto (pagador, valorNominal, dataVencimento com auto-ajuste): correto.
- Detecção de duplicidade: correto.
- Idempotência do webhook via `webhook_events`: correto.

## Escopo
Conserto de integração bancária — separado da refatoração estrutural. A consolidação do `BancoInterConfigForm` no hook `useIntegrationSettings` fica em segundo plano; o conserto dos bugs tem prioridade e risco diferentes.
