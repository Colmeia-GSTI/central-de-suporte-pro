

# Correção: Exclusão completa de usuários de cliente

## Problema

A exclusão de usuário de cliente (`ClientUsersList.tsx`) apenas remove o registro `client_contacts`, mas deixa o usuário órfão em `auth.users` e `profiles`. Ao tentar recriar com o mesmo username, o email sintético gerado colide com o registro existente no auth.

## Solução

### 1. Corrigir `deleteUserMutation` em `ClientUsersList.tsx`

Antes de deletar o `client_contacts`, verificar se o contato tem `user_id`. Se sim, chamar a edge function `delete-user` para excluir o usuário do auth (que cascateia para profiles e user_roles), e depois deletar o `client_contacts`.

```
// Pseudocódigo do novo fluxo:
1. Buscar o client_contact pelo id para obter user_id
2. Se user_id existir → invocar "delete-user" com { user_id }
3. Deletar o client_contacts
```

### 2. Limpar o usuário órfão atual

Executar uma chamada à edge function `delete-user` para remover o usuário auth órfão que ficou para trás (o que tem o email sintético `thais.dickel@...internal`), permitindo que a recriação funcione.

Será necessário consultar o `profiles` ou `auth.users` para encontrar o user_id correto associado ao email sintético.

### 3. Tratamento de erro na `create-client-user`

Melhorar a tradução do erro `email_exists` para uma mensagem mais clara: "Este username já possui um usuário no sistema. Exclua o usuário anterior primeiro."

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| `src/components/clients/ClientUsersList.tsx` | Chamar `delete-user` antes de deletar `client_contacts` |
| `supabase/functions/create-client-user/index.ts` | Melhorar mensagem de erro para `email_exists` |
| Limpeza manual | Remover usuário auth órfão do thais.dickel |

## Riscos

- A edge function `delete-user` valida que o chamador é admin. Isso é compatível pois apenas staff pode gerenciar contatos de clientes.
- O cascade do `auth.admin.deleteUser` já remove profiles e user_roles automaticamente.

