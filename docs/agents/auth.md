# Autenticação, Usuários e Permissões

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria de 2026-07-21 — ver [docs/audit/AUDITORIA_2026-07-21.md](../audit/AUDITORIA_2026-07-21.md). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Módulo cobre identidade (login por email OU username via edge login-with-username), bootstrap do primeiro admin, convites staff/cliente com aceite por token, RBAC granular (PERMISSIONS_CONFIG + overrides em role_permission_overrides), gestão de usuários (CRUD + reset de senha + vínculo a empresa) e detecção de anomalias de cadastro (cron diário). Estado geral sólido e coeso: uma única edge por operação, RLS/requireRole no backend, auditoria consistente. Pontos fracos: 2 edges órfãs da UI (update-user-email, confirm-user-email), várias APIs de permissão especulativas sem uso, convenção logic.ts quase não aplicada, e MAPA_DE_SETORES.md desatualizado (cita edge inexistente).

## Fluxos (rota → componente → hook → edge → tabela)

- Login email: /login -> Login.tsx -> useAuth.signIn -> supabase.auth.signInWithPassword -> auth.users/profiles/user_roles
- Login username: /login -> Login.tsx -> invoke login-with-username -> resolve client_contacts.username->email (fallback profiles) -> signInWithPassword server -> setSession(tokens)
- Bootstrap admin: /setup -> Setup.tsx (checa user_roles admin) -> invoke bootstrap-admin -> createUser + profiles + rpc try_bootstrap_admin + audit_logs
- Recuperar senha: /forgot-password -> ForgotPassword.tsx -> invoke forgot-password -> client_contacts/profiles/auth.users -> generateLink(recovery) -> send-email-resend
- Reset (recovery): /reset-password -> ResetPassword.tsx -> supabase.auth.updateUser + profiles.must_change_password=false
- Reset forçado: ProtectedRoute (profiles.must_change_password) -> /reset-password?forced=1 -> updateUser
- Reset admin: UserActionsMenu -> ResetPasswordDialog -> invoke reset-password -> auth.admin.updateUserById + profiles.must_change_password + audit_logs + send-email-resend
- Convite staff: /settings/users -> UsersPage -> PendingInvitesTab -> InviteStaffDialog -> invoke invite-user -> pending_invites + send-email-resend
- Convite cliente: InviteClientDialog OU clients/:id -> ClientUsersList -> invoke invite-user(client_id) -> pending_invites
- Aceite convite: /setup-account?token -> SetupAccount -> rpc get_invite_info -> auth.signUp -> signIn -> rpc accept_invite -> user_roles/client_contacts/profiles
- Ativar convite manual: PendingInvitesTab -> ActivateInviteDialog -> invoke activate-invite-manually -> auth.admin.createUser/updateUserById + rpc admin_accept_invite
- Reenviar/Revogar convite: PendingInvitesTab -> invoke resend-invite | revoke-invite -> pending_invites
- Criar usuário staff: CreateUserDialog -> invoke create-user -> auth.users + profiles + user_roles (remove role 'client' residual do trigger)
- Alterar papel: UserActionsMenu -> ChangeRoleDialog -> rpc change_user_role -> user_roles
- Vincular empresa: UserActionsMenu -> LinkClientDialog -> client_contacts.insert + user_roles(role 'client' se sem papel)
- Excluir usuário: UserActionsMenu | ClientUsersList -> invoke delete-user -> auth.admin.deleteUser + anonimiza client_contacts + audit_logs
- Listar usuários: UsersPage -> UsersList -> useUsers -> rpc list_users_for_admin
- Anomalias: UsersPage -> AnomaliesBanner -> le application_logs(module=auth,action=detect_anomalies) | invoke detect-auth-anomalies -> auth.users/profiles/user_roles -> application_logs + notifications (cron diário 8h Brasília)
- Permissões: usePermissions -> usePermissionOverrides(role_permission_overrides) + PERMISSIONS_CONFIG -> PermissionGate / ProtectedRoute
- OAuth consent: /.lovable/oauth/consent -> OAuthConsent -> supabase.auth.oauth.getAuthorizationDetails/approve/deny (redirect /login?next= se sem sessão)
- Emails de Auth: Supabase Auth -> webhook auth-email-hook -> React Email templates (_shared/email-templates) -> Lovable Email API

