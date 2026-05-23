# Plano Técnico — Robustez da Integração Resend (Colmeia HD Pro)

> **Status:** PLANO (não executado). Decisão de 2026-05-23: manter Resend (arquitetura oficial Lovable para transacional com anexo) e investir em confiabilidade, em vez de migrar para Lovable Custom Emails.
> **Princípio:** reutilizar o que existe; construir só a lacuna. Cada seção começa pelo estado atual auditado.

## Sumário executivo

Auditoria revelou que ~60% do que se pediria num "redesenho de email" **já existe e funciona**: editor de templates, variáveis `{{}}`, sanitização XSS, validação, logging, CSS inline, teste de envio. As lacunas reais de confiabilidade são **4**, e há **5 pontos cegos** (não pedidos, mas críticos para entrega confiável). Este plano ataca lacunas + pontos cegos, sem recriar o que funciona.

---

## Estado atual (auditado)

| Capacidade | Estado | Onde |
|---|---|---|
| Config from_name/email + validação + teste | ✅ Existe | `ResendConfigForm.tsx` |
| API key em secret (não no banco) | ✅ Correto | `RESEND_API_KEY` |
| Editor de templates + preview | ✅ Existe | `EmailTemplateEditor.tsx`, `EmailTemplatesTab.tsx` |
| Variáveis `{{var}}` + condicionais `{{#var}}` | ✅ Existe | `email-helpers.ts:replaceVariables` |
| CSS inline / layout | ✅ Existe | `email-helpers.ts:wrapInEmailLayout` |
| Sanitização XSS (script/on*/javascript:) | ✅ Existe | `send-email-resend.ts:sanitizeHtml` |
| Validação de destinatários | ✅ Existe | `send-email-resend.ts:sanitizeEmails` |
| Logging em `message_logs` | ✅ Existe | `send-email-resend.ts` |
| Schema de status (pending/sent/delivered/read/failed + delivered_at/read_at/error_message) | ✅ Existe | tabela `message_logs` |
| Captura de status do Resend (webhook) | ❌ **LACUNA** | não existe `webhook-resend-status` |
| Retry / reenvio em falha transitória | ❌ **LACUNA** | `send-email-resend` não tem retry |
| Tratamento de bounce / supressão | ❌ **LACUNA** | bounces não são capturados nem suprimidos |
| UI de logs/erros de email para o admin | ❌ **LACUNA** | sem painel consolidado |

Observação: já existe o padrão de webhook de status para **WhatsApp** (`webhook-whatsapp-status`) e **Telegram** (`webhook-telegram-status`) atualizando `message_logs`. O webhook do Resend deve **espelhar esse padrão** (reutilização).

---

## LACUNA 1 — Captura de status de entrega (webhook-resend-status)

**Problema:** hoje o sistema dispara o email e não sabe o que aconteceu. Resend envia eventos (`email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`) mas ninguém os captura.

**Solução (reutiliza padrão WhatsApp/Telegram):**
- Nova edge function `webhook-resend-status` que recebe o webhook do Resend, valida assinatura (Svix — Resend usa Svix para assinar webhooks; header `svix-id`/`svix-signature`/`svix-timestamp`), mapeia o evento para o status de `message_logs` e atualiza a linha correspondente.
- Match da linha: o `external_message_id` salvo no envio (id do Resend) casa com o `email_id` do evento.
- Mapa de eventos → status: `delivered`→`delivered` (+`delivered_at`), `opened`→`read` (+`read_at`), `bounced`/`complained`→`failed` (+`error_message`).
- Idempotência: usar `webhook_events` (padrão já existente no projeto) para não processar o mesmo evento 2x.

**Config:** registrar a URL do webhook no dashboard do Resend + secret `RESEND_WEBHOOK_SECRET` (Svix signing secret). Adicionar à `ResendConfigForm` a exibição da URL do webhook (somente leitura, com botão copiar) — sem expor secret.

## LACUNA 2 — Retry em falha transitória

**Problema:** se o Resend retornar 429 (rate limit) ou 5xx (erro temporário), o email simplesmente falha. Sem retry.

**Solução:** no `send-email-resend`, envolver a chamada `fetch` num retry com backoff exponencial (ex.: 3 tentativas: 0s, 2s, 5s) APENAS para status 429 e 5xx (não para 4xx de validação, que são erro permanente). Logar cada tentativa. Se esgotar, gravar `status=failed` com o motivo.

**Atenção:** edge function tem timeout (~150s). 3 tentativas com backoff curto cabem. Não fazer retry longo inline (lição do bug do Banco Inter — polling longo estoura timeout).

## LACUNA 3 — Supressão de bounces

**Problema:** se o email de um cliente quica (endereço inválido), o sistema continua tentando enviar pra ele toda vez — prejudica reputação do domínio (Resend pode bloquear o sender).

**Solução:**
- Tabela `suppressed_emails` (email, reason, suppressed_at, source).
- Quando `webhook-resend-status` recebe `bounced` (hard bounce) ou `complained` (spam), insere o email na tabela.
- `send-email-resend` consulta `suppressed_emails` antes de enviar; se suprimido, pula com `status=failed`/motivo `suppressed` (não tenta o Resend).
- UI: na tela de email, listar suprimidos com opção de remover manualmente (cliente corrigiu o email).

## LACUNA 4 — Painel de logs/erros para o admin

