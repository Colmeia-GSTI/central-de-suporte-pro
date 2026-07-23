# Auditoria, Segurança e Logs

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria completa do código (2026-07-21). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

O módulo cobre três frentes: trilha de auditoria (audit_logs) exposta por dois viewers paralelos e redundantes, logs de aplicação (application_logs) via LogsViewerTab + logger.ts, e o detector de anomalias de cadastro (edge detect-auth-anomalies + AnomaliesBanner). O viewer novo (AuditLogsList/RPC list_audit_logs_with_user, rota /settings/audit-logs) é sólido e testado; o legado AuditLogsTab (aba "Auditoria" em Settings) continua wired e duplica a função com implementação inferior. Detector e banner funcionam, mas há inconsistência de level ("warning") e casing de módulo ("auth" vs "Auth") que quebram exibição/filtragem no LogsViewerTab.

## Integrações

- Supabase RPC list_audit_logs_with_user (SECURITY DEFINER, admin-only) — fonte da trilha no viewer novo
- Supabase PostgREST direto em audit_logs (AuditLogsTab legado) e application_logs (LogsViewerTab/AnomaliesBanner/logger)
- Supabase auth.admin.listUsers (perPage:1000) + profiles + user_roles no detector (logic.ts:12-28)
- supabase.functions.invoke('detect-auth-anomalies') a partir do AnomaliesBanner; cron pg_cron/pg_net para chamada diária
- Tabela notifications (type=auth_anomaly) para alertar admins
- _shared/auth-helpers.ts: requireRole/adminClient/jsonResponse/corsHeaders e logAudit (usado por outras edges de gestão de usuários)

## Fluxos (rota → componente → hook → edge → tabela)

- /settings/audit-logs (admin) -> AuditLogsPage -> AuditLogsList -> useAuditLogs -> supabase.rpc('list_audit_logs_with_user') -> tabela audit_logs (+join profiles) -> AuditLogRow/AuditLogDetail -> AuditLogDiff -> diffJsonb
- Settings aba 'Auditoria' (admin) -> AuditLogsTab -> supabase.from('audit_logs').select(...).limit(100) [caminho paralelo/redundante, sem RPC, sem paginação, sem nome do usuário]
- Settings/Integrações -> IntegrationsTab -> LogsViewerTab -> useQuery -> supabase.from('application_logs') (filtros level/module, export CSV)
- logger.ts (frontend, persistToDb) e edge functions -> insert application_logs -> lido por LogsViewerTab e AnomaliesBanner
- /settings/users -> UsersPage -> AnomaliesBanner -> supabase.from('application_logs').eq(module,'auth').eq(action,'detect_anomalies') (leitura) + supabase.functions.invoke('detect-auth-anomalies') -> detectAnomalies(auth.users/profiles/user_roles) -> insert application_logs + notifications
- cron 'detect-auth-anomalies-daily' (0 11 * * *, só no DB ao vivo) -> edge detect-auth-anomalies (Bearer service-role) -> mesma detecção/gravação
- DB trigger audit_user_roles_trigger em user_roles (INSERT/UPDATE/DELETE) -> insert audit_logs (SECURITY DEFINER)

## Regras de negócio

- audit_logs é append-only/imutável: RLS bloqueia UPDATE e DELETE para todos (migration 20260425173521...:82-95)
- Alterações em user_roles são auto-auditadas via trigger audit_user_roles (migration 20260425173521...:50-77)
- list_audit_logs_with_user é admin-only e retorna total_count para paginação real; total vem de rows[0].total_count (useAuditLogs.ts:34,52)
- Filtro 'Até' é inclusivo do dia inteiro: sufixo T23:59:59.999Z (useAuditLogs.ts:41) e setHours(23,59,59,999) (AuditLogsTab.tsx:68-70)
- Troca de qualquer filtro reseta para página 1 (AuditLogsList.tsx:31-33)
- detect-auth-anomalies exige role admin OU chamada interna via SUPABASE_SERVICE_ROLE_KEY (cron) (index.ts:12-21)
- Categorias de anomalia: órfão=auth sem profile, zumbi=profile sem auth, não-confirmado>7d, sem-papel=auth+profile sem role (logic.ts:30-49)
- Com anomalias>0, todos os admins recebem notification type=auth_anomaly (index.ts:42-57)
- AnomaliesBanner considera detecção 'stale' se última execução há >25h (AnomaliesBanner.tsx:26,58)
- logger persiste no máximo 100 entradas em sessionStorage e só imprime no console em DEV (logger.ts:38,53,72); invoiceProcessingLog sempre grava em application_logs (logger.ts:327)

## Arquivos-chave