## Regras de negócio

- Bootstrap só quando não existe admin: pré-check + guarda 403 (bootstrap-admin/index.ts:105) e atomicidade anti-race via rpc try_bootstrap_admin com cleanup do user (index.ts:144-165); UI espelha check em Setup.tsx:65
- Login por username nunca expõe o email; erros genéricos 'invalid_credentials' contra enumeração (login-with-username/index.ts:47,70,82,89-90)
- Rate limit de login por IP: 10/min (login-with-username/index.ts:10-11,51)
- must_change_password redireciona para /reset-password?forced=1 (ProtectedRoute.tsx:36); setado em reset-password/index.ts:102-110; limpo em ResetPassword.tsx:90-97
- Reset de senha por admin restrito a role admin (reset-password/index.ts:55-61); senha temporária de 14 chars com 1 de cada classe (index.ts:9-25); email de aviso NÃO inclui a senha (index.ts:127,150)
- forgot-password: resposta neutra anti-enumeração para email (index.ts:69-74,150-153); para username sem email cadastrado retorna noEmail (index.ts:155-159)
- Convite exige client_id para client/client_master e proíbe client_id para staff (invite-user/index.ts:13-16)
- Emitir convite exige role admin/manager/financial (invite-user/index.ts:24), porém o schema aceita conceder qualquer role inclusive admin (index.ts:11)
- Bloqueia convite se já existe auth.user com o email (paginação real) ou convite pendente válido (invite-user/index.ts:49-79)
- Convite expira em 7 dias (invite-user email index.ts:135; validado em activate-invite-manually index.ts:46)
- accept_invite exige sessão autenticada; sem sessão a conta fica sem role/empresa e depende de ativação manual (SetupAccount.tsx:89-106)
- create-user restrito a admin (create-user/index.ts:55); remove role 'client' residual inserido pelo trigger handle_new_user quando é usuário de equipe (index.ts:104-106)
- delete-user: só admin (index.ts:9), proíbe excluir a própria conta (index.ts:24-26), anonimiza client_contacts (user_id=null,is_active=false) (index.ts:41-43)
- Resolução de permissão com overrides: allow explícito vence; deny só efetiva se nenhum outro role permite (usePermissions.ts:12-35)
- isStaff = admin/manager/technician/financial (useAuth.tsx:304-306); isTechnicianOnly = technician sem admin/manager/financial (usePermissions.ts:67-74)
- Detecção de anomalias: orphans=auth sem profile, zombies=profile sem auth, unconfirmed_old=>7d sem confirmar, roleless=auth+profile sem role (detect-auth-anomalies/logic.ts:30-49); banner alerta se última execução >25h (AnomaliesBanner.tsx:26)
- LinkClient atribui role 'client' apenas se o usuário não tem nenhum papel (client nem staff) (LinkClientDialog.tsx:50-60)
- Auto-refresh de token 5 min antes de expirar (useAuth.tsx:8,60-88)

## Arquivos-chave

- `src/pages/Login.tsx` — Tela de login (email direto ou username via login-with-username); reenvio de confirmação; consome ?next= do OAuth
- `src/pages/Register.tsx` — Página estática informando que acesso é só por convite (sem signup real)
- `src/pages/ForgotPassword.tsx` — Solicita recuperação de senha por email/username -> edge forgot-password
- `src/pages/ResetPassword.tsx` — Define nova senha (fluxo recovery ou forçado por must_change_password); limpa a flag
- `src/pages/Setup.tsx` — Cria primeiro admin -> edge bootstrap-admin; auto-redireciona se já há admin
- `src/pages/SetupAccount.tsx` — Aceite de convite por token: get_invite_info -> signUp -> signIn -> accept_invite
- `src/pages/Unauthorized.tsx` — Página 403 para acesso negado
- `src/pages/OAuthConsent.tsx` — Tela de consentimento OAuth (supabase.auth.oauth.*), redireciona a /login?next= se sem sessão
- `src/pages/settings/UsersPage.tsx` — Hub de gestão: abas Usuários (lista+criar+anomalias) e Convites pendentes
- `src/components/auth/ProtectedRoute.tsx` — Guard de rota: loading, redirect login/unauthorized, força reset de senha, requireStaff/allowedRoles
- `src/components/auth/PermissionGate.tsx` — Gate de UI por module/action; exporta PermissionGate + PermissionGateAny/All _(uso: parcial)_
- `src/components/auth/ResetPasswordDialog.tsx` — Diálogo admin: gerar/definir senha temporária -> edge reset-password
- `src/components/auth/ProtectedRoute.test.tsx` — Testes do ProtectedRoute
- `src/components/users/UsersList.tsx` — Busca/filtro por papel + tabela de usuários (useUsers)
- `src/components/users/UserRow.tsx` — Linha da tabela de usuários + badges de status/papel
- `src/components/users/UserActionsMenu.tsx` — Menu de ações: papel, reenviar confirmação, reset senha, vincular empresa, excluir
- `src/components/users/AnomaliesBanner.tsx` — Lê último detect_anomalies em application_logs; botão 'Verificar agora' -> detect-auth-anomalies
- `src/components/users/ChangeRoleDialog.tsx` — Altera papel via rpc change_user_role (atômico)
- `src/components/users/CreateUserDialog.tsx` — Cria usuário de equipe -> edge create-user (só admin na UI)
- `src/components/users/LinkClientDialog.tsx` — Vincula usuário a empresa (client_contacts) e atribui role client se sem papel
- `src/components/settings/PendingInvitesTab.tsx` — Lista convites pendentes/expirados; reenviar/revogar/ativar; abre diálogos de convite
- `src/components/settings/InviteStaffDialog.tsx` — Convida staff -> edge invite-user (sem client_id)
- `src/components/settings/InviteClientDialog.tsx` — Convida cliente/cliente-master -> edge invite-user (com client_id)
- `src/components/settings/ActivateInviteDialog.tsx` — Ativa convite manualmente definindo senha -> edge activate-invite-manually
- `src/hooks/useAuth.tsx` — AuthProvider: sessão, profile, roles, isStaff/isAdmin, signIn/signUp/signOut, auto-refresh token
- `src/hooks/usePermissions.ts` — can/canAny/canAll/getActions + overrides; isTechnicianOnly
- `src/hooks/usePermissionOverrides.ts` — Lê role_permission_overrides -> mapa O(1) getOverride
- `src/hooks/usePendingInvitesCount.ts` — Conta convites pendentes (badge)
- `src/hooks/useUsers.ts` — Lista usuários via rpc list_users_for_admin + filtros client-side
- `src/lib/permissions.ts` — Config RBAC (módulos/ações/roles), hasPermission, metadata; getAllowedActions _(uso: parcial)_
- `supabase/functions/bootstrap-admin/index.ts` — Cria 1o admin com guarda anti-duplicado + try_bootstrap_admin atômico
- `supabase/functions/login-with-username/index.ts` — Resolve username->email (client_contacts/profiles) e autentica no servidor; anti-enumeração
- `supabase/functions/invite-user/index.ts` — Cria pending_invites + envia email; valida existência/duplicidade; requireRole admin/manager/financial
- `supabase/functions/activate-invite-manually/index.ts` — Cria/atualiza auth user + admin_accept_invite (ativação sem link)
- `supabase/functions/resend-invite/index.ts` — Reenvia convite renovando validade +7d
- `supabase/functions/revoke-invite/index.ts` — Revoga convite pendente
- `supabase/functions/delete-user/index.ts` — Hard-delete auth user (só admin, não a si mesmo) + anonimiza client_contacts + audit
- `supabase/functions/update-user-email/index.ts` — Atualiza email do usuário (admin) + profiles + audit _(uso: nao)_
- `supabase/functions/confirm-user-email/index.ts` — Lista status de confirmação / confirma email manualmente (admin) _(uso: nao)_
- `supabase/functions/reset-password/index.ts` — Reset admin: gera/define senha, must_change_password, email de aviso (sem senha), audit
- `supabase/functions/forgot-password/index.ts` — Recuperação por email/username: generateLink + send-email-resend; anti-enumeração
- `supabase/functions/resend-confirmation/index.ts` — Reenvia email de confirmação (tem logic.ts)
- `supabase/functions/detect-auth-anomalies/index.ts` — Detecta orphans/zombies/unconfirmed/roleless; loga + notifica admins; cron ou admin
- `supabase/functions/detect-auth-anomalies/logic.ts` — Lógica pura de detecção (testável)
- `supabase/functions/auth-email-hook/index.ts` — Webhook Supabase Auth 'Send Email' -> React Email templates -> Lovable Email API; +/preview _(uso: incerto)_

## Pontos de atenção / riscos

- Escalonamento de privilégio: invite-user permite que manager/financial concedam a role 'admin' (o enum do schema aceita 'admin' sem exigir que o requester seja admin) - invite-user/index.ts:11,24. Vale gate extra 'só admin concede admin'.
- delete-user faz HARD delete de auth.users (cascateia profiles/user_roles). CLAUDE.md §7 manda anonimizar em vez de deletar quando há registros financeiros/auditoria referenciando o usuário; client_contacts é anonimizado, mas outras FKs por user_id podem ficar órfãs. Revisar aderência à regra de anonimização.
- Convenção logic.ts (CLAUDE.md §6.6) quase não aplicada: só resend-confirmation e detect-auth-anomalies têm logic.ts; as outras 13 edges do módulo concentram toda a regra no index.ts.
- Import morto: usePermissions.ts:2 importa getAllowedActions sem usar (getActions usa PERMISSIONS_CONFIG diretamente).
- API de permissão especulativa sem uso: PermissionGateAny/All e canViewModule/canEditModule/canManageModule - candidatos a remoção (YAGNI).
- Dois pontos de UI para o mesmo backend de convite/exclusão (settings: InviteClient/StaffDialog + UserActionsMenu; clients: ClientUsersList) - não há duplicação de lógica de servidor (edge única), mas convites de cliente entram por dois caminhos.
- useAuth.signUp faz parte do contexto mas parece sem uso real (Login usa signIn; SetupAccount chama supabase.auth.signUp direto; Register é estática) - confirmar com grep antes de remover.
- useUsers.filters.tenantId documentado como 'futuro multi-tenant' e atualmente ignorado (single-tenant) - dead flexibility tolerada, anotar.
- Confirmar no banco (não consultado, somente leitura de código): existência/assinatura das RPCs get_invite_info, accept_invite, admin_accept_invite, change_user_role, list_users_for_admin, try_bootstrap_admin e das tabelas pending_invites, role_permission_overrides, application_logs - todas referenciadas pelo código do módulo.

## Código morto — tratado na Fase 2 ou pendente de decisão

- `getAllowedActions` (src/lib/permissions.ts:152) — Export sem uso; ainda importado (import morto) em usePermissions.ts:2 mas nunca chamado (getActions usa PERMISSIONS_CONFIG diretamente)
- `PermissionGateAny` (src/components/auth/PermissionGate.tsx:75) — Componente exportado sem nenhum uso em JSX
- `PermissionGateAll` (src/components/auth/PermissionGate.tsx:104) — Componente exportado sem nenhum uso em JSX
- `canViewModule` (src/hooks/usePermissions.ts:55) — Retornado por usePermissions mas sem call site
- `canEditModule` (src/hooks/usePermissions.ts:59) — Retornado por usePermissions mas sem call site
- `canManageModule` (src/hooks/usePermissions.ts:63) — Retornado por usePermissions mas sem call site (uso só via PermissionGate.action='manage')

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA (linhas 119, 135, 1399) cita a edge 'resolve-username' como parte do módulo - ela NÃO existe (dir supabase/functions/resolve-username ausente). A função real de resolução por username é 'login-with-username'.
- MAPA §135 lista verify_jwt=false para 'resolve-username' (inexistente) e não registra que 'login-with-username' (a real) não está em config.toml, logo cai no default verify_jwt=true (funciona via anon key, mas contraria a descrição do MAPA).
- MAPA descreve update-user-email e confirm-user-email como parte ativa do fluxo de usuários, mas ambas estão órfãs: 0 chamadas na UI (só citadas em ADMIN_TOOLS.md/CHANGELOG).
- MAPA conta 'Autenticacao, Usuarios e Permissoes (15)' - o número de edges bate (15), porém a lista contém 'resolve-username' no lugar de 'login-with-username'.
- MAPA (linhas 122, 1367) trata auth-email-hook como integração ativa de emails transacionais, mas CHANGELOG.md:824 registra 'deployado mas silencioso (webhook Send Email Hook não configurado no painel Supabase)' - estado real é incerto/inativo.

