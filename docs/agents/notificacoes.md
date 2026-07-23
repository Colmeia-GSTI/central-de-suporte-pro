# Notificações e Comunicação

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo saudável e amplamente usado. As 8 edge functions são primitivas de transporte (send-email-resend, send-push-notification, send-whatsapp, send-telegram, validate-whatsapp) e webhooks de status (resend/telegram/whatsapp), orquestradas por ~17 funções de negócio (send-ticket-notification, notify-sla-breach, notify-due-invoices, send-nfse-notification, etc.). O frontend cobre in-app (useNotifications+NotificationDropdown), Web Push nativo (usePushNotifications+sw-push.js) e preferências de canal (NotificationSettings). Achado principal: os 3 webhooks de status não estão em config.toml (herdam verify_jwt=true) e provavelmente rejeitam os provedores externos com 401; webhook-telegram-status é stub e send-telegram não grava message_logs. A edge "send-notification" citada nos docs NÃO existe no repositório.

## Integrações

- Resend (e-mail) — RESEND_API_KEY, RESEND_WEBHOOK_SECRET, integration_settings(resend: default_from_name/email); saída send-email-resend, entrada webhook-resend-status (Svix)
- Evolution API (WhatsApp) — integration_settings(evolution_api: api_url/api_key/instance_name), WEBHOOK_SECRET_WHATSAPP; send-whatsapp/validate-whatsapp, entrada webhook-whatsapp-status
- Telegram Bot API — integration_settings(telegram: bot_token/default_chat_id), WEBHOOK_SECRET_TELEGRAM; send-telegram, entrada webhook-telegram-status (stub)
- Web Push (VAPID) — VAPID_PRIVATE_KEY (backend) + chave pública fixa no frontend/edge; push_subscriptions; sw-push.js
- Tabelas: notifications (in-app), message_logs (e-mail/whatsapp), push_subscriptions, suppressed_emails, webhook_events, audit_logs, integration_settings, email_settings/company_settings/email_templates

## Fluxos (rota → componente → hook → edge → tabela)

- IN-APP (leitura): AppLayout -> NotificationDropdown -> useNotifications -> SELECT/UPDATE/DELETE notifications (realtime via useUnifiedRealtime)
- IN-APP (escrita): edges orquestradoras (send-alert-notification:307, notify-sla-breach:143/260, notify-due-invoices:353, check-no-contact-tickets:154/228, webhook-asaas-nfse:179, generate-monthly-invoices:1123, apply-contract-adjustment:151) -> INSERT notifications
- WEB PUSH: ProfilePage -> NotificationSettings (Testar Push) -> invoke send-push-notification -> SELECT push_subscriptions (por user_ids/role_filter) -> POST endpoint push (VAPID) -> sw-push.js exibe; subscribe/unsubscribe via usePushNotifications -> push_subscriptions
- EMAIL (saída): edge consumidora monta HTML (email-helpers) -> invoke send-email-resend -> filtra .internal/suppressed_emails -> POST api.resend.com/emails -> INSERT message_logs (sent/failed/external_message_id)
- EMAIL (entrada): Resend/Svix -> webhook-resend-status -> valida HMAC + dedup webhook_events -> UPDATE message_logs (delivered/read/failed) + upsert suppressed_emails
- WHATSAPP (saída): edge/ConfigForm -> invoke send-whatsapp -> integration_settings(evolution_api) -> POST /message/sendText/{instance} -> message_logs (se userId)
- WHATSAPP (validação): ClientForm -> invoke validate-whatsapp -> POST /chat/whatsappNumbers -> {valid,exists,jid}
- WHATSAPP (entrada): Evolution -> webhook-whatsapp-status -> UPDATE message_logs (delivered_at/read_at) + audit_logs
- TELEGRAM (saída): edge/TelegramConfigForm -> invoke send-telegram -> integration_settings(telegram) -> POST api.telegram.org/bot<token>/sendMessage (sem message_logs)
- TELEGRAM (entrada): Telegram -> webhook-telegram-status -> valida segredo -> INSERT audit_logs (stub, sem processamento)

## Regras de negócio