**Problema:** já existe `message_logs` e até `InvoiceNotificationHistory`, mas não há visão consolidada de "todos os emails e seus status" para o admin diagnosticar.

**Solução:** reutilizar/estender o que existe. Verificar `InvoiceNotificationHistory` e, se possível, generalizar para um painel de email em `/settings` que lê `message_logs WHERE channel='email'` com filtros (status, período, destinatário, tipo). NÃO criar tabela nova — `message_logs` já tem tudo.

---

## PONTOS CEGOS (não pediu, mas importam para confiabilidade real)

### PC1 — Verificação de domínio e DNS (SPF/DKIM/DMARC)
Sem SPF/DKIM/DMARC corretos no domínio `suporte.colmeiagsti.com`, emails caem em spam — independente de todo o resto. **Verificar o status do domínio no Resend** e confirmar os registros DNS. Isto é pré-requisito de entrega; de nada adianta retry se o email vai pra spam. (Ação de infra, não código.)

> **VERIFICADO em 2026-05-23 (via DNS-over-HTTPS):** autenticação está CORRETA e completa, no padrão Resend de duas camadas:
> - DKIM presente em `resend._domainkey.suporte.colmeiagsti.com` ✅
> - SPF (`v=spf1 include:amazonses.com ~all`) + MX (`feedback-smtp.sa-east-1.amazonses.com`) em `send.suporte.colmeiagsti.com` ✅ (return-path/bounce — Resend roda sobre Amazon SES)
> - O `from` `noreply@suporte.colmeiagsti.com` é autenticado por DKIM; NÃO há mismatch (o "SPF ausente na raiz" é esperado nesse modelo).
> - DMARC presente: `v=DMARC1; p=none; rua=mailto:dmarcreports@lovable.dev` — único ajuste recomendado (cosmético/baixa prioridade): trocar o `rua` para um email da Colmeia (hoje os relatórios DMARC vão para o Lovable, resíduo da config de Custom Emails) e, no futuro, considerar `p=quarantine`.
> **Conclusão:** entrega não está comprometida por autenticação. PC1 OK.

### PC2 — Idempotência de envio
Se uma edge function falhar no meio e for re-disparada (cron, retry do chamador), pode enviar o mesmo email 2x. Hoje não há `idempotency_key`. **Propor:** aceitar um `idempotency_key` opcional no `send-email-resend` e checar `message_logs` antes de reenviar (dedupe por chave + janela de tempo). O Resend também aceita `Idempotency-Key` header nativamente — usar.

### PC3 — Rate limit do Resend
O Resend tem limite (plano free: 100/dia, ~2/s). Geração mensal de faturas dispara N emails em rajada. **Propor:** throttle no envio em lote (espaçar) ou usar fila. Hoje `generate-monthly-invoices` pode estourar o limite e perder envios silenciosamente.

### PC4 — Reply-To e bounce address
Emails transacionais devem ter `Reply-To` configurado (cliente responde a fatura e vai pra um inbox monitorado, não pro vazio). Verificar se está setado. Bounces idealmente vão para um endereço monitorado.

### PC5 — Preview/teste de template com dados reais
O editor de template existe, mas (como a doc do Lovable apontou) testar com dados reais é difícil. **Propor:** botão "enviar teste com dados de exemplo" em cada template, que renderiza com um payload fake e manda pro admin — pega erro de variável/layout antes de ir pro cliente.

---

## Estrutura de banco proposta (mínima — reutiliza o que há)

- **Reutiliza:** `message_logs` (status, delivered_at, read_at, error_message, external_message_id) — já tem tudo para tracking.
- **Reutiliza:** `webhook_events` (idempotência).
- **Nova:** `suppressed_emails` (email TEXT PK, reason TEXT, source TEXT, suppressed_at TIMESTAMPTZ) — única tabela nova necessária.
- **Templates:** já versionados/editáveis pelo sistema atual; não precisa de tabela nova (confirmar onde são persistidos hoje).

## Ordem de execução sugerida (faseada, baixo risco)

1. **PC1 (DNS/domínio)** — pré-requisito de tudo. Verificar antes de investir em código.
2. **Lacuna 1 (webhook-resend-status)** — maior ganho: passa a saber entrega/bounce/abertura. Reutiliza padrão existente.
3. **Lacuna 3 (supressão)** — depende da Lacuna 1 (o webhook alimenta a tabela).
4. **Lacuna 2 (retry)** + **PC2 (idempotência)** + **PC3 (rate limit)** — robustez de envio, juntas no `send-email-resend`.
5. **Lacuna 4 (painel)** + **PC5 (teste de template)** — UX/observabilidade.

## Testes críticos a cobrir
- `webhook-resend-status`: cada tipo de evento mapeia para o status certo; assinatura inválida é rejeitada; evento duplicado é idempotente.
- `send-email-resend`: retry só em 429/5xx (não em 4xx); email suprimido não é enviado; idempotency_key evita duplicata; sanitização XSS mantida.
- Integração: fatura → envio → webhook delivered → `message_logs` atualizado.

## O que este plano NÃO faz (evitar recriar)
- NÃO recria editor de templates (existe).
- NÃO recria sistema de variáveis (existe).
- NÃO recria config/validação/teste de envio (existe).
- NÃO migra para Lovable Custom Emails (decidido: não suporta anexo + footer forçado + reescrita de templates).
