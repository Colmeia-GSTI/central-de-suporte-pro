

# Confirmar email e criar profile do usuário engenharia1@airduto.com.br

## Status atual

- **Email confirmado com sucesso** via edge function `confirm-user-email` (status 200, `{"success": true}`)
- **Profile NÃO existe** na tabela `profiles` para o user_id `1a0b4baf-95b9-4dc1-b605-5f087e43a5da`
- O trigger `handle_new_user` falhou silenciosamente durante o signup

## O que falta fazer

### 1. Criar profile via migração SQL

Executar uma migração para inserir o profile do usuário:

```sql
INSERT INTO public.profiles (user_id, full_name, email)
VALUES (
  '1a0b4baf-95b9-4dc1-b605-5f087e43a5da',
  'Luis Gustavo Teixeira',
  'engenharia1@airduto.com.br'
)
ON CONFLICT (user_id) DO NOTHING;
```

### 2. Melhorar `confirm-user-email` para criar profile automaticamente

Atualizar a edge function para fazer upsert do profile ao confirmar um usuário (busca dados do `auth.admin.getUserById`), prevenindo esse problema no futuro.

### 3. Atribuir role ao usuário (se necessário)

O usuário não terá nenhuma role atribuída. O admin deverá acessar **Configurações → Usuários** para vincular a role adequada (ex: `client`) e associar ao cliente Airduto.

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| Migração SQL | Inserir profile do usuário |
| `supabase/functions/confirm-user-email/index.ts` | Garantir profile ao confirmar email |

