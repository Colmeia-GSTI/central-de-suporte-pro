# Domínios transversais — Central de Suporte Pro (Colmeia)

> Referência transversal da hierarquia **[AGENTS.md](../../AGENTS.md)**. Reúne o que NÃO é específico de um módulo: painel de maturidade, **registro de alterações de banco** (log operacional — mantenha atualizado aqui), snapshot de crons, matriz/detalhe de integrações, mapa de edge functions e riscos transversais.
> Conteúdo migrado de `docs/MAPA_DE_SETORES.md` (seções §2, §2.1, §4–§7) na consolidação de 2026-07-21. O detalhamento por setor foi para `docs/agents/<módulo>.md`; a auditoria completa está em [docs/audit/AUDITORIA_2026-07-21.md](../audit/AUDITORIA_2026-07-21.md).

---

## 2. Indice de Setores

| Setor | Responsabilidade resumida | Maturidade | Integracoes |
|---|---|---|---|
| Autenticacao, Usuarios e Permissoes | Identidade, login, convites, RBAC granular, deteccao de anomalias | em progresso | Supabase Auth, Resend, Lovable Email, pg_cron |
| Chamados / Tickets e SLA | Ciclo de vida de chamados, atendimento, SLA, notificacao multicanal | parcial | Resend/SMTP, Evolution, Telegram, Web Push, Postgres |
| Clientes e Documentacao Tecnica | CRUD de clientes, dossie tecnico em 14 secoes, sync de dispositivos | parcial | ReceitaWS, Tactical RMM, UniFi, validate-whatsapp |
| Contratos e Reajustes | Reajuste anual, indices economicos, renegociacao | parcial | BCB SGS, Asaas (indireto), pg_cron |
| Faturamento e Cobranca | Geracao de faturas, boleto/PIX, NFS-e, inadimplencia | em progresso | Asaas, Banco Inter, Resend, WhatsApp, poll-services |
| NFS-e e Certificados Digitais | Emissao/cancelamento de NFS-e, certificados A1 | em progresso | Asaas API, Resend, WhatsApp, Supabase Storage, node-forge |
| Monitoramento e Servicos (RMM/UniFi/CheckMK) | Agregacao de devices/alertas de 3 fontes externas | parcial | Tactical RMM, CheckMK, UniFi, Evolution, Telegram, Resend |
| Notificacoes e Comunicacao | Entrega multicanal e rastreamento de status | parcial | Resend, Evolution, Telegram, Web Push, Svix |
| Calendario e Agendamento | Agenda interna da equipe, OAuth Google (desconectado do CRUD) | parcial | Google Calendar API v3 |
| Inventario | Ativos e licencas de software, visao geral de monitoramento | precisa-revisao | Supabase Postgres, RPC get_license_key |
| Base de Conhecimento | Artigos Markdown, busca, feedback, sugestoes em chamados | parcial | Supabase Storage |
| Relatorios, Dashboards e Exportacao | Dashboards, relatorios, TV Dashboard, exportacao CSV/Excel/JSON | parcial | Nenhuma externa direta (recharts) |
| Gamificacao | Ranking de tecnicos, badges, metas (read-only) | precisa-revisao | Nenhuma |
| Portal do Cliente | Area autenticada do cliente: chamados, financeiro, avaliacao | parcial | Supabase Auth/Postgres, RPC open_client_portal_ticket |
| Configuracoes, Feature Flags e UI de Integracoes | Centro de config, flags, UI de todas as integracoes | parcial | Todas (UI), Supabase Storage |
| Auditoria, Seguranca e Logs | Trilha de auditoria, logs de app, detector de anomalias | parcial | Supabase Auth Admin, pg_cron |
| Banco de Dados, Migrations e Schema | Schema versionado, RLS, RPCs, Vault | solido | Supabase Auth, Vault, todas as integracoes (schema) |
| Infraestrutura, Build, PWA e Testes | Build, PWA, shell de UI, cliente Supabase, testes | parcial | Supabase, Web Push, Workbox, Lovable |

> **Este é o painel de progresso.** A coluna **Maturidade** acima é a fonte de verdade do status de cada setor — atualize-a conforme avançamos. Critérios e ordem abaixo.

---

## 2.1 Processo de Evolução dos Setores

Objetivo: deixar **todos os setores `🟢 sólidos`**, um de cada vez, sem regredir os já estáveis.

### Escada de maturidade
`🔴 precisa-revisão` → `🟡 parcial` → `🔵 em progresso` → `🟢 sólido`

> Ao começar a trabalhar um setor, marque a Maturidade dele como `em progresso` na tabela acima; ao concluir os critérios, promova para `solido`.

### Definição de "Sólido" (checklist de graduação)
Um setor só vira `🟢 sólido` quando **todos** os itens abaixo estiverem verdadeiros:
- [ ] Checklist de verificação do setor (seção 3) 100% resolvido
- [ ] Sem bugs conhecidos; contratos de payload (caller ↔ edge function) corretos
- [ ] RLS das tabelas do setor revisada e correta
- [ ] Integrações do setor testadas ponta a ponta
- [ ] Sem código morto/redundância; lógica testável extraída (`logic.ts`/libs) + testes
- [ ] Segredos fora do frontend / texto plano (quando aplicável)
- [ ] Crons relevantes versionados e confirmados ativos
- [ ] Seção do setor neste mapa atualizada (incluindo correções descobertas)

### Princípios (ver `CLAUDE.md` §6.0)
Reutilizar antes de criar · evitar redundância · otimizar com critério · limpar ao passar · manter organizado.

### Ordem de ataque acordada
0. **Ajuste rápido — Contratos**: na listagem, exibir CNPJ e apelido ao lado do nome do cliente. ✅ _(feito)_
1. **Fundação** — Autenticação/Usuários → Banco de Dados/Schema → Infraestrutura.
2. **Dinheiro** — Faturamento/Cobrança → NFS-e/Certificados. _(em progresso — Fase 1: enum vs código ✅)_
3. **Riscos transversais** — crons versionados, `verify_jwt` dos webhooks, segredos em texto plano.
4. **Maturidade** — Inventário e Gamificação (subir o piso), depois os demais setores `parcial` restantes.

### Registro de alterações no banco (via Lovable MCP)
> Como mudanças de banco são aplicadas via Lovable MCP (não pelo git), registre aqui cada alteração para manter auditável.

