# Plano: Reenvio manual de email de confirmação

## Contexto
O `auth-email-hook` está deployado mas silencioso (Send Email Hook não configurado no painel Supabase — exige ação manual do dono do projeto). Esta entrega cria um caminho independente para reenviar o email de confirmação via `send-email-resend`, limpa 2 usuários de teste órfãos e melhora a UX no Login/Register.

---

## Passo 1 — Limpeza de usuários órfãos (migration)

Migração `cleanup_orphan_test_users` removendo (na ordem) `user_roles` → `profiles` → `auth.users` para os 2 emails de teste de março/2026:
- `teste.final.fluxo@testlovable.com`
- `teste.trigger.auto@testlovable.com`

Bloco `DO $$ ... $$` com `RAISE NOTICE` reportando contagens removidas. Idempotente: se nenhum user existir, sai sem erro.

> Nota: a deleção em `auth.users` em cascata limpa também `auth.identities` e `auth.sessions` (FKs nativas).

---

## Passo 2 — Edge Function `resend-confirmation`

**Novo arquivo:** `supabase/functions/resend-confirmation/index.ts`

Fluxo:
1. Valida `{ email }` (regex + trim/lowercase).
2. `supabase.auth.admin.listUsers()` → busca usuário pelo email.
   - Não existe → `404 { error: "Email não cadastrado" }`.
   - Já confirmado (`email_confirmed_at`) → `200 { already_confirmed: true, message: "Conta já ativada..." }`.
3. **Rate limit**: conta linhas em `message_logs` com `user_id = user.id`, `related_type = 'user_signup'`, `status = 'sent'`, `sent_at >= now() - 1h`. Se ≥ 3 → `429 { error: "rate_limited" }`.
4. `supabase.auth.admin.generateLink({ type: 'signup', email })` → captura `properties.action_link`.
5. Monta HTML usando `getEmailSettings` + `wrapInEmailLayout` + `escapeHtml` do `_shared/email-helpers.ts` (reutiliza branding já existente — cores, logo, footer da `email_settings`).
6. Invoca `send-email-resend` com:
   - `subject: "Confirme seu cadastro - Colmeia"`
   - `related_type: 'user_signup'`, `related_id: user.id`, `user_id: user.id` (para rastreio em `message_logs`).
7. Retorna `{ success: true, message: "Email de confirmação reenviado" }`.

CORS, timeout e validação seguem o mesmo padrão das outras functions. Sem subdiretórios. JWT verification: público (precisa funcionar antes do login).

**`supabase/config.toml`**: adicionar `[functions.resend-confirmation] verify_jwt = false`.

**Deploy:** `supabase--deploy_edge_functions(["resend-confirmation"])`.

---

## Passo 3 — `src/pages/Login.tsx`

Mudanças mínimas, reutilizando UI existente:

- Novo estado: `pendingConfirmEmail: string | null` e `resending: boolean`.
- Quando `error.message === "Email not confirmed"`:
  - Toast com título "Confirme seu email" e descrição "Seu email ainda não foi confirmado."
  - `setPendingConfirmEmail(emailToUse)` para revelar o botão.
- Abaixo do formulário (dentro do `CardFooter`, antes do "Esqueci minha senha"), renderizar condicionalmente:
  ```tsx
  {pendingConfirmEmail && (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={resending}
      onClick={handleResend}
    >
      {resending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
      Reenviar email de confirmação
    </Button>
  )}
  ```
- `handleResend`: chama `supabase.functions.invoke("resend-confirmation", { body: { email: pendingConfirmEmail } })`.
  - Sucesso → toast verde "Email enviado. Verifique sua caixa de entrada e spam."
  - Erro `rate_limited` (status 429 ou `data.error === 'rate_limited'`) → toast laranja `variant: "default"` "Aguarde alguns minutos antes de solicitar novamente."
  - Erro genérico → toast destrutivo com a mensagem.
- Limpa `pendingConfirmEmail` em sucesso.

Sem novos componentes — apenas o `Button`/`Loader2` já importados.

---

## Passo 4 — `src/pages/Register.tsx`

Substituir o redirect imediato para `/login` por uma tela de confirmação inline:

- Migrar de `toast` (sonner) → manter sonner (consistente com o arquivo).
- Novo estado: `signedUpEmail: string | null` e `resending: boolean`.
- Após `signUp` bem-sucedido: `setSignedUpEmail(email)` (não navega).
- Renderiza condicionalmente `signedUpEmail ? <ConfirmationCard /> : <RegisterForm />` dentro do mesmo `<Card>`:
  - Título: "Cadastro realizado com sucesso!"
  - Descrição: "Enviamos um email de confirmação para **{email}**. Verifique sua caixa de entrada e clique no link para ativar sua conta."
  - Botão primário: "Reenviar email" (chama `resend-confirmation`).
  - Texto auxiliar: "Não recebeu? Verifique sua pasta de spam ou clique em Reenviar após alguns minutos."
  - Link: "Ir para o login" (`/login`).

Estados de toast (sucesso/rate-limit/erro) idênticos aos do Login. O componente é pequeno o suficiente para ficar inline (≤ 50 linhas), então não cria novo arquivo.

---

## Passo 5 — Instruções para o usuário (resposta final)

Bloco em PT-BR explicando como ativar o `Send Email Hook` no painel Supabase (URL com `silefpsayliwqtoskkdz`, método POST, sem secret), e que o botão "Reenviar email de confirmação" funciona como contingência enquanto o hook não está ligado.

---

## Limpeza e validação final

- `bunx tsc --noEmit` deve sair com código 0.
- Sem imports órfãos em Login/Register.
- `auth-email-hook` permanece deployado e intacto (continuará funcionando assim que o usuário ativar o hook no painel).
- Reutilização total dos helpers existentes (`email-helpers.ts`, `useAuth`, componentes shadcn).

---

## Arquivos tocados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/<timestamp>_cleanup_orphan_test_users.sql` | criar |
| `supabase/functions/resend-confirmation/index.ts` | criar |
| `supabase/config.toml` | adicionar bloco da função |
| `src/pages/Login.tsx` | editar (botão reenvio condicional) |
| `src/pages/Register.tsx` | editar (tela de confirmação inline) |

## Detalhes técnicos

- `message_logs` **não tem coluna** `notification_type` — usa `related_type='user_signup'` como filtro de rate limit (consistente com outras functions já refatoradas).
- `auth.admin.generateLink` exige service role key (já disponível em `SUPABASE_SERVICE_ROLE_KEY`).
- `verify_jwt = false` é necessário porque a função é chamada pré-login.
- Email branding herda de `email_settings` + `company_settings` automaticamente (mesmo padrão do `send-welcome-email`).