- Supressão de e-mail: descarta placeholders '.internal' e endereços em suppressed_emails (hard bounce/spam); bloqueados são logados como 'failed' (constraint não tem 'suppressed') — send-email-resend/index.ts:177,180-201,190
- Retorno 200 'skipped' quando todos os destinatários são inelegíveis — send-email-resend/index.ts:204-209
- Rate-limit e-mail 10 req/s por IP (429) — send-email-resend/index.ts:56-70,96
- Sanitização de HTML (remove script/on*/javascript:/iframe/embed) e limites (subject 200, html 50000, 50 destinatários) — send-email-resend/index.ts:4-7,43-53
- Resend webhook fail-closed sem RESEND_WEBHOOK_SECRET; valida assinatura Svix HMAC-SHA256 — webhook-resend-status/index.ts:47-51,67-85
- Idempotência do webhook Resend por svix-id em webhook_events (at-least-once) — webhook-resend-status/index.ts:152-167,228-234
- Status só avança (STATUS_RANK), nunca regride; failed(bounce/complaint) sempre aplica — webhook-resend-status/index.ts:105-113,179-206
- Bounce/complaint alimentam suppressed_emails (upsert por email) — webhook-resend-status/index.ts:210-225
- WhatsApp: telefone válido 10-15 dígitos; mensagem truncada em 4096 — send-whatsapp/index.ts:129-135,138
- WhatsApp: retry 3x com delays [0,3000,10000]ms apenas em 5xx/rede; grava message_logs só se userId — send-whatsapp/index.ts:153-194,228-241
- validate-whatsapp: prefixa 55 se ausente e valida 12-13 dígitos — validate-whatsapp/index.ts:98-112
- Push: remove subscriptions apenas em 404/410 (gone), não em outros erros — send-push-notification/index.ts:341,481-493
- Push: alvo por user_ids ou role_filter (via user_roles); defaults/ações por tipo (ticket/alert/sla/test) — send-push-notification/index.ts:381-394,424-452
- Push re-sync: se o browser tem subscription mas o DB não, faz upsert em push_subscriptions — usePushNotifications.ts:108-127
- webhook-whatsapp-status mapeia ACK Evolution -> status message_logs (delivered_at/read_at) — webhook-whatsapp-status/index.ts:89-106
- Telegram: fallback para default_chat_id e parse_mode Markdown — send-telegram/index.ts:63,65
- Preferências locais (notify_push/notify_sound/alert_*) persistidas em localStorage; canais (email/whatsapp/telegram + números) no perfil/DB — ProfilePage.tsx:44 vs NotificationSettings.tsx:44-50

## Arquivos-chave

- `src/hooks/useNotifications.tsx` — Hook TanStack Query para notificações in-app: lê últimas 50, marca lida/todas, limpa; realtime delegado a useUnifiedRealtime.
- `src/hooks/usePushNotifications.ts` — Hook de Web Push nativo: checa suporte/permissão, subscribe/unsubscribe, registra sw-push.js e persiste em push_subscriptions; re-sincroniza DB se o browser tem sub e o DB não.
- `src/components/notifications/NotificationDropdown.tsx` — UI do sino: badge de não-lidas, lista com ícone por tipo, marcar/limpar, navegação por related_type/related_id.
- `src/components/profile/NotificationSettings.tsx` — UI de canais (push nativo, push-toast, som, email, WhatsApp, Telegram) + tipos de alerta; botão 'Testar Push' invoca send-push-notification. Exporta NotificationPreferences e defaultLocalPrefs.
- `src/components/profile/PushPermissionBlockedCard.tsx` — Card com instruções por navegador quando a permissão de notificação está bloqueada + botão re-verificar.
- `public/sw-push.js` — Service worker de push: exibe notificação no evento 'push', foca/abre janela no 'notificationclick'.
- `supabase/functions/send-email-resend/index.ts` — Transporte de e-mail via Resend: sanitiza HTML/assunto, filtra .internal e suppressed_emails, rate-limit 10/s por IP, resolve remetente, grava message_logs (sent/failed + external_message_id).
- `supabase/functions/send-push-notification/index.ts` — Transporte Web Push (VAPID/ECDSA + AES-128-GCM manual); alveja por user_ids ou role_filter; remove subscriptions só em 404/410; tags/ações por tipo.
- `supabase/functions/send-whatsapp/index.ts` — Transporte WhatsApp via Evolution API (sendText): valida telefone 10-15 dígitos, rate-limit 10/s, retry 3x (só 5xx) delays [0,3000,10000], grava message_logs quando userId presente.
- `supabase/functions/send-telegram/index.ts` — Transporte Telegram Bot API (sendMessage), fallback default_chat_id, parse_mode Markdown. NÃO grava message_logs.
- `supabase/functions/validate-whatsapp/index.ts` — Consulta Evolution /chat/whatsappNumbers para confirmar se número tem WhatsApp; normaliza +55.
- `supabase/functions/webhook-resend-status/index.ts` — Webhook de status Resend: valida Svix HMAC (fail-closed), dedup por svix-id em webhook_events, avança status sem regressão em message_logs, alimenta suppressed_emails em bounce/complaint. _(uso: parcial)_
- `supabase/functions/webhook-telegram-status/index.ts` — Webhook Telegram: valida X-Webhook-Secret/HMAC (fail-closed) e grava audit_logs. Stub — não atualiza message_logs (Telegram sem read receipts). _(uso: parcial)_
- `supabase/functions/webhook-whatsapp-status/index.ts` — Webhook Evolution: mapeia ACKs PENDING/SERVER_ACK/DELIVERY_ACK/READ/PLAYED -> UPDATE message_logs (delivered_at/read_at) + audit_logs. _(uso: parcial)_
- `supabase/functions/_shared/email-helpers.ts` — Helpers de e-mail compartilhados: corsHeaders, getEmailSettings, wrapInEmailLayout, replaceVariables, applyNotificationMessage(+Text), buildPaymentSectionHtml, getEmailTemplate, formatadores BRL/data.
- `supabase/functions/_shared/notification-logger.ts` — logInvoiceNotification -> insere em invoice_notification_logs (escopo faturamento, não deste módulo). _(uso: parcial)_
- `supabase/functions/_shared/email-templates/{signup,invite,magic-link,recovery,email-change,reauthentication}.tsx` — Templates JSX (react-email) dos e-mails de autenticação do Supabase.

