

## Plano: Correção de Email + Sincronização Auth/Profile

### Problema
O `UserProfileSheet` atualiza apenas `profiles.email`, mas o email de **login** fica em `auth.users.email`. A Jovani tem email com typo (`jovane@capasemu.com.brjo`) em ambas as tabelas, e não consegue fazer login.

### Mudanças

**1. Criar Edge Function `update-user-email`**
Nova edge function que permite admins alterar o email de autenticação de qualquer usuário via `adminClient.auth.admin.updateUserById()`.
- Valida JWT do admin chamador
- Aceita `{ user_id, new_email }`
- Atualiza `auth.users.email` com `email_confirm: true` (auto-confirmar)
- Atualiza `profiles.email` em sincronia
- Registra em `audit_logs`

**2. Atualizar `UserProfileSheet.tsx`**
- Detectar quando o email foi alterado (comparar com valor original do profile)
- Se alterado, chamar `supabase.functions.invoke("update-user-email")` com o novo email
- Manter o update do profile como fallback para os demais campos
- Mostrar aviso visual de que alterar o email muda o email de login

**3. Corrigir dados da Jovani via SQL Migration**
- Atualizar `auth.users.email` para `jovane@capasemu.com.br`
- Atualizar `profiles.email` para `jovane@capasemu.com.br`
- Resetar senha para um valor temporário (ou usar edge function `reset-password` via UI depois)

**Nota**: A edge function `reset-password` já existe e funciona. Após corrigir o email, o admin pode usar o botão "Redefinir Senha" na interface para definir uma nova senha.

### Fluxo Corrigido
```text
Admin edita email no Sheet
  └─► Se email mudou:
       └─► Chama update-user-email (edge function)
            ├── auth.users.email = novo email
            └── profiles.email = novo email
  └─► Demais campos:
       └─► PATCH profiles (como antes)
```

### Segurança
- Apenas admins podem chamar `update-user-email`
- Edge function valida JWT e role antes de executar
- Ação registrada em `audit_logs`
- `email_confirm: true` evita que o usuário fique bloqueado

