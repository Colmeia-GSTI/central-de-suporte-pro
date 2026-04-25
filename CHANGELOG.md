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
- **Sistema de Feature Flags** (`feature_flags` + `useFeatureFlag` + `/settings/feature-flags`): infraestrutura para ligar/desligar funcionalidades em runtime sem redeploy. Suporta rollout gradual (FNV-1a determinístico), filtro por role e whitelist por user_id. Apenas admin gerencia. Documentação em `FEATURE_FLAGS.md`.
- **Testes de integração dos 5 fluxos críticos** (`src/test/integration/`): rede de segurança com 15 testes (3 por fluxo: happy path, erro de input, erro de backend / edge case) cobrindo Login, criação de chamado, geração mensal de faturas, notificação de faturas a vencer e reenvio de confirmação. Stack: Vitest + jsdom + Testing Library + mock chainable do Supabase. Cobertura 77,77% statements / 60,78% branches nos arquivos-alvo. Suíte completa em ~7s, zero flakiness. Documentação em `TESTING.md`.
- **Helper puro `buildTicketPayload`** (`src/lib/ticket-payload.ts`): lógica de montagem do payload de criação de chamado extraída de `TicketForm.tsx` para ser unit-testável (sem renderizar o formulário multi-step).
- **Handlers puros das edge functions críticas** (`supabase/functions/{generate-monthly-invoices,notify-due-invoices,resend-confirmation}/logic.ts`): núcleo de decisão extraído em funções dependency-free (sem imports `npm:`) que recebem o supabase client por parâmetro. Os `Deno.serve` em `index.ts` permanecem como source-of-truth de produção.
- **`PageErrorBoundary`** (`src/components/common/PageErrorBoundary.tsx`): boundary local por página que captura crashes, registra em `application_logs` (módulo `ui`, ação `page_crash`, contexto rico) e mostra UI custom com "Tentar novamente" e "Voltar". Coexiste com o `LazyErrorBoundary` global como primeira linha de defesa.
- **Helper `unwrapEmbed`** (`src/lib/supabase-helpers.ts`): normaliza embeds do PostgREST que podem chegar como `T | T[] | null`, evitando crashes em páginas que assumem objeto único.
- **Teste de regressão da página de inadimplência** (`src/test/integration/delinquency-page.test.tsx`): 3 cenários (embed array, objeto, null) garantindo que `/billing/delinquency` nunca mais quebre por mudança no formato do embed.
- **Ferramentas administrativas de deduplicação de clientes** (item 1.2b do roadmap): coluna gerada `clients.normalized_document` (CNPJ apenas dígitos) + índice; RPCs `detect_duplicate_clients()`, `merge_clients(source, target, overrides)` e `delete_client_safely(client_id, preview)` (todas SECURITY DEFINER, admin-only). UI: `DuplicatesBanner` (alerta no topo de `/clients`), `MergeClientsDialog` (wizard 3 steps com estratégia híbrida B+A), `DeleteClientButton` (pré-check de bloqueios + confirmação por nome). Pré-check de CNPJ no `ClientForm` via `onBlur` + guarda final no submit. Lib pura `src/lib/client-merge.ts` com 9 testes unitários. Documentação em `ADMIN_TOOLS.md`.

### Modificado
- `ClientForm.tsx`: adicionado `onBlur` no input de documento para detectar duplicata em tempo real e guarda final assíncrona no `onSubmit` exigindo confirmação humana antes de criar duplicata. Tratamento amigável do erro Postgres `23505` (violação da UNIQUE em `normalized_document`) com toast "CNPJ já cadastrado" em vez de mensagem técnica.
- **AIRDUTO LTDA mesclado** (item 1.2c): cadastro duplicado vazio (`35207c33...`) consolidado no canônico (`60ba285e...`) que concentra 1 contrato ativo, 1 chamado e 2 contatos.
- **VIZU EDITORA E DISTRIBUIDORA DE LIVROS LTDA mesclado** (item 1.2c): cadastro mais antigo (`8028b947...`) consolidado no canônico mais novo (`c9bab9b7...`), escolhido por possuir 2 contratos ativos. O único contato do source foi migrado para o target.

### Corrigido
- **Página `/billing/delinquency` não carregava mais em produção** ("Erro ao carregar esta página"). Causa raiz: o embed `clients(...)` do supabase-js retornava ARRAY em runtime, mas o código acessava `inv.clients.id` / `client.client.name.toLowerCase()` como objeto, gerando `TypeError: Cannot read properties of undefined`. Corrigido com `unwrapEmbed` + tipagem `ClientRow` + guard descartando faturas órfãs com `console.warn`. Página movida de `src/pages/financial/` (legado) para `src/pages/billing/`. Pasta `financial/` removida.
### Removido
### Segurança
- **UNIQUE constraint em `clients.normalized_document` ativada** (item 1.2c): índice único parcial `uq_clients_normalized_document` (`WHERE normalized_document <> ''`). Substitui o índice não-único anterior `idx_clients_normalized_document`. Previne definitivamente o cadastro de dois clientes com o mesmo CNPJ. Erros de violação são tratados de forma amigável no `ClientForm`.
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
