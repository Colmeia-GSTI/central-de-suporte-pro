# Referências externas — APIs e serviços de terceiros

Ponto único para a **documentação oficial** de cada serviço externo que o projeto consome.
Existe porque nenhum agente consegue adivinhar essas URLs, e procurá-las a cada sessão
queima contexto e às vezes acha a versão errada da API.

**Escopo deste arquivo:** link oficial, modelo de autenticação, ambientes e armadilhas de API.
**Não** duplica: quais edges usam o quê, webhooks e secrets — isso está na matriz de integrações
em [`docs/agents/_transversais.md`](agents/_transversais.md) §4.

> Ao adicionar uma integração nova, acrescente a linha aqui **e** na matriz do `_transversais.md`.

---

## Plataforma

| Serviço | Documentação oficial | Observação |
|---|---|---|
| **Lovable / Lovable Cloud** | https://docs.lovable.dev | O backend deste projeto. Supabase = Lovable Cloud, não é projeto Supabase autônomo. |
| **Supabase** | https://supabase.com/docs | Útil para RLS, Auth, Storage, Realtime e Edge Functions. Painel/CLI do Supabase **não** é o caminho aqui — ver AGENTS.md §4. |
| **Deno** (runtime das edges) | https://docs.deno.com | Imports via `npm:` e `https://deno.land/std@…`. |

---

## Pagamento e fiscal

### Asaas — cobrança (boleto/PIX) e NFS-e
- **Docs:** https://docs.asaas.com
- **Ambientes:** sandbox e produção têm base URLs distintas; o ambiente vem de
  `integration_settings(asaas).environment`. Conferir o ambiente antes de investigar qualquer
  cobrança "sumida" — é a causa mais comum de divergência.
- **Auth:** header `access_token` com a API key da conta (não é `Bearer`).
- **Webhook:** entra por `webhook-asaas-nfse?token=…`; eventos `PAYMENT_*` e `INVOICE_*`.
- **Armadilhas conhecidas:**
  - `E0014` = DPS duplicada — a nota já existe no provedor; vincular a existente em vez de reemitir.
  - Cancelamento de NFS-e é negado pela prefeitura após ~35–45 dias (`E0822`).
  - Falha genérica "non-2xx" na emissão quase sempre é **cliente sem endereço/CEP**
    (`CLIENT_INCOMPLETE_DATA`) — corrigir o cadastro via `cnpj-lookup`.
  - Códigos de serviço **preservam zeros à esquerda** (`010701` ≠ `10701`).

### Banco Inter — boleto e PIX
- **Docs:** https://developers.inter.co
- **Auth:** OAuth2 client credentials **com mTLS** (certificado + chave privada por requisição).
  É o que torna essa integração frágil: certificado vencido derruba tudo silenciosamente.
- **Escopos:** cada operação exige escopo habilitado no painel do Inter; escopo faltando
  retorna 403 com mensagem genérica.
- **Status no projeto:** parcial — o caminho principal de cobrança hoje é o Asaas.

### Regras fiscais brasileiras
Retenções e regras de cobrança são **nossas**, não da API: `src/lib/nfse-retencoes.ts`,
`src/lib/billing-fsm.ts` e [`docs/REGRAS_DE_COBRANCA.md`](REGRAS_DE_COBRANCA.md) (canônico).

---

## Mensageria

| Serviço | Documentação oficial | Auth | Notas |
|---|---|---|---|
| **Resend** (e-mail) | https://resend.com/docs | `Authorization: Bearer <RESEND_API_KEY>` | Webhook de status assinado via **Svix** (https://docs.svix.com). Domínio precisa estar verificado ou o envio falha silenciosamente. |
| **Evolution API** (WhatsApp) | https://doc.evolution-api.com | header `apikey` | Self-hosted: a URL vem de `integration_settings(evolution_api).api_url`. Número precisa de DDI 55 — use `phoneToWhatsApp()` de `src/lib/phone.ts`. |
| **Telegram Bot API** | https://core.telegram.org/bots/api | token na URL (`/bot<token>/…`) | `chat_id` do destinatário precisa ter iniciado conversa com o bot antes. |
| **Web Push (VAPID)** | https://developer.mozilla.org/docs/Web/API/Push_API · RFC 8292 | par de chaves VAPID | Service worker manual em `public/sw-push.js` (separado do SW do Workbox/PWA). |

---

## Monitoramento

| Serviço | Documentação oficial | Auth | Notas |
|---|---|---|---|
| **Tactical RMM** | https://docs.tacticalrmm.com | API key em header | URL da instância vem de `integration_settings(tactical_rmm)`. |
| **CheckMK** | https://docs.checkmk.com | usuário + secret (automation user) | REST API sob `/check_mk/api/1.0/`. |
| **UniFi Network** | https://developer.ui.com | login de sessão (cookie) ou API key de site | Controladora on-prem atrás de firewall é acessada pelo **relay Hermes** (`relay-unifi/`, ver [RUNBOOK_HERMES.md](../relay-unifi/RUNBOOK_HERMES.md)); controladora alcançável usa o modo `direct`. Os dois caminhos são intencionais. |

---

## Consulta de dados

| Serviço | Documentação oficial | Notas |
|---|---|---|
| **ReceitaWS** (CNPJ) | https://receitaws.com.br/api | Tier gratuito com **rate limit agressivo** (~3 req/min). Consumido por `cnpj-lookup`. |
| **BCB SGS** (índices econômicos) | https://dadosabertos.bcb.gov.br | API pública, sem auth. Séries do SGS alimentam o reajuste de contrato (`fetch-economic-indices`). |
| **Google Calendar API v3** | https://developers.google.com/calendar/api | OAuth2. Integração **incompleta por design** — OAuth existe, o callback/sync não foi fechado. |

---

## Como investigar uma integração quebrada

1. **Qual edge?** Matriz em [`_transversais.md`](agents/_transversais.md) §4.
2. **Qual segredo/config?** Mesma matriz — a maioria vive em `integration_settings`, não em env.
3. **Ambiente certo?** Sandbox vs produção (Asaas), URL da instância (Evolution, RMM, CheckMK).
4. **Webhook chegando?** Provedor externo exige `verify_jwt = false` em `supabase/config.toml`;
   sem isso o provedor leva 401 e o evento se perde **sem erro visível**.
5. **Logs:** `application_logs` e `webhook_events` no banco (via MCP do Lovable, SELECT).
