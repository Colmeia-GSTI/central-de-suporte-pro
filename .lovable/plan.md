# Plano revisado: Corrigir 404 + Ativação manual de convites pelo admin

## Parte 1 — Correção do 404 (sem código)

Confirmado: rota `/setup-account` existe no fonte, mas o domínio `suporte.colmeiagsti.com.br` está servindo build antigo (a tela 404 mostrada é do servidor, não do React).

**Ação:** Republicar o projeto. Nenhuma alteração de código.

## Parte 2 — Ativação manual pelo admin (nova feature)

Permitir que admin/manager/financial ative o usuário convidado **sem o link de email**, definindo a senha direto no painel e entregando ao usuário por outro canal (WhatsApp/voz).

### 2.1 Edge Function nova: `activate-invite-manually`

- **Auth:** `requireRole(["admin", "manager", "financial"])` + `rateLimit` (mesmo padrão de `revoke-invite`).
- **Input (zod):** `{ invite_id: uuid, password: string (min 8) }`.
- **Fluxo:**
  1. Busca `pending_invites` por id; valida que **não está aceito** e **não expirado**.
  2. Verifica se já existe `auth.users` com aquele email (via `auth.admin.listUsers`).
     - Se NÃO existe → `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`.
     - Se JÁ existe → `auth.admin.updateUserById(user_id, { password, email_confirm: true })`.
  3. Chama nova RPC `admin_accept_invite(p_invite_id uuid, p_user_id uuid)` (security definer) que executa a mesma lógica do `accept_invite` atual, mas usando o `p_user_id` recebido em vez de `auth.uid()` — cria `user_roles`, `client_contacts` (se aplicável), `profile` e marca `pending_invites.accepted_at = now()`.
  4. `logAudit({ action: "invite_activated_manually", target_table: "pending_invites", diff: { email, by_user_id } })`.
- **Output:** `{ success: true, email, redirect }`.
- **Config:** `verify_jwt = false` (padrão Lovable; auth feita em código).

### 2.2 Migration

- Criar RPC `public.admin_accept_invite(p_invite_id uuid, p_user_id uuid)` — cópia de `accept_invite` com `p_user_id` parametrizado, `SECURITY DEFINER`, `SET search_path = public`.
- **Não alterar** a RPC `accept_invite` existente (continua sendo usada pelo `/setup-account`).

### 2.3 UI — `src/components/settings/PendingInvitesTab.tsx`

- Adicionar terceiro botão na linha de cada convite pendente: **"Ativar manualmente"** (ícone `KeyRound`).
- Abre um Dialog (novo componente `ActivateInviteDialog.tsx`, ≤50 linhas) com:
  - Email (read-only, do convite).
  - Campo "Senha" (mín. 8) + botão "Gerar senha aleatória" (12 chars, fácil de ditar).
  - Botão "Ativar e copiar credenciais".
- `onSuccess`: toast "Conta ativada", abre painel mostrando email + senha em texto claro com botão **"Copiar credenciais"** (formato: `Email: x@y.com\nSenha: ABC123`). `invalidateQueries(["pending-invites"])`.
- Mantém os botões existentes "Reenviar" e "Revogar" inalterados.

### 2.4 Arquivos tocados

**Novos:**
- `supabase/functions/activate-invite-manually/index.ts`
- `src/components/settings/ActivateInviteDialog.tsx`
- Migration `..._admin_accept_invite_rpc.sql`

**Editado:**
- `src/components/settings/PendingInvitesTab.tsx` (adicionar botão + estado do dialog)

**Não tocar:** `invite-user`, `resend-invite`, `revoke-invite`, `accept_invite`, `SetupAccount.tsx`.

### 2.5 Validação

1. Admin clica "Ativar manualmente" → escolhe senha → recebe credenciais para copiar.
2. Usuário faz login direto em `/login` com email + senha fornecida — sem precisar do link.
3. Convite some da lista de pendentes (status muda para aceito).
4. `audit_logs` registra `invite_activated_manually` com quem ativou.
5. Não-staff recebe 401/403 ao chamar a function.
6. Tentar ativar convite já aceito/expirado retorna erro amigável.
7. `tsc --noEmit` zero erros.

---

Aguardando seu OK para iniciar implementação.