| Data | Objeto | Alteração | Setor |
|---|---|---|---|
| 2026-06-29 | `change_user_role()` | Guarda contra remover o último admin (evita lockout) | 1 - Auth |
| 2026-07-08 | `clients` (7 registros) | Backfill de `address`/`zip_code` (dados da Receita) — CVR, RUARO, CALHERRÃO matriz+filial, BLEND, FSB, JG DISTRIBUIDORA; corrige falha `CLIENT_INCOMPLETE_DATA` na emissão de NFS-e | Faturamento/NFS-e |
| 2026-07-08 | enum `email_processing_status` | `+ 'aguardando_nfse'` (estado do e-mail retido para envio consolidado boleto+nota) | Faturamento |
| 2026-07-09 | `nfse_history.reissue_pending` | Nova coluna `boolean NOT NULL DEFAULT false` (gatilho da reemissão assíncrona de NFS-e por ajuste de valor) | Faturamento/NFS-e |
| 2026-07-09 | `invoices` #663 (TOPOMEN) | Correção de valor `1500 → 750` (contrato revertido) + `nfse_status = NULL` (contrato sem NFS-e); auditado em `audit_logs` (`invoice_value_adjusted`) | Faturamento |
| 2026-07-10 | `invoices` (62 registros) | Desarme de duplicação: `auto_nfse_emitted = true` em toda fatura com NFS-e viva e flag falsa (bug 4b4d552: geração emitia sem marcar a flag; webhook re-emitia no pagamento) | Faturamento/NFS-e |
| 2026-07-10 | `nfse_history` (49 notas) | Cancelamento em lote via action `cancel` do asaas-nfse: 46 duplicatas (mantida a 1ª nota de cada fatura) + 3 de mar/2026 com alíquota 0% (mantida a reemissão correta). Desfecho: 32 canceladas na prefeitura; 17 negadas (E0822 fora do prazo) → soft-archive (`is_active=false` + `archived_reason`) e relatório ao contador. Auditado em `nfse_cancellation_log` | Faturamento/NFS-e |
| 2026-07-10 | `uq_nfse_history_active_per_invoice` | Índice único parcial em `nfse_history(invoice_id) WHERE is_active AND status IN ('autorizada','processando','pendente')` — garantia dura contra NFS-e duplicada por fatura (espelho em `supabase/migrations/20260710210000_*.sql`) | Faturamento/NFS-e |
| 2026-07-10 | `invoices` #662/#785 + `nfse_history` (notas 315/344) | Cancelamento de cobranças trimestrais INDEVIDAS (bug do gate de frequência: 'voided' inexistente no enum `invoice_status` cegava dedup+gate): NFS-e canceladas, boletos deletados no Asaas, faturas `cancelled`; auditado (`invoice_cancelled`, `asaas_payment_cancelled`). Regras canônicas: `docs/REGRAS_DE_COBRANCA.md` | Faturamento |
| 2026-07-21 | 12 funções `SECURITY DEFINER` | **Guard de autorização** adicionado (via `pg_get_functiondef`+`regexp_replace`, corpo fiel). `is_staff(auth.uid())` com `RAISE 42501` em `get_technician_ranking`, `get_invoice_report_stats`, `get_additional_charges_report`, `get_ticket_report_stats`, `get_weekly_ticket_trend`, `get_integration_health_stats`, `get_ticket_form_data`, `auto_reconcile_bank_entries`; null-safe (libera service_role/cron) em `update_invoice_status`, `cleanup_old_application_logs`, `cleanup_old_monitoring_alerts`; `get_contracts_invoice_summary` (LANGUAGE sql) via `AND is_staff` no WHERE. Fecha exposição de relatórios financeiros/operacionais a qualquer autenticado (inclusive cliente). Verificado: barra non-staff (42501) e libera staff (happy path). | Segurança |
| 2026-07-21 | `merge_clients()` | **FIX perda de dados**: injetado reparent **genérico** de todos os **39 filhos CASCADE** de `clients` (todas as `doc_*`, `monitored_devices`, `network_*`, `unifi_controllers`, `software_licenses`, `knowledge_articles`, `client_notification_rules`, `alert_escalation_settings`, `pending_invites`) antes do `DELETE`. Antes migrava só 13 tabelas → merge apagava silenciosamente o dossiê técnico. À prova de staleness (loop sobre `pg_constraint`). Verificado (loop dinâmico roda nas 39 sem erro). | Clientes / Segurança |
| 2026-07-22 | `compute_sla_deadline()` + trigger `set_ticket_sla_deadline_trg` em `tickets` | **FIX SLA inoperante**: `tickets.sla_deadline` nunca era escrito → `notify-sla-breach` processava 0 chamados. Novo trigger BEFORE INSERT/UPDATE (priority/category/client) popula `sla_deadline` computando o prazo em **horário comercial** (turnos/dias/fuso de `company_settings.business_hours`) a partir de `sla_configs.resolution_hours` (precedência cliente+categoria > cliente > categoria > prioridade, desempate por `id`). Backfill dos 5 tickets ativos. Testado (5 casos de borda + INSERT em rollback). | Tickets / SLA |
| 2026-07-22 | `increment_article_views(article_id uuid)` (RPC nova) | FIX (Tier 2 #13): RPC **atômica** de contagem de views — não existia, então `ArticleViewer` caía num `UPDATE views=views+1` não-atômico (race). `SECURITY DEFINER`, gate `auth.uid() IS NOT NULL`. Frontend simplificado para só chamar a RPC (fallback morto removido). | Base de Conhecimento |

### Snapshot de crons ativos (pg_cron) — fonte da verdade é o banco (modelo MCP)
> Verificado em 2026-06-29 via `SELECT * FROM cron.job`. Reproduzível via Lovable MCP se necessário.

| jobname | schedule | função |
|---|---|---|
| generate-invoices-daily | `0 11 * * *` | generate-monthly-invoices |
| check-adjustments-daily | `0 10 * * *` | check-contract-adjustments |
| check-doc-expiries-daily | `0 9 * * *` | check-doc-expiries |
| detect-auth-anomalies-daily | `0 11 * * *` | detect-auth-anomalies |
| notify-due-invoices-daily | `0 12 * * *` | notify-due-invoices |
| poll-services-6h | `0 */6 * * *` | poll-services |
| unifi-sync-hourly | `0 * * * *` | unifi-sync |
| auto-retry-failed-boletos | `0 11,15,19,23 * * *` | auto-retry-failed-boletos |
| update-overdue-status | `0 3 * * *` | (UPDATE invoices overdue) |

---


---

## 4. Matriz de Integracoes

| Integracao | Categoria | Direcao | Edge functions | Webhooks | Secrets/Config | Status |
|---|---|---|---|---|---|---|
| Asaas (cobranca) | pagamento | bidirecional | asaas-nfse, webhook-asaas-nfse, generate-invoice-payments, generate-second-copy, auto-retry-failed-boletos, admin-cancel-asaas-payment, manual-payment | webhook-asaas-nfse?token= (PAYMENT_*/INVOICE_*) | integration_settings(asaas: api_key/wallet_id/environment/webhook_token), SUPABASE_*, WEBHOOK_SECRET_ASAAS | ativa |
| Asaas NFS-e | nfse | bidirecional | asaas-nfse, webhook-asaas-nfse, send-nfse-notification | webhook-asaas-nfse?token= (INVOICE_*/PAYMENT_*) | integration_settings(asaas), WEBHOOK_SECRET_ASAAS, company_settings(nfse_*), contracts.nfse_service_code | ativa |
| Banco Inter | pagamento | bidirecional | banco-inter, webhook-banco-inter, poll-services | webhook-banco-inter?token= | WEBHOOK_SECRET_BANCO_INTER, integration_settings(banco_inter: client_id/secret/cert), SUPABASE_* | parcial |
| Resend | mensageria | bidirecional | send-email-resend, webhook-resend-status (+16 consumidoras) | webhook-resend-status (Svix) | RESEND_API_KEY, RESEND_WEBHOOK_SECRET, integration_settings(resend: from_name/from_email) | ativa |
| Telegram | mensageria | bidirecional | send-telegram, webhook-telegram-status, send-notification, send-alert-notification | webhook-telegram-status (stub) | WEBHOOK_SECRET_TELEGRAM, integration_settings(telegram: bot_token/default_chat_id) | parcial |
| WhatsApp / Evolution | mensageria | bidirecional | send-whatsapp, validate-whatsapp, webhook-whatsapp-status | webhook-whatsapp-status (MESSAGE_UPDATE) | WEBHOOK_SECRET_WHATSAPP, integration_settings(evolution_api: api_url/api_key/instance) | parcial |
| Web Push (VAPID) | mensageria | saida | send-push-notification (+callers) | nenhum | VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY (hardcoded x2), VAPID_SUBJECT | parcial |
| Google Calendar | calendario | saida | google-calendar | nenhum | integration_settings(google_calendar: client_id/secret/redirect_uri) | parcial |
| UniFi (+relay Hermes) | monitoramento | saida | unifi-sync, sync-doc-devices (relay-unifi.ts externo) | nenhum | unifi_controllers(url/user/password_encrypted/cloud_api_key_encrypted), Vault UNIFI_RELAY_PASSWORD | parcial |
| CheckMK | monitoramento | saida | checkmk-sync | nenhum | integration_settings(checkmk: url/username/secret/alert_levels) | ativa |
| Tactical RMM | monitoramento | saida | tactical-rmm-sync | nenhum | integration_settings(tactical_rmm: url/api_key/flags) | ativa |
| Consulta CNPJ (ReceitaWS) | consulta | saida | cnpj-lookup | nenhum | nenhum (tier gratuito, verify_jwt=true default) | ativa |
| Indices Economicos (BCB SGS) | consulta | saida | fetch-economic-indices, check-contract-adjustments | nenhum | SUPABASE_*, verify_jwt=false, API publica | ativa |
| Supabase (Plataforma) | plataforma | bidirecional | _shared/auth-helpers, auth-email-hook, certificate-vault + ~50 | auth-email-hook (Send Email hook) | VITE_SUPABASE_*, SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY | ativa |

---

## 5. Integracoes

### 5.1 Asaas (cobranca/pagamentos)

**Fluxo de dados**: SAIDA: generate-invoice-payments/useInvoiceActions/auto-retry/generate-second-copy decidem provider e invocam asaas-nfse action=create_payment -> le integration_settings(asaas) -> idempotencia/drift -> ensureCustomerForPayment (PUT/POST /customers) -> POST /payments -> busca identificationField/pixQrCode -> baixa PDF -> grava invoices (asaas_payment_id, boleto_url, boleto_barcode, pix_code, boleto_status='gerado'). ENTRADA: webhook-asaas-nfse?token= -> valida token -> idempotencia (webhook_events) -> casa por externalReference=invoice.id -> status='paid' + paid_date + auto-emite NFS-e + notifica.

**Endpoints externos**: api.asaas.com/v3 (prod), sandbox.asaas.com/api/v3, api-sandbox.asaas.com/v3 (divergente em admin-cancel); POST/PUT/GET /customers, POST/GET/DELETE /payments, GET /payments/{id}/identificationField, /pixQrCode, POST /payments/{id}/receiveInCash, POST/GET/DELETE /invoices, GET /invoices/municipalServices, GET /myAccount.

**Tabelas**: integration_settings, invoices, clients, contracts, nfse_history, nfse_event_logs, nfse_cancellation_log, webhook_events, invoice_documents, financial_entries, audit_logs/application_logs/notifications, _billing_migration_backup_inter_to_asaas.

**Riscos / lacunas**
- CRITICO: webhook-asaas-nfse/asaas-nfse/admin-cancel-asaas-payment fora do config.toml -> herdam verify_jwt=true; webhook do Asaas (sem JWT) seria rejeitado antes do check de token.
- project_id divergente (config.toml silefpsayliwqtoskkdz vs AsaasConfigForm yaxkiombyntpzcrnultp).
- Bug de URL sandbox (sandbox.asaas.com vs api-sandbox.asaas.com).
- admin-cancel-asaas-payment sem auth de usuario, deleta cobrancas com service role.
- asaas-nfse sem validar user/role nas actions sensiveis.
- api_key em texto claro; webhook sem HMAC (so token em query).
- create_payment com multiplas chamadas sincronas (latencia/timeout em lote).
- auto-retry default 'asaas' mesmo para faturas Inter.

**Passos de verificacao**
- [ ] Confirmar verify_jwt das 3 functions; adicionar verify_jwt=false ao config.toml para o webhook.
- [ ] Alinhar project ref correto e a URL de webhook no AsaasConfigForm.
- [ ] Conferir integration_settings (api_key/environment/webhook_token).
- [ ] Testar Conexao (GET /myAccount) e o wizard sandbox (create/confirm).
- [ ] Gerar boleto real e checar asaas_payment_id/boleto_url/barcode.
- [ ] Simular PAYMENT_RECEIVED e confirmar status='paid' + notificacao.
- [ ] Corrigir/validar URL base sandbox em asaas-nfse.
- [ ] Revisar audit_logs/application_logs por correlationId.

### 5.2 Asaas NFS-e

**Fluxo de dados**: SAIDA: UI -> asaas-nfse action emit/emit_standalone -> getAsaasConfig -> ensureCustomerSync (/customers) -> resolve municipalServiceId (/invoices/municipalServices) -> nfse_history ('processando') -> POST /invoices com taxes -> espelha invoices.nfse_status; logs em nfse_event_logs. ENTRADA: webhook-asaas-nfse -> verifyWebhookAuth -> idempotencia -> processInvoiceWebhook (AUTHORIZED baixa PDF/XML para nfse-files, grava numero_nfse) OU processPaymentWebhook (status='paid' + auto-emite NFS-e). ENTREGA: send-nfse-notification exige pdf_url/xml_url, signed URLs (7 dias).

**Endpoints externos**: api.asaas.com/v3, sandbox.asaas.com/api/v3; GET /myAccount, /invoices/municipalServices, POST/PUT/GET /customers, POST/GET/DELETE /invoices, POST/GET/DELETE /payments, /identificationField, /pixQrCode, /receiveInCash; download de pdfUrl/xmlUrl/bankSlipUrl.

**Tabelas**: nfse_history, nfse_event_logs, nfse_cancellation_log, webhook_events, integration_settings, clients, invoices, invoice_documents, contracts, company_settings, notifications/user_roles, invoice_notification_logs/application_logs/audit_logs; buckets nfse-files/invoice-documents.

**Riscos / lacunas**
- JWT gateway: asaas-nfse e webhook-asaas-nfse fora do config.toml -> verify_jwt=true; webhook publico pode receber 401 antes do verifyWebhookAuth (RISCO ALTO).
- Token via query string (logavel); sem HMAC.
- Webhook precisa de registro manual no painel Asaas.
- asaas_customer_id compartilhado entre NFS-e e cobranca (drift; ja ha mitigacao cnpj_drift).
- Auto-emissao no pagamento sem reentrancia alem de auto_nfse_emitted; falha silenciosa.
- send-nfse-notification bloqueia sem pdf_url/xml_url (depende do webhook).
- URL do projeto hard-coded; certificate-vault/parse-certificate paralelos (nao usados pelo Asaas).

**Passos de verificacao**
- [ ] Confirmar Verify JWT desabilitado para webhook-asaas-nfse (ou config.toml).
- [ ] Verificar secret WEBHOOK_SECRET_ASAAS (fail-closed se ausente).
- [ ] Conferir integration_settings (environment/api_key/webhook_token).
- [ ] Testar Conexao (GET /myAccount).
- [ ] Rodar wizard sandbox (cliente->boleto->confirmar->emitir teste) e checar webhook_events/nfse_event_logs.
- [ ] Registrar webhook no painel Asaas e disparar teste.
- [ ] Emitir NFS-e real (processando->autorizada), download PDF/XML, testar NfseShareMenu.
- [ ] Verificar idempotencia (reenvio -> skipped).

### 5.3 Banco Inter (boletos e PIX)

**Fluxo de dados**: SAIDA: useInvoiceActions -> banco-inter -> le integration_settings -> Deno.HttpClient mTLS (cert .crt/.key) -> OAuth client_credentials -> POST /cobranca/v3/cobrancas (assincrono, codigoSolicitacao) -> polling inline curto (3x15s) -> grava invoices (boleto_barcode, boleto_status, boleto_url, notes). PIX: POST /pix/v2/cob -> pix_code. ENTRADA: webhook-banco-inter?token= -> valida token -> array de eventos -> idempotencia -> PAGO/RECEBIDO/LIQUIDADO -> status='paid' + financial_entries + notifica. FALLBACK: poll-services reconcilia boletos/pagamentos.

**Endpoints externos**: cdpj.partners.bancointer.com.br (prod), cdpj-sandbox (sandbox); /oauth/v2/token, POST/GET /cobranca/v3/cobrancas, /pdf, /cancelar, PUT|GET /webhook, POST /pix/v2/cob.

**Tabelas**: integration_settings, invoices, clients, invoice_documents, webhook_events, financial_entries, audit_logs, notifications, contracts, application_logs, user_roles, backups residuais.

**Riscos / lacunas**
- Cron de poll-services NAO versionado -> boletos assincronos podem ficar 'pendente' para sempre.
- banco-inter/webhook-banco-inter/poll-services fora do config.toml (webhook precisa ser publico).
- Webhook so com token na query string (logavel); sem mTLS na borda.
- Sem WEBHOOK_SECRET_BANCO_INTER, register_webhook falha e o webhook nega tudo.
- Certificados mTLS em base64 texto claro no DB.
- Formato legado certificate_base64 nao gera httpClient mTLS.
- Polling inline pode estourar timeout.
- Historico de contaminacao PIX/boleto (corrigido por hotfix).
- Sandbox Inter frequentemente indisponivel.
- Reconciliacao PIX inexistente no poll-services (so webhook).

**Passos de verificacao**
- [ ] Confirmar cron de poll-services no Dashboard.
- [ ] Verificar WEBHOOK_SECRET_BANCO_INTER nos secrets.
- [ ] Garantir verify_jwt=false para webhook-banco-inter/banco-inter/poll-services.
- [ ] Preencher config + upload .crt/.key, Testar Conexao (available_scopes).
- [ ] Registrar/Verificar Webhook (isOurs=true).
- [ ] Gerar boleto de teste e checar barcode/url/notes; rodar poll-services se 'pendente'.
- [ ] Simular callback PAGO e validar status='paid', financial_entries, idempotencia.
- [ ] Conferir logs [BANCO-INTER]/[WEBHOOK]/[POLL-SERVICES].
- [ ] Validar migracao de contratos active para asaas.

### 5.4 Resend (email)

**Fluxo de dados**: SAIDA: consumidora monta HTML via email-helpers e invoca send-email-resend -> valida/sanitiza -> resolve remetente (payload > integration_settings 'resend' > defaults) -> POST api.resend.com/emails (Bearer, timeout 15s) -> message_logs (sent/failed + external_message_id). ENTRADA: Resend -> webhook-resend-status -> valida Svix (HMAC, fail-closed) -> dedup por svix-id -> avanca status sem regressao -> bounce/complaint -> upsert suppressed_emails.

**Endpoints externos**: https://api.resend.com/emails (POST).

**Tabelas**: message_logs, integration_settings(resend), suppressed_emails, webhook_events, email_settings, company_settings, email_templates.

**Riscos / lacunas**
- LACUNA: send-email-resend NAO consulta suppressed_emails antes de enviar (supressao so pela metade).
- Sem retry/backoff em 429/5xx.
- Sem idempotency_key (re-disparo duplica email).
- Rate limit do Resend nao respeitado (geracao mensal pode estourar quota).
- webhook-resend-status fora do config.toml (verify_jwt=true default) - confirmar acessibilidade.
- Sem UI para URL do webhook nem painel de logs/erros; sem gestao de suppressed_emails.
- is_active controla so o from default e o botao de teste, nao bloqueia as 16 functions.
- Rate limit in-memory por instancia.
- DMARC rua aponta para dmarcreports@lovable.dev.

**Passos de verificacao**
- [ ] Confirmar RESEND_API_KEY (senao 500/configured:false).
- [ ] Confirmar RESEND_WEBHOOK_SECRET (senao fail-closed/401).
- [ ] Testar via ResendConfigForm (envio retorna sucesso).
- [ ] Verificar message_logs (sent -> delivered).
- [ ] Verificar webhook_events (resend) - idempotencia.
- [ ] Confirmar URL/eventos no dashboard Resend.
- [ ] Testar bounce -> suppressed_emails e (FALHA atual) se envio subsequente pula.
- [ ] Confirmar acessibilidade publica do webhook (config.toml).
- [ ] Validar DNS (DKIM/SPF/MX).

### 5.5 Telegram (Bot API)

**Fluxo de dados**: SAIDA: edge le integration_settings(telegram) -> POST api.telegram.org/bot<token>/sendMessage {chat_id,text,parse_mode} (fallback default_chat_id). send-notification/send-alert-notification gravam message_logs; send-telegram NAO grava. ENTRADA: webhook-telegram-status -> valida segredo/assinatura -> grava audit_logs (stub, sem processamento).

**Endpoints externos**: https://api.telegram.org/bot<token>/sendMessage.

**Tabelas**: integration_settings(telegram), profiles(notify_telegram, telegram_chat_id), message_logs(telegram), audit_logs.

**Riscos / lacunas**
- send-telegram nao grava message_logs/audit_logs (rastreabilidade inconsistente).
- send-telegram ignora user_id/related_type/related_id (e parseMode quando camelCase).
- BUG: notify-sla-breach e check-no-contact-tickets enviam {chatId, parseMode} (camelCase) mas a function le snake_case -> sempre cai no default_chat_id.
- webhook-telegram-status e stub (sem read receipts); status delivered/read nunca atualizam.
- Nenhum codigo registra setWebhook.
- bot_token em texto plano; bot_username coletado mas nao usado.

**Passos de verificacao**
- [ ] Confirmar registro telegram em integration_settings (is_active, bot_token, default_chat_id).
- [ ] Validar token (GET /getMe -> ok:true).
- [ ] Testar botao de teste e chegada da mensagem.
- [ ] Inspecionar logs do send-telegram.
- [ ] Reproduzir BUG de campo (chatId vai para default).
- [ ] Confirmar gravacao em message_logs via send-notification/send-alert (e ausencia via send-telegram).
- [ ] Testar webhook (sem secret -> 401; com secret -> 200 + audit_logs).
- [ ] Confirmar WEBHOOK_SECRET_TELEGRAM definido.

### 5.6 WhatsApp / Evolution API

**Fluxo de dados**: SAIDA: invoke send-whatsapp {to, message, userId?} -> le integration_settings(evolution_api) -> limpa numero -> POST {api_url}/message/sendText/{instance} (apikey, rate-limit 10/s, timeout 5s, retry 3x) -> message_logs. VALIDACAO: ClientForm -> validate-whatsapp -> 55+DDD -> POST /chat/whatsappNumbers -> {valid, exists, jid}. ENTRADA: webhook-whatsapp-status (ACKs PENDING/SERVER_ACK/DELIVERY_ACK/READ) -> UPDATE message_logs (delivered_at/read_at) + audit_logs.

**Endpoints externos**: POST {api_url}/message/sendText/{instance}, POST {api_url}/chat/whatsappNumbers/{instance}.

**Tabelas**: integration_settings(evolution_api), message_logs(whatsapp), audit_logs, application_logs(retry), clients(whatsapp/whatsapp_validated).

**Riscos / lacunas**
- webhook-whatsapp-status fora do config.toml -> verify_jwt=true; Evolution sem JWT seria rejeitado (status delivered/read nao atualiza).
- validate-whatsapp tambem fora do config.toml.
- send-whatsapp com verify_jwt=false (publico) - so protegido por rate-limit por IP (risco de spam).
- api_key em integration_settings (nao em Secrets).
- Codigo de envio duplicado em 3 lugares (retry/normalizacao divergentes).
- send-whatsapp nao adiciona DDI 55 automaticamente.
- Fail-closed sem WEBHOOK_SECRET_WHATSAPP.

**Passos de verificacao**
- [ ] Confirmar webhook na Evolution (MESSAGE_UPDATE/MESSAGES_UPSERT + X-Webhook-Secret).
- [ ] Adicionar verify_jwt=false ao config.toml (webhook + validate-whatsapp); testar delivered_at/read_at.
- [ ] Verificar integration_settings (evolution_api, is_active, campos).
- [ ] Testar envio pelo form (message_logs sent + external_message_id).
- [ ] Validar numero no ClientForm (exists/jid).
- [ ] Confirmar WEBHOOK_SECRET_WHATSAPP.
- [ ] Inspecionar logs send-whatsapp/webhook (200/ack).

### 5.7 Web Push (VAPID)

**Fluxo de dados**: usePushNotifications.subscribe (permission + /sw-push.js + pushManager.subscribe) -> upsert push_subscriptions. Disparo: send-ticket-notification (correto) / notify-sla-breach / check-no-contact-tickets / Testar Push -> send-push-notification (service role) -> consulta push_subscriptions (user_ids OU role_filter) -> JWT VAPID ES256 + ECDH/HKDF + AES-128-GCM -> POST ao endpoint. 404/410 deletam a subscription.

**Endpoints externos**: subscription.endpoint (FCM/Mozilla/WNS), POST com Authorization vapid, Content-Encoding aes128gcm.

**Tabelas**: push_subscriptions (FK profiles.user_id, UNIQUE user_id,endpoint, RLS owner), user_roles, profiles.

**Riscos / lacunas**
- GAP CRITICO de contrato: notify-sla-breach e check-no-contact-tickets chamam com {userId,title,body,url} no topo, mas a function espera {type, user_ids/role_filter, data:{...}} -> push enviado para TODAS as subscriptions e payload generico.
- VAPID_PUBLIC_KEY duplicado/hardcoded (frontend + edge).
- Erros !=404/410 so logados (subscriptions invalidas nao limpas).
- Sem VAPID_PRIVATE_KEY -> success:true com sent:0 (falha silenciosa).
- Realtime de push_subscriptions adicionado e depois removido (confirmar nada depende).
- send-push-notification fora do config.toml (verify_jwt=true default).
- Implementacao cripto manual sem testes; envio sequencial (timeout).
- handleTestPush com user undefined -> [undefined] -> sent:0.

**Passos de verificacao**
- [ ] Confirmar VAPID_PRIVATE_KEY corresponde a VAPID_PUBLIC_KEY.
- [ ] Ativar Push, verificar push_subscriptions, clicar Testar Push (recebimento).
- [ ] Inspecionar logs (Success vs 401/403/410).
- [ ] Reproduzir o GAP (broadcast indevido + payload generico).
- [ ] Corrigir os dois callers para o contrato correto.
- [ ] Verificar SW activated e subscription no DevTools.
- [ ] Testar limpeza de subscription expirada (404/410).
- [ ] Confirmar se push_subscriptions ainda precisa estar fora do realtime.

### 5.8 Google Calendar

**Fluxo de dados**: Config: admin preenche client_id/secret -> integration_settings. Conexao: Conectar -> google-calendar action auth_url -> redireciona ao Google -> retorno /settings?code=&state. PROBLEMA: nenhum handler captura ?code nem chama action 'callback' -> tokens nunca trocados/salvos. Actions sync_event/delete_event existem mas nao sao chamados. Desconectar: delete direto em google_calendar_integrations.

**Endpoints externos**: accounts.google.com/o/oauth2/v2/auth, oauth2.googleapis.com/token, calendar/v3/users/me/calendarList/primary, calendar/v3/calendars/{id}/events (POST/PUT/DELETE).

**Tabelas**: integration_settings(google_calendar), google_calendar_integrations (tokens por usuario, RLS owner), calendar_events (google_event_id/google_calendar_id).

**Riscos / lacunas**
- Fluxo OAuth incompleto (sem captura de ?code/callback) -> conexao nunca conclui.
- Sincronizacao orfa (sync_event/delete_event nunca chamados; sync_enabled/last_sync_at sem uso).
- verify_jwt=true default conflita com o desenho do callback.
- client_secret/tokens em texto plano.
- redirect_uri fixo em origin+/settings (deve bater com Google Console).
- delete_event sem refresh de token.
- Status enganoso ('Configurado' nao reflete conexao real).

**Passos de verificacao**
- [ ] Confirmar ausencia de handler de callback OAuth.
- [ ] Verificar que sync_event/delete_event nao sao invocados.
- [ ] Checar verify_jwt (sem entrada em config.toml).
- [ ] Testar Conectar e confirmar que google_calendar_integrations NAO e populada (confirma o gap).
- [ ] Inspecionar logs (so auth_url exercitado).
- [ ] Validar RLS e get_calendar_tokens.

### 5.9 UniFi Controller (+relay Hermes)

**Fluxo de dados**: Config em unifi_controllers (RLS is_staff). CLOUD: unifi-sync action=sync -> api.ui.com (hosts/devices/sites) -> upsert network_sites + monitored_devices (external_source='unifi') -> unifi_sync_logs. DIRECT/HERMES: worker na LXC -> login -> unifi_relay_list_controllers (direct) -> UniFi OS via Tailscale -> RPCs SECURITY DEFINER (unifi_relay_upsert_device/post_alert/log_sync). LLDP -> network_topology (so no caminho direct da edge). sync-doc-devices reusa credenciais para doc_devices.

**Endpoints externos**: api.ui.com/v1 (/hosts, /devices, /sites); UniFi Network legacy (/api/login, /api/s/{site}/stat/device, /rest/alarm); UniFi OS (/api/auth/login, /proxy/network/...); relay -> Supabase (/auth/v1/token, /rest/v1/rpc/unifi_relay_*).

**Tabelas**: unifi_controllers, network_sites, network_topology, unifi_sync_logs, monitored_devices, monitoring_alerts, doc_devices, clients, auth.users/profiles/user_roles (usuario relay-unifi).

**Riscos / lacunas**
- Credenciais sensiveis em texto plano (password_encrypted/cloud_api_key_encrypted).
- BUG MonitoringPage:220 envia controllerId (camelCase), edge le controller_id -> filtro ignorado (sincroniza todos vencidos).
- BUG IntegrationsTab:99 renderiza UnifiConfigForm sem clientId.
- Sem agendamento automatico para CLOUD (so manual/relay).
- unifi-sync com verify_jwt=false + CORS '*' (service role).
- Acoplamento operacional (Tailscale, cert self-signed, usuario relay).
- Topologia LLDP provavelmente nunca populada (relay nao grava; ramo direct da edge nao alcanca UDMs).
- is_online inconsistente entre metodos.

**Passos de verificacao**
- [ ] Confirmar deploy (functions list).
- [ ] Testar conexao cloud (Testar Conexao -> N hosts).
- [ ] Rodar sync manual e verificar unifi_sync_logs (success).
- [ ] Inspecionar monitored_devices(unifi)/network_sites/last_sync_at.
- [ ] Testar relay Hermes (RUNBOOK_HERMES, usuario/Vault/role technician).
- [ ] Validar RPCs (unifi_relay_list_controllers so direct; sem is_staff -> excecao).
- [ ] Verificar systemd timer (15min).
- [ ] Reproduzir bug do MonitoringPage (sync ignora controllerId).
- [ ] Checar Tailscale status.

### 5.10 CheckMK

**Fluxo de dados**: Disparo manual (Testar/Salvar/sync/mapeamento/refresh). checkmk-sync le integration_settings(checkmk) -> Bearer "username secret" -> action=test (host_config), list_folders (folders -> clients), sync (hosts + estados + servicos; device_type por hostname; client_id via client_external_mappings; upsert monitored_devices; gera/resolve monitoring_alerts por alert_levels). Timeout 15s.

**Endpoints externos**: {baseUrl}/api/1.0/domain-types/host_config/collections/all, folder_config/collections/all, host/collections/all, service/collections/all.

**Tabelas**: integration_settings, client_external_mappings, monitored_devices, monitoring_alerts, clients.

**Riscos / lacunas**
- Automation secret em texto puro no JSONB.
- verify_jwt=false (chamavel sem auth; enumera folders).
- Sem agendamento real (sync_interval_hours so UI; last_sync_at gravado pelo front).
- Sem paginacao (collections/all) - timeout/perda em instancias grandes.
- N+1 por host.
- Hosts sem mapeamento ficam invisiveis (unmapped).
- device_type heuristico; CORS '*'.
- Direcao pull (alertas so atualizam no sync).

**Passos de verificacao**
- [ ] Preencher e Testar Conexao (toast valido).
- [ ] Verificar integration_settings(checkmk).
- [ ] Listar folders (list_folders) e criar mapeamento.
- [ ] Acionar sync e checar logs (updated/created/unmapped/alerts).
- [ ] Conferir monitored_devices(checkmk) e monitoring_alerts.
- [ ] Validar endpoints com curl (Bearer).
- [ ] Confirmar ausencia de cron (cron.job) e verify_jwt.

### 5.11 Tactical RMM

**Fluxo de dados**: Config em integration_settings(tactical_rmm). Testar -> action=test (GET /clients/). Mapeamentos -> action=list_clients. Sync -> GET /agents/ + (online) /agents/{id}/checks/ -> service_data (hardware/metrics) -> upsert monitored_devices (insert so com mapeamento) -> alertas offline/online. NAO atualiza last_sync_at (so o front).

**Endpoints externos**: GET {url}/clients/, GET {url}/agents/, GET {url}/agents/{id}/checks/.

**Tabelas**: integration_settings, client_external_mappings(tactical_rmm), monitored_devices, monitoring_alerts, clients, audit_logs.

**Riscos / lacunas**
- API Key/URL em texto plano no JSONB.
- Sem cron (sync_interval_hours decorativo).
- verify_jwt=true default (diverge de checkmk/unifi).
- Sem paginacao (/agents/, /clients/).
- Matching de cliente fragil (campos heuristicos).
- Parsing de metricas best-effort.
- N+1 (SELECT+UPDATE/INSERT + fetch de checks por agente).
- Edge nao atualiza last_sync_at.
- Sem retry/backoff; uma falha aborta a sync.
- device_type fixo 'computer'; CORS '*'.

**Passos de verificacao**
- [ ] Confirmar registro (url/api_key/is_active).
- [ ] Testar Conexao (action=test -> /clients/).
- [ ] Validar list_clients (lista + logs de erro).
- [ ] Criar mapeamento e sincronizar; conferir monitored_devices(tactical).
- [ ] Verificar geracao/resolucao de alertas (offline->online).
- [ ] Conferir verify_jwt (anonimo -> 401).
- [ ] Confirmar ausencia de cron (cron.job).
- [ ] Inspecionar logs (Found N agents, sync complete).
- [ ] Verificar campo 'unmapped' no retorno.

### 5.12 Consulta CNPJ (cnpj-lookup via ReceitaWS)

**Fluxo de dados**: Frontend -> invoke cnpj-lookup {cnpj} -> valida/limpa 14 digitos -> GET receitaws.com.br/v1/cnpj/{cnpj} -> repassa JSON cru -> form.setValue (nao persiste; so ao salvar o ClientForm/CompanyTab).

**Endpoints externos**: https://receitaws.com.br/v1/cnpj/{cnpj} (tier gratuito sem chave).

**Tabelas**: clients (indireto), config da empresa emissora de NFS-e (indireto).

**Riscos / lacunas**
- Rate limit baixo (~3/min) -> 429 repassado cru (pode quebrar o fluxo).
- Sem tratamento de status HTTP (response.json sempre).
- CORS '*' (mitigado por verify_jwt=true).
- Provedor unico sem fallback; sem cache; sem sanitizacao dos dados externos.
- Deno std antigo (0.190.0).

**Passos de verificacao**
- [ ] Confirmar deploy (nao esta em config.toml, mas existe a function).
- [ ] Testar via ClientForm (CNPJ valido preenche campos).
- [ ] Repetir em CompanyTab.
- [ ] Teste direto autenticado (Bearer + body cnpj).
- [ ] Validar erros (<14 digitos -> 400; body vazio -> 400).
- [ ] Disparar varias consultas (429).
- [ ] Conferir logs (Error fetching CNPJ).

### 5.13 Indices Economicos (BCB - SGS)

**Fluxo de dados**: Disparo manual (widget) ou cron semanal (documentado). fetch-economic-indices itera tipos -> URL SGS -> fetch (sem auth) -> calcula accumulated_12m (produto dos 12 fatores) -> upsert economic_indices (onConflict index_type,reference_date, source='BCB'). Consumo: useLatestEconomicIndex/EconomicIndicesWidget; ContractAdjustmentDialog preenche percentual.

**Endpoints externos**: api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados (IGPM=189, IPCA=433, INPC=188).

**Tabelas**: economic_indices, contracts, contract_adjustments, contract_services, contract_history, notifications, user_roles.

**Riscos / lacunas**
- Cron fetch-economic-indices so no playbook (sem migration) -> atualizacao 100% manual se nao aplicado.
- Dependencia da API publica (erros so logados).
- Sem retry/backoff nem cache.
- accumulated_12m so a partir do 12o ponto (months baixo -> 'Buscar atual' desabilitado).
- check-contract-adjustments NAO le economic_indices (so notifica; auto-aplica so FIXO).
- verify_jwt=false (endpoint aberto que faz writes via service role).
- Defasagem de divulgacao do BCB.

**Passos de verificacao**
- [ ] Clicar refresh no widget (toast com contagem).
- [ ] Conferir economic_indices (linhas recentes, source='BCB').
- [ ] Testar 'Buscar atual' no ContractAdjustmentDialog.
- [ ] Verificar cron no ambiente (cron.job; se vazio, nao aplicado).
- [ ] Logs '[FETCH-INDICES]' (200 da api.bcb.gov.br).
- [ ] curl POST /fetch-economic-indices {months:13}.

### 5.14 Supabase (Plataforma)

**Fluxo de dados**: SAIDA (frontend->plataforma): auth.* (login/sessao), from() (RLS), storage.from() (buckets privados), functions.invoke(). ENTRADA/REALTIME: canal 'unified-realtime' empurra postgres_changes (tickets/notifications) so para staff; auto-refresh de token. SERVIDOR: adminClient (service role) vs userClientFromAuth (respeita RLS); requireRole valida JWT. AUTH HOOK: auth-email-hook renderiza React Email e envia via Lovable. CRON: pg_cron + pg_net chamam edges.

**Endpoints externos**: silefpsayliwqtoskkdz.supabase.co (REST/Auth/Storage/Realtime), wss .../realtime/v1, /functions/v1/<nome>, Lovable Email API.

**Tabelas**: auth.users, profiles, user_roles, tickets, notifications, certificates, audit_logs, storage.buckets/objects, user_invites, company_settings, software_licenses.

**Riscos / lacunas**
- ~17 functions com verify_jwt=false (incl. bootstrap-admin) - dependem de checagem interna.
- certificate-vault usa SERVICE_ROLE_KEY como key material (rotacionar quebra descriptografia).
- Senhas legadas de certificado sem prefixo 'ENCRYPTED:' retornadas em texto puro.
- rateLimit in-memory por instancia.
- Jobs pg_cron nao versionados (poll-services etc.).
- audit_logs sem retencao.
- anon key exposta no bundle -> seguranca depende de RLS em cada tabela.
- auth-email-hook acoplado ao Lovable (sem SMTP proprio).

**Passos de verificacao**
- [ ] Conferir .env (silefpsayliwqtoskkdz).
- [ ] Logar e confirmar persistencia JWT + refreshSession agendado.
- [ ] Testar realtime entre dois navegadores staff.
- [ ] Tentar ler dados de outro cliente como 'client' (bloqueio por RLS).
- [ ] Cadastrar certificado e confirmar senha_hash 'ENCRYPTED:' + autorizacao antes do service role.
- [ ] Conferir buckets privados (certificates/nfse-files/invoice-documents/ticket-attachments) vs publicos (email-assets/knowledge-images).
- [ ] Verificar checagem interna de cada function com verify_jwt=false.
- [ ] Conferir cron jobs e extensoes pg_cron/pg_net.
- [ ] Disparar recovery e confirmar assinatura/envio no auth-email-hook.
- [ ] Rodar get_advisors (tabelas sem RLS).

---

## 6. Mapa de Edge Functions (60 funcoes por dominio)

**Autenticacao, Usuarios e Permissoes (15)**: bootstrap-admin, create-user, invite-user, activate-invite-manually, resend-invite, revoke-invite, delete-user, update-user-email, confirm-user-email, reset-password, forgot-password, resolve-username, resend-confirmation, detect-auth-anomalies, auth-email-hook.

**Chamados / Tickets e SLA (3)**: send-ticket-notification, notify-sla-breach, check-no-contact-tickets.

**Clientes e Documentacao Tecnica (3)**: cnpj-lookup, check-doc-expiries, sync-doc-devices.

**Contratos e Reajustes (3)**: apply-contract-adjustment, check-contract-adjustments, fetch-economic-indices.

**Faturamento e Cobranca (12)**: generate-monthly-invoices, generate-invoice-payments, batch-process-invoices, batch-collection-notification, calculate-invoice-penalties, auto-retry-failed-boletos, notify-due-invoices, manual-payment, renegotiate-invoice, generate-second-copy, resend-payment-notification, admin-cancel-asaas-payment.

**NFS-e e Certificados / Pagamento externo (7)**: asaas-nfse, webhook-asaas-nfse, send-nfse-notification, certificate-vault, parse-certificate, banco-inter, webhook-banco-inter.

**Monitoramento e Servicos (5)**: tactical-rmm-sync, checkmk-sync, unifi-sync, send-alert-notification, poll-services (financeiro, agrupado por nome).

**Notificacoes e Comunicacao (10)**: send-notification (morto), send-email-resend, send-push-notification, send-whatsapp, send-telegram, validate-whatsapp, webhook-resend-status, webhook-telegram-status, webhook-whatsapp-status.

**Calendario e Agendamento (1)**: google-calendar.

> Observacao: o total nominal de ~60 funcoes inclui sobreposicoes entre dominios (ex.: asaas-nfse atende NFS-e e Faturamento; poll-services e financeiro mas foi historicamente agrupado em Monitoramento). Inventario, Base de Conhecimento, Relatorios, Gamificacao e Portal do Cliente nao possuem edge functions proprias (operam via supabase-js direto e RPCs). Os helpers `_shared/auth-helpers.ts`, `_shared/email-helpers.ts`, `_shared/notification-logger.ts` e `_shared/email-templates/*` sao compartilhados e nao contam como funcoes deployaveis.

---

## 7. Riscos Transversais e Proximos Passos

### 7.1 Agendamento (pg_cron) nao versionado — risco sistemico

Quase todos os setores dependem de jobs pg_cron que NAO estao nas migrations (so existem no DEPLOYMENT_PLAYBOOK/painel): SLA (notify-sla-breach, check-no-contact-tickets), faturamento (generate-monthly-invoices, notify-due-invoices, calculate-invoice-penalties, auto-retry-failed-boletos, update-overdue-status), contratos (check-contract-adjustments, fetch-economic-indices), documentacao (check-doc-expiries), reconciliacao (poll-services), monitoramento (tactical/checkmk/unifi-sync), e o detector de anomalias (a migration so faz `unschedule`). **Proximo passo**: auditar `cron.job` no ambiente, versionar os agendamentos em migrations e confirmar que cada cron passa JWT de service-role.

### 7.2 verify_jwt e webhooks — risco de quebra silenciosa

Multiplas edges de webhook (webhook-asaas-nfse, webhook-banco-inter, webhook-whatsapp-status, webhook-resend-status) e funcoes sensiveis nao estao em `config.toml` -> herdam `verify_jwt=true`; provedores externos nao enviam JWT Supabase -> 401 antes da validacao interna de token. **Proximo passo**: declarar explicitamente `verify_jwt=false` para todos os webhooks e confirmar no painel; padronizar config.toml (remover send-email-smtp fantasma).

### 7.3 Segredos em texto plano

`integration_settings.settings` (api_key Asaas, client_secret/certificados Inter, bot_token Telegram, secret CheckMK, api_key RMM), `doc_credentials` (password_encrypted/mfa_backup_code), `unifi_controllers` (password_encrypted/cloud_api_key_encrypted), `google_calendar_integrations` (tokens). O sufixo `_encrypted` e enganoso (sem cripto real). Resend ja adota o padrao correto (secret de backend). **Proximo passo**: migrar segredos sensiveis para edge secrets/Supabase Vault, restringir SELECT de integration_settings a admin/manager, e cifrar doc_credentials.

### 7.4 Sistema de SLA inoperante

`tickets.sla_deadline` nunca e escrito -> notify-sla-breach processa zero chamados e metricas de SLA do Dashboard/reports ficam vazias; ha duas nocoes de SLA desconexas (timestamp absoluto vs calculo client-side). **Proximo passo**: decidir entre trigger que popula sla_deadline ou reescrever a edge com a logica de sla-calculator.ts; unificar a fonte.

### 7.5 Perda de dados no merge de clientes

`merge_clients` nao migra tabelas `doc_*`; o DELETE do source (CASCADE) apaga silenciosamente toda a documentacao tecnica (dispositivos, credenciais, licencas, VLANs). **Proximo passo (alta prioridade)**: corrigir merge_clients para migrar doc_* antes do DELETE e reproduzir o cenario.

### 7.6 Contratos de payload divergentes (bugs reais)

Vários callers passam payloads incompativeis com as functions: Web Push (notify-sla-breach/check-no-contact -> broadcast indevido), Telegram (chatId/parseMode camelCase -> sempre default_chat_id), batch-collection-notification (status vs invoice_ids/channels -> 400), logAudit nas edges de convite, e UniFi MonitoringPage (controllerId vs controller_id). **Proximo passo**: corrigir os contratos e adicionar testes de integracao para os senders compartilhados.

### 7.7 Enums vs codigo (Faturamento/NFS-e)

✅ RESOLVIDO (2026-06-29, Fase 1 do setor Dinheiro). Os writes de subprocesso (nfse/boleto/email_status) foram auditados contra os enums reais e os 6 sites invalidos corrigidos (`processando`/`cancelado`→`pendente`) — ver §3.5. A FSM (`billing-fsm.ts`) ja estava alinhada (a nota anterior era stale). Resta apenas limpeza de **leituras mortas** (`=== "processando"`/`"registrado"`) em 4 arquivos — cosmetico.

### 7.8 RLS de RPCs SECURITY DEFINER

RPCs de relatorio financeiro (get_invoice_report_stats etc.) e de ranking sao SECURITY DEFINER sem guarda de role; a protecao e so o frontend. get_technician_ranking ignora RLS. **Proximo passo**: auditar GRANT EXECUTE e adicionar guardas is_staff/has_role no corpo das RPCs sensiveis.

### 7.9 Integridade da trilha de auditoria

`audit_logs` tem INSERT WITH CHECK (true) (linhas forjaveis), redacao so para integration_settings, trigger que engole erros, e o detector de anomalias com bug de level invalido. **Proximo passo**: restringir INSERT a service_role/is_staff, estender redacao, corrigir o level e checar erros de insert.

### 7.10 Qualidade do pipeline (Infra)

Type-check nao roda (build so `vite build`; tsconfig quebrado por vitest/globals), ESLint com no-unused-vars off, sem CI, cobertura de testes estreita (5 arquivos, 4 de 59 edges). Isso mascarou bugs reais (ex.: AdditionalChargesReportTab sem tipos). **Proximo passo**: adicionar `tsc --noEmit` + lint ao build/CI e ampliar a extracao de logic.ts testavel.

### 7.11 Duplicacao de superficies e codigo morto

Gestao de usuarios em duas surfaces, logica de reajuste e de geracao de pagamento duplicadas, dead branches do Banco Inter, send-notification orfa, tabelas orfas (doc_backup/antivirus_solutions, backups _billing_*), e UI morta (Compartilhar/⌘K na KB, billing_reminder no calendario, Garantias no Inventario, metas/badges na Gamificacao). **Proximo passo**: consolidar surfaces, eleger fontes unicas de regra de negocio e remover artefatos mortos (incluindo os backups residuais ja vencidos, regenerando types.ts).

### 7.12 Fluxos incompletos por design

Google Calendar (OAuth sem callback/sync), certificados A1 (cadastro sem consumo na emissao, alerta de validade prometido e inexistente), portal do cliente (sem notificacao ao staff e sem anexos — bloqueador ALTAHU), e gamificacao (pontos nunca concedidos no fluxo do cliente). **Proximo passo**: decidir por completar ou remover cada fluxo, evitando promessas de UI sem backend.


---

## Divergências de documentação conhecidas (auditoria 2026-07-21)

Corrigir ou tratar ao editar os docs de origem (ver AUDITORIA Parte E):
- `IMPLEMENTATION_GUIDE.md` documenta um recurso de S3 (`s3-storage.ts`, `S3StorageConfigForm.tsx`, edge `test-s3-connection`) que **não existe** no repositório.
- O antigo MAPA citava a edge `admin-cancel-asaas-payment`, **inexistente** em `supabase/functions/`.
- `TESTING.md` referencia `src/test/mocks/http.ts`, **removido** na limpeza (Fase 2) por ser órfão.
- Contagem "60 edge functions" desatualizada: há **59** diretórios em `supabase/functions/` (incl. `_shared` e `mcp`).
