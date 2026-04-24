# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog 1.1.0](https://keepachangelog.com/pt-BR/1.1.0/),
e este projeto adere a versionamento semântico quando aplicável.

Categorias usadas em cada entrada:

- **Adicionado** — novas funcionalidades
- **Modificado** — mudanças em funcionalidades existentes
- **Corrigido** — correção de bugs
- **Removido** — funcionalidades removidas
- **Segurança** — correções de vulnerabilidades
- **Obsoleto** — funcionalidades marcadas como obsoletas

---

## [Não lançado]

### Adicionado
### Modificado
### Corrigido
### Removido
### Segurança
### Obsoleto

---

## [2026-04-24] — Estado atual pré-refatoração

Marco inicial do roadmap de refatoração. Esta entrada consolida o estado do sistema
antes do início das mudanças planejadas em `REFACTORING_ROADMAP.md`.

### Adicionado (estado consolidado)

- **Módulos ativos em produção:**
  - Autenticação e gestão de usuários (Supabase Auth + `user_roles` com RBAC)
  - Clientes, contatos e portal do cliente (com níveis `client` e `client_master`)
  - Contratos com cobranças adicionais, ajustes e SLA por contrato
  - Faturamento recorrente multi-provedor (Asaas, Banco Inter v3 com mTLS)
  - NFS-e via Asaas com fallbacks fiscais e auto-retry de notas estagnadas
  - Central de chamados (ITIL) com histórico, SLA, anexos, avaliação e atendimento unificado
  - Inventário de ativos integrado ao monitoramento via IP
  - Monitoramento (UniFi UDM, Tactical RMM, CheckMK)
  - Base de conhecimento com editor Markdown e categorias hierárquicas
  - Agenda/calendário com vínculos a entidades
  - Notificações multicanal (Push, E-mail via Resend, WhatsApp, Telegram)
  - Dashboards segmentados por papel + TV Dashboard

- **Infraestrutura:**
  - 103 tabelas no schema `public`, todas com RLS habilitada
  - 56 Edge Functions deployadas
  - 7 cron jobs ativos (geração de faturas, retries, sync de monitoramento, cleanup)
  - 14 secrets configurados (Resend, Banco Inter, Asaas, VAPID, webhooks etc.)
  - 6 storage buckets (nfse-files, certificates, email-assets, invoice-documents, ticket-attachments, knowledge-images)

- **Trabalho já concluído em sessões anteriores (rastreabilidade):**
  - Rastreabilidade de e-mails de cobrança (envio, abertura, falha)
  - Edge Function `resend-confirmation` para reenvio de confirmação (rate-limit 3/h)
  - Helpers consolidados em `_shared/email-helpers.ts`
  - Painel `InvoiceNotificationHistory` para auditoria de envios
  - Limpeza de 2 usuários órfãos em `auth.users`

### Segurança (estado consolidado)

- RLS ativa em 100% das tabelas do schema `public`
- Roles em tabela separada (`user_roles`) com função `has_role` SECURITY DEFINER
- Validação Zod em Edge Functions críticas
- Rate-limiting global de 10 req/s em endpoints públicos
- Idempotência de webhooks via tabela `webhook_events`
- Validação de assinatura HMAC em webhooks (Asaas, Inter, WhatsApp, Telegram, NFS-e)

### Obsoleto (identificado, não removido ainda)

- Edge Function `send-notification` (sem referências no código)
- Edge Functions `bootstrap-admin` e `sync-doc-devices` (uso legado)
- ~50 tabelas vazias do módulo `doc_*` (decisão pendente)
- 5 componentes React órfãos (~1.300 linhas)
- 13 componentes shadcn/ui instalados sem uso

### Pontos conhecidos pré-refatoração

- `auth-email-hook` deployado mas silencioso (webhook "Send Email Hook" não configurado no painel Supabase)
- `information_schema.triggers` retornando 0 resultados — investigar `pg_trigger` para confirmar integridade do `handle_new_user` e auditorias
- `/billing/delinquency` com double-wrap de `AppLayout` e cálculo de aging divergente do widget
- Faltam índices em FKs de `tickets` e `invoices`
- Helpers `formatDate` e `formatCurrency` duplicados em múltiplos arquivos
- Validação HMAC duplicada em 4 Edge Functions

### Backup associado a este marco

- **Backup nativo do Supabase:** a ser baixado manualmente pelo usuário via painel — ver `BACKUP_PROCEDURE.md`. **É o backup definitivo para rollback.**
- **Backup CSV complementar:** `/mnt/documents/backups/backup_2026-04-24.tar.gz` (140 KB, 103 tabelas, 2026-04-24 20:42 UTC) — apenas dados, não substitui o nativo.

### Documentos criados nesta data

- `CHANGELOG.md` (este arquivo)
- `REFACTORING_ROADMAP.md`
- `BACKUP_PROCEDURE.md`
