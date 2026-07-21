# Banco de Dados, Migrations e Schema

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria de 2026-07-21 — ver [docs/audit/AUDITORIA_2026-07-21.md](../audit/AUDITORIA_2026-07-21.md). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Schema versionado em 164 migrations SQL (supabase/migrations), com contrato de tipos gerado em src/integrations/supabase/types.ts (7439 linhas, 44 RPCs declaradas, 17 enums) e client.ts. Auditei todas as chamadas .rpc() do frontend e edges contra as definições em migration/types: 24 RPCs distintas são invocadas por código e todas existem — EXCETO increment_article_views, que é chamada pelo ArticleViewer mas não existe em migration nem em types.ts (cai sempre no fallback UPDATE não-atômico). Não há migrations com timestamp duplicado; merge_clients e open_client_portal_ticket têm duas definições cada (evolução via CREATE OR REPLACE, não órfãs). MAPA_DE_SETORES.md está levemente desatualizado nas contagens.

## Integrações

- Supabase Auth (triggers em auth.users: handle_new_user), Postgres+RLS, Vault (senhas A1/certificados, tokens) exposto só via RPC SECURITY DEFINER (get_certificate_password, get_company_certificate_password, get_license_key, get_calendar_tokens, vault_upsert_secret)
- Edge functions Deno consomem schema via service_role; apenas 2 edges chamam .rpc diretamente: bootstrap-admin (try_bootstrap_admin) e activate-invite-manually (admin_accept_invite)
- Hermes/UniFi: RPCs hermes_*_ticket e unifi_relay_* consumidas pelo bot/relay externo (relay-unifi), não pelo código do app
- types.ts é gerado mas commitado manualmente — risco de drift schema<->tipos (MAPA linha 915)

## Fluxos (rota → componente → hook → edge → tabela)

- /reports -> ReportsPage.tsx -> .rpc(get_ticket_report_stats / get_invoice_report_stats / get_technician_ranking) -> tickets/invoices/profiles/technician_points
- /clients (excluir) -> DeleteClientButton.tsx -> .rpc(delete_client_safely, SECURITY DEFINER, anonimiza+audit) -> clients/audit_logs
- /clients (duplicados) -> DuplicatesBanner + MergeClientsDialog -> .rpc(detect_duplicate_clients / merge_clients) -> clients
- Portal do cliente -> ClientTicketForm.tsx:89 -> .rpc(open_client_portal_ticket, SECURITY DEFINER) -> tickets
- Novo chamado (staff) -> TicketForm.tsx:219 -> .rpc(create_staff_ticket, atômico) -> tickets/ticket_tags
- /setup-account -> SetupAccount.tsx -> .rpc(get_invite_info) e .rpc(accept_invite) -> pending_invites/user_roles/profiles
- Auditoria -> useAuditLogs.ts:34 -> .rpc(list_audit_logs_with_user) -> audit_logs (join auth.users)
- Admin usuários -> useUsers.ts:57 + ChangeRoleDialog.tsx:29 -> .rpc(list_users_for_admin / change_user_role) -> user_roles/profiles
- Conciliação bancária -> BankReconciliationTab.tsx:94 -> .rpc(auto_reconcile_bank_entries) -> bank_entries/financial_entries
- Bootstrap/convite (edges) -> bootstrap-admin/index.ts:145 .rpc(try_bootstrap_admin); activate-invite-manually/index.ts:82 .rpc(admin_accept_invite) -> user_roles/pending_invites
- Base de conhecimento -> ArticleViewer.tsx:66 -> .rpc(increment_article_views) [FALHA: RPC inexistente] -> fallback UPDATE knowledge_articles.views

## Regras de negócio

- Anonimizar em vez de deletar cliente referenciado em registros financeiros/auditoria: delete_client_safely — supabase/migrations/20260425110301_89f59370-....sql:192
- Bloqueio de signup público; vínculo de papel só via convite: accept_invite — supabase/migrations/20260519185808_block_public_signup_and_invite_flow.sql:120
- Abertura de chamado pelo portal com resolução de contato via ORDER BY (versão endurecida): open_client_portal_ticket — supabase/migrations/20260519175933_harden_open_client_portal_ticket.sql:15
- Garantia dura contra NFS-e duplicada: índice único parcial nfse_history(invoice_id) WHERE ativa — supabase/migrations/20260710210000_uq_nfse_history_active_per_invoice.sql
- Enum invoice_status NÃO possui 'voided' (pending/paid/overdue/cancelled/lost/renegotiated) — src/integrations/supabase/types.ts:7201 (consistente com o fix recente de dedup e0014/gate de frequência)
- Criação atômica de chamado de staff com tags e origem: create_staff_ticket — supabase/migrations/20260512131803_create_staff_ticket_rpc.sql:17
- Papéis (app_role): admin/manager/technician/financial/client/client_master — src/integrations/supabase/types.ts:7159; helpers de RLS has_role/is_staff/is_financial_admin/is_technician_only/client_owns_record

