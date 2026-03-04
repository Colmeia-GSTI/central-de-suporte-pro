

# Username Case-Insensitive -- Plano de Correção

## Problema

Usernames são armazenados e comparados de forma case-sensitive. Se um usuario for criado como "Joao.Silva", o login com "joao.silva" falha.

## Pontos de Correção

Existem **5 pontos** onde o username precisa ser normalizado para lowercase:

### 1. Frontend -- Formulário de criação (`ClientUsersList.tsx`)
Normalizar o username para lowercase antes de enviar ao backend. Adicionar `.toLowerCase()` no `onSubmit`.

### 2. Edge Function `create-client-user/index.ts`
- Normalizar `username` para lowercase após validação do Zod (linha 113)
- A busca de unicidade (linha 137) já usa `.eq()` que é case-sensitive -- com lowercase garantido, fica consistente
- O email sintético (linha 158) já usa o username, que agora será lowercase

### 3. Edge Function `resolve-username/index.ts`
- Normalizar o username recebido para lowercase antes da busca (linha 78): `.eq("username", username.toLowerCase())`

### 4. Edge Function `forgot-password/index.ts`
- Normalizar o identifier para lowercase quando for username (linha 109): `.eq("username", identifier.toLowerCase())`

### 5. Login (`Login.tsx`)
- Normalizar o username para lowercase antes de enviar ao `resolve-username` (linha 38): `body: { username: loginIdentifier.toLowerCase() }`

### 6. Migração SQL -- Corrigir dados existentes
Normalizar todos os usernames existentes no banco:

```sql
UPDATE client_contacts
SET username = LOWER(username)
WHERE username IS NOT NULL
  AND username != LOWER(username);
```

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| `src/components/clients/ClientUsersList.tsx` | Normalizar username no submit |
| `supabase/functions/create-client-user/index.ts` | Normalizar username no backend |
| `supabase/functions/resolve-username/index.ts` | Busca case-insensitive |
| `supabase/functions/forgot-password/index.ts` | Busca case-insensitive |
| `src/pages/Login.tsx` | Normalizar input antes de enviar |
| Migração SQL | Corrigir usernames existentes |

