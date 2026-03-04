

# Correção: Email de confirmação não recebido no cadastro

## Diagnóstico

Analisando os logs de autenticação, o signup de `engenharia1@airduto.com.br` foi processado com sucesso (status 200) e o hook de email do Lovable executou sem erros. Porém o usuário não recebeu o email. Os problemas identificados são:

### Problema 1: Falta de `emailRedirectTo` no signUp
O `signUp()` em `useAuth.tsx` não inclui `emailRedirectTo`, o que significa que o link de confirmação no email não terá uma URL de retorno válida. Sem isso, mesmo que o email chegue, o link pode redirecionar para lugar nenhum.

### Problema 2: Mensagem enganosa no Register.tsx
Após o cadastro, o toast diz "Você já pode fazer login" -- mas como a confirmação de email está ativada, o usuário **não pode** fazer login até confirmar. Isso causa confusão.

### Problema 3: Login não trata erro "Email not confirmed"
O `Login.tsx` traduz apenas `"Invalid login credentials"`, mas não trata o erro `"Email not confirmed"` que é retornado quando o email não foi confirmado. O usuário vê uma mensagem genérica em inglês.

### Problema 4: Página de cadastro público sem controle
O sistema é uma central de suporte de TI onde usuários devem ser criados por admins. A página `/register` está aberta publicamente sem nenhum controle, permitindo que qualquer pessoa crie uma conta -- mas sem role atribuída, ficará sem acesso útil e com email pendente.

## Plano de Correção

### 1. Corrigir `signUp` em `useAuth.tsx`
Adicionar `emailRedirectTo: window.location.origin` nas options do `signUp()` para que o link de confirmação redirecione corretamente.

### 2. Corrigir mensagem no `Register.tsx`
- Alterar toast de sucesso para: "Verifique seu email para confirmar sua conta antes de fazer login."
- Alterar descrição do toast para informar que um email de confirmação foi enviado.

### 3. Tratar erro "Email not confirmed" no `Login.tsx`
Adicionar tradução para o erro `"Email not confirmed"` → "Seu email ainda não foi confirmado. Verifique sua caixa de entrada."

### 4. Confirmar manualmente o usuário `engenharia1@airduto.com.br`
Usar a edge function `confirm-user-email` já existente para confirmar o email do usuário que ficou pendente, **ou** orientar o admin a confirmar via a tela de Usuários nas Configurações.

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| `src/hooks/useAuth.tsx` | Adicionar `emailRedirectTo` ao `signUp` |
| `src/pages/Register.tsx` | Corrigir mensagem de sucesso pós-cadastro |
| `src/pages/Login.tsx` | Traduzir erro "Email not confirmed" |