## Arquivos-chave

- `src/integrations/supabase/types.ts` — Contrato de tipos gerado (Tables/Views/Functions/Enums) consumido por todo o app; fonte do que existe no banco no último regen
- `src/integrations/supabase/client.ts` — Instancia o supabase-js tipado com Database; único ponto de export do client
- `supabase/migrations/` — 164 arquivos .sql versionados: schema, enums, ~78 funções/RPC distintas, RLS (70 migrations com CREATE POLICY), Vault
- `supabase/migrations/20260123141354_1ba94f57-....sql` — Define RPCs de relatório: get_ticket_report_stats, get_invoice_report_stats, get_technician_ranking, get_ticket_form_data
- `supabase/migrations/20260425110301_....sql` — detect_duplicate_clients, merge_clients (v1) e delete_client_safely (anonimização em vez de delete)
- `supabase/migrations/20260519185808_block_public_signup_and_invite_flow.sql` — Bloqueia signup público; define accept_invite e get_invite_info (fluxo de convite)
- `supabase/migrations/20260710210000_uq_nfse_history_active_per_invoice.sql` — Índice único parcial em nfse_history(invoice_id) contra NFS-e duplicada por fatura

## Pontos de atenção / riscos

- increment_article_views: chamada .rpc morta (RPC inexistente) com fallback UPDATE não-atômico — race condition em contagem de views; decidir criar RPC atômica ou remover a chamada.
- 44 RPCs declaradas em types.ts; 24 invocadas por código (22 frontend + 2 edges). ~20 restantes são helpers de RLS/trigger (has_role, is_staff, is_financial_admin, is_technician_only, client_owns_record, sanitize_jsonb — 'em uso' via policies, não grepáveis por .rpc) ou chamadas por edges/relay/externo (hermes_*, get_certificate_password, get_company_certificate_password, get_calendar_tokens, vault_upsert_secret, generate_signed_url, verify_tv_dashboard_token, update_invoice_status, find_valid_invite, cleanup_old_*).
- calculate_penalties: sem nenhum caller no repo (src/supabase/functions/relay) — só definição em types; verificar se é usada dentro de SQL antes de considerar morta.
- Duplicações intencionais (não órfãs): merge_clients definida em 20260425110301 e redefinida em 20260427092735; open_client_portal_ticket em 20260512043108 e endurecida em 20260519175933 — em ambos a migration posterior é a vigente (CREATE OR REPLACE).
- Nenhum timestamp de migration duplicado (ls | sed | uniq -d => vazio); não há colisão/órfã por nome de arquivo.
- Riscos herdados do MAPA §3.17 confirmáveis por leitura: backups residuais no schema (_billing_hotfix_backup_pix_contamination, _billing_migration_backup_inter_to_asaas) ainda em types.ts; muitas funções SECURITY DEFINER sem SET search_path.
- NÃO consultei o banco (regra do escopo). Dúvidas que exigem o banco ao vivo: (a) increment_article_views/calculate_penalties existem no banco mesmo fora das migrations? (b) GRANT EXECUTE das RPCs de relatório financeiro (SECURITY DEFINER) para authenticated/anon?

## Código morto — tratado na Fase 2 ou pendente de decisão

- `increment_article_views (RPC)` (src/components/knowledge/ArticleViewer.tsx:66) — RPC chamada pelo frontend NÃO existe em nenhuma migration nem em types.ts; o try sempre falha e cai no catch (UPDATE views não-atômico, race condition). Branch .rpc morto — criar a RPC atômica ou remover a chamada.
- `calculate_penalties (RPC)` (src/integrations/supabase/types.ts:6897) — RPC existe no banco/types mas nenhum caller em código (src, supabase/functions, relay-unifi). Possivelmente usada só dentro de outra função SQL/view; candidata a órfã se não referenciada em SQL.

## Notas de divergência (auditoria vs MAPA antigo)

- Contagem de migrations desatualizada: MAPA diz '163 migrations' (linha 12 e §3.17 linha 892), mas o filesystem tem 164 arquivos .sql (a mais recente 20260710210000_uq_nfse_history_active_per_invoice.sql, registrada no CHANGELOG linha 87 porém a contagem não foi incrementada).
- types.ts: MAPA cita '7427 linhas' (linha 895); arquivo real tem 7439 linhas (drift menor de ~12 linhas, sugere types regenerado após a edição do MAPA).
- CONSISTENTE (não é divergência, apenas confirmo): MAPA já registra que a RPC increment_article_views NÃO existe (linhas 626/637) — minha auditoria confirma (0 defs em migration/types).
- MAPA linha 918 marca hermes_*/unifi_relay_*/vault_upsert_secret como 'RPCs TEMPORARY a verificar' — confirmo que hermes_take/comment/resolve_ticket e vault_upsert_secret existem em types.ts mas não têm caller em src/supabase/functions/relay (invocadas por bot Hermes/edges service_role fora do código versionado), portanto não são órfãs de app mas o ciclo de vida segue não auditável por leitura de código.