## Pontos de atenção / riscos

- RISCO ALTO (confirmado no código): webhook-resend-status, webhook-telegram-status e webhook-whatsapp-status não estão em supabase/config.toml -> herdam verify_jwt=true. Provedores externos (Svix/Resend, Evolution, Telegram) não enviam JWT Supabase -> 401 no gateway antes da validação HMAC interna. Consequência: status delivered/read/bounce e alimentação de suppressed_emails via webhook podem nunca ocorrer. Só send-whatsapp tem verify_jwt=false entre as edges do módulo. (Não corrigível por mim: config.toml/deploy fora do escopo somente-leitura.)
- Chave VAPID pública duplicada e hardcoded em usePushNotifications.ts:9 e send-push-notification/index.ts:10 — duas fontes; se rotacionar uma sem a outra, o push quebra silenciosamente.
- send-telegram não grava message_logs (nem external_message_id) e webhook-telegram-status é stub -> canal Telegram fica sem rastreamento de entrega, ao contrário de email/whatsapp.
- Inconsistência menor: validate-whatsapp usa .single() em integration_settings (erro se 0 linhas) enquanto send-whatsapp usa .maybeSingle().
- corsHeaders é redefinido inline em quase todas as edges do módulo em vez de importar o de _shared/email-helpers.ts (que já exporta um mais completo) — pequena duplicação.
- send-push-notification e send-telegram usam import antigo std@0.168.0/http/server (serve) enquanto send-email-resend usa Deno.serve; validate-whatsapp usa std@0.190.0 — versões de runtime divergentes entre funções irmãs.
- message_logs constraint de status não inclui 'suppressed' (marcada com comentário ponytail em send-email-resend:190); e webhook-resend-status grava status 'read' em email.opened, colidindo semanticamente com 'read' de WhatsApp — ambos convivem no mesmo enum.

## Notas de divergência (auditoria vs MAPA antigo)

- send-notification: MAPA a trata como edge existente e afirma que 'grava message_logs' (linhas 993 e 1126) ao mesmo tempo que a chama de 'código morto' (469, 1413). Realidade: NÃO existe nenhum arquivo/diretório send-notification no repo — é referência fantasma; a afirmação de que grava message_logs é incorreta.
- Contagem 'Notificações e Comunicação (10)' (MAPA 469/1413) inclui a phantom send-notification e a batch-collection-notification (escopo faturamento); edges reais de transporte/webhook do módulo = 9 existentes (8 do escopo + as webhooks). O total infla por conta do item inexistente.
- send-email-resend '(+16 consumidoras)' (MAPA 992): a contagem real de invokers é ~17 (forgot-password, reset-password, invite-user, resend-invite, resend-confirmation, notify-due-invoices, resend-payment-notification, batch-collection-notification, send-nfse-notification, send-ticket-notification, send-alert-notification, check-no-contact-tickets, generate-monthly-invoices, generate-invoice-payments, webhook-asaas-nfse, webhook-banco-inter, ResendConfigForm).
- CONFERE (não é divergência, apenas confirmação): MAPA já identifica corretamente que webhook-resend-status/telegram/whatsapp-status estão fora de config.toml herdando verify_jwt=true (linhas 1107/1159/1429), que webhook-telegram-status é stub (1136) e que send-telegram não grava message_logs (1126). O código confirma os três pontos; a correção proposta ainda NÃO foi aplicada.