- `src/hooks/useAuditLogs.ts` — Hook TanStack Query que chama a RPC list_audit_logs_with_user com filtros/paginação e deriva total de total_count
- `src/lib/audit-diff.ts` — Util puro diffJsonb: diff de chaves top-level de payloads JSONB old/new (added/removed/changed)
- `src/components/audit/AuditLogsList.tsx` — Container principal da trilha: filtros + tabela paginada + sheet de detalhe
- `src/components/audit/AuditLogRow.tsx` — Linha da tabela de auditoria (badge de ação, usuário, copiar record_id)
- `src/components/audit/AuditLogDetail.tsx` — Sheet de detalhe do log com metadados + AuditLogDiff
- `src/components/audit/AuditLogDiff.tsx` — Renderiza o diff (alterado/adicionado/removido) usando diffJsonb
- `src/components/audit/AuditLogFilters.tsx` — Barra de filtros (busca/tabela/ação/datas) + consts AUDITED_TABLES/AUDITED_ACTIONS
- `src/pages/settings/AuditLogsPage.tsx` — Página /settings/audit-logs (admin) que monta AuditLogsList
- `src/components/settings/AuditLogsTab.tsx` — Viewer LEGADO de auditoria: query direta a audit_logs (limit 100, sem join de usuário, sem paginação) _(uso: parcial)_
- `src/components/settings/LogsViewerTab.tsx` — Viewer de application_logs (stats, filtros level/módulo, export CSV, detalhe)
- `src/lib/logger.ts` — Logger da aplicação: sessionStorage + persistToDatabase em application_logs + retryWithBackoff/devLog
- `src/components/users/AnomaliesBanner.tsx` — Lê último resumo de anomalias em application_logs e permite re-executar a edge; alerta se >25h sem rodar
- `supabase/functions/detect-auth-anomalies/index.ts` — Handler Deno: requireRole(admin) ou cron via service-role; grava resumo em application_logs + notifica admins
- `supabase/functions/detect-auth-anomalies/logic.ts` — Lógica pura detectAnomalies: órfãos/zumbis/não-confirmados>7d/sem-papel + totalAnomalies
- `src/test/integration/audit-logs.test.ts` — Testes de diffJsonb e useAuditLogs (forward de filtros/paginação e total)

## Pontos de atenção / riscos

- REDUNDÂNCIA (viola CLAUDE.md §6.0.2): existem DOIS viewers de auditoria admin-only e ambos vivos — AuditLogsTab (aba Settings, query direta, limit 100, sem usuário, sem redação-disclaimer, lista só 4 tabelas) e AuditLogsList (rota /settings/audit-logs, RPC com paginação/usuário/diff/redação). O legado AuditLogsTab é candidato a remoção/consolidação no AuditLogsList.
- BUG de exibição: detect-auth-anomalies/index.ts:29 grava level='warning', mas o padrão do sistema é 'warn' (logger.ts LogLevel; LogsViewerTab.tsx:66 levelConfig.warn). Em LogsViewerTab, 'warning' cai no fallback levelConfig.info (linha 328) e é exibido como 'Info' azul; o filtro 'Alerta' (eq 'warn') nunca casa esses registros.
- BUG de casing de módulo: edge e triggers gravam module='auth' (minúsculo; index.ts:31, migration handle_new_user:24,35), mas LogsViewerTab.tsx moduleLabels/filtro usam 'Auth' (maiúsculo) — logs de auth aparecem sem tradução ('auth' cru) e o filtro 'Autenticação' (.eq module 'Auth') não retorna nada. logger.ts frontend grava 'Auth' capitalizado, divergindo dos produtores de backend.
- LIMITE do detector: listUsers({perPage:1000}) sem paginação (logic.ts:12) — acima de 1000 usuários auth, órfãos/zumbis/não-confirmados ficam incompletos silenciosamente.
- AuditLogsTab.formatData (AuditLogsTab.tsx:115-120) interpola valores com template string; valores objeto viram '[object Object]' na coluna Detalhes.
- Divergência de conjunto de tabelas auditáveis entre os dois viewers: AuditLogFilters.tsx:7 lista 7 tabelas (inclui auth.users, user_roles, invoices, bank_accounts) enquanto AuditLogsTab.tsx:225-235 lista só 4 (integration_settings/tickets/clients/contracts).
- Não verificável (read-only, sem DB): trigger genérico audit_changes()/sanitize_jsonb referenciado pelo MAPA §856 não está nesta migration; existência/estado do cron no cron.job; RLS de application_logs (SELECT admin) que o AnomaliesBanner assume.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `AUDITED_TABLES / AUDITED_ACTIONS` (src/components/audit/AuditLogFilters.tsx:7,17) — Exportados mas usados apenas no próprio arquivo (map interno); nenhum import externo — poderiam ser const locais não exportadas
- `interface AuditLogFilters` (src/hooks/useAuditLogs.ts:4) — Interface exportada porém usada só como tipo do parâmetro do próprio hook; nenhum importador externo (só AuditLogRecord é importado de fora) — colide de nome com o componente AuditLogFilters

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA §847 lista os componentes do setor (AuditLogsList/Filters/Row/Detail/Diff, AnomaliesBanner, LogsViewerTab) mas OMITE o legado src/components/settings/AuditLogsTab.tsx, que continua wired como aba 'Auditoria' em SettingsPage.tsx:60,166 — o MAPA sugere um único viewer quando há dois em produção
- MAPA §856 diz 'sanitiza segredos só em integration_settings', porém o disclaimer da UI em AuditLogsPage.tsx:15 afirma genericamente que 'senhas, tokens, segredos são automaticamente redatados' (todas as tabelas) — a cópia da UI super-promete cobertura de redação além do que o backend faz
- MAPA §98/§131 registra cron detect-auth-anomalies-daily '0 11 * * *' como ATIVO/RESOLVIDO; a migration 20260425173521...:97-104 apenas faz unschedule (nunca cron.schedule) — o agendamento existe só no DB ao vivo (não verificável nesta auditoria read-only)
- MAPA §848 diz 'AnomaliesBanner/LogsViewerTab usam useQuery inline' — confere; mas não sinaliza a divergência de dados abaixo (level/module) que afeta o LogsViewerTab

