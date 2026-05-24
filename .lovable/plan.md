# Fluxo completo de Reset de Senha

## O que existe hoje (auditoria)

**1. Recuperação por email — QUEBRADA**
- `/forgot-password` ✅ existe e chama edge `forgot-password`
- Edge `forgot-password` gera link de recovery com `redirectTo: /login` ❌
- Template `RecoveryEmail` envia o link ✅
- **NÃO existe a página `/reset-password`** ❌ — quando o usuário clica no link, o Supabase confirma o token, faz auto-login e joga em `/login` sem nunca trocar a senha. O usuário entra com a senha antiga (ou fica perdido). **É o bug clássico descrito na própria doc do Lovable.**

**2. Reset pelo admin (painel) — PARCIAL**
- Edge `reset-password` ✅ funciona (admin-only, Zod, mínimo 8 chars)
- Botão em `UsersTab` (staff) ✅
- Botão em `ClientUsersList` (clientes) ✅
- ❌ Não notifica o usuário por email que a senha foi resetada
- ❌ Não tem opção "gerar senha aleatória"
- ❌ Não força o usuário a trocar a senha no próximo login
- ❌ Não registra em `audit_logs` de forma estruturada (só log do console)

**3. Trocar a própria senha — NÃO EXISTE**
- `ProfilePage` não tem opção de trocar a própria senha. Único caminho hoje é "esqueci minha senha".

---

## O que vou construir

### A) Página `/reset-password` (NOVA)
- Rota pública (sem ProtectedRoute), igual a `/login`.
- Detecta o token de recovery na URL (Supabase manda `?code=...` ou hash `#access_token=...&type=recovery`).
- Aguarda o evento `PASSWORD_RECOVERY` do `supabase.auth.onAuthStateChange`.
- Mostra form: nova senha + confirmar (mínimo 8 chars, checagem de igualdade).
- Chama `supabase.auth.updateUser({ password })`.
- Em sucesso: `signOut` → toast → redireciona para `/login`.
- Em erro de link expirado/inválido: mensagem clara + botão "Solicitar novo link".

### B) Ajustar edge `forgot-password`
- `redirectTo` passa a ser `${origin}/reset-password` (não mais `/login`).
- Mantém o fluxo de identificar email/username, rate limit, etc.

### C) Ajustar template `RecoveryEmail`
- Não muda visual. Só garante que o botão usa `confirmationUrl` recebido (já usa). O link vai apontar para `/reset-password` automaticamente porque mudamos o `redirectTo`.

### D) Reset pelo admin — versão completa
Substituir o dialog atual por um com 2 modos:
1. **Gerar senha temporária** (novo, padrão) — gera senha aleatória forte (12 chars), mostra UMA vez com botão "Copiar", e envia email opcional ao usuário.
2. **Definir senha manualmente** (atual) — mantém comportamento.

Em ambos:
- Marca um flag `must_change_password = true` em `profiles` (nova coluna).
- Grava em `audit_logs` (action `PASSWORD_RESET_BY_ADMIN`, com `target_user_id` e `method`).
- Envia email transacional (opcional, checkbox marcado por padrão) avisando "Sua senha foi redefinida pelo administrador" — sem incluir a senha no email (segurança); só avisa que foi resetada e como entrar.

### E) Forçar troca no próximo login
- Hook `useAuth`: após login bem-sucedido, se `profile.must_change_password = true`, redireciona para `/reset-password?forced=1`.
- Na página de reset, modo `forced`: pula a verificação de token de recovery e usa a sessão atual; depois de trocar, limpa o flag.

### F) "Alterar minha senha" no Perfil (NOVO)
- Card em `ProfilePage`: senha atual + nova + confirmar.
- Reautentica via `signInWithPassword(email, currentPassword)` para validar a senha atual (Supabase não tem checkpassword nativo).
- Se ok, `updateUser({password: new})`.
- Toast + opcional `signOut` de outras sessões.

---

## Mudanças técnicas (resumo)

```text
NOVO  src/pages/ResetPassword.tsx
NOVO  src/components/profile/ChangePasswordCard.tsx
EDIT  src/components/layout/AnimatedRoutes.tsx        (+ rota /reset-password)
EDIT  src/pages/profile/ProfilePage.tsx               (+ ChangePasswordCard)
EDIT  src/hooks/useAuth.tsx                           (+ redirect se must_change_password)
EDIT  src/components/settings/UsersTab.tsx            (dialog novo: gerar/manual + email)
EDIT  src/components/clients/ClientUsersList.tsx      (mesmo dialog)
EDIT  supabase/functions/forgot-password/index.ts     (redirectTo → /reset-password)
EDIT  supabase/functions/reset-password/index.ts      (suporta generate_random, must_change, audit, envio de email)
MIGRATION  profiles.must_change_password BOOLEAN DEFAULT false
```

Sem mudar: template visual do email, regras de RLS existentes, fluxo de convite (`SetupAccount`).

---

## Riscos / pontos de atenção

- O recovery do Supabase agora pode vir como `?code=` (PKCE) **ou** `#access_token=...&type=recovery` dependendo da config do projeto — a página `/reset-password` precisa lidar com os dois. Vou usar `onAuthStateChange` que cobre os dois.
- Email do reset feito pelo admin sai pelo Resend (`send-email-resend`), seguindo a regra da memória do projeto (Resend para transacional).
- Migration adiciona coluna nullable com default, reversível.

---

## Confirmações que preciso de você antes de implementar

1. **Senha temporária gerada pelo admin: mostro em tela (1 vez) E mando por email, ou só uma das duas?** Recomendo mostrar em tela + email avisando que foi resetada (sem a senha no email, mais seguro).
2. **Forçar troca no próximo login** quando o admin reseta: você quer isso ligado por padrão? (Recomendo sim.)
3. **"Alterar minha senha" no Perfil**: incluo nesse mesmo PR ou fica pra depois?

Me responde 1/2/3 e eu já mando implementar tudo de uma vez.