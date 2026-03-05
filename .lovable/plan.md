

## Plano: Sheet de Edição de Perfil do Usuário na Gestão de Usuários

### Objetivo
Ao clicar no nome do usuário na tabela de `UsersTab`, abrir um `Sheet` lateral com os dados editáveis do perfil (nome, email, telefone, WhatsApp, Telegram), permitindo correções rápidas sem sair da página.

### Mudanças

**1. Criar `UserProfileSheet.tsx`** (`src/components/settings/UserProfileSheet.tsx`)
- Sheet lateral (Shadcn `Sheet`) que recebe o `user_id` e carrega o perfil completo da tabela `profiles`
- Campos editáveis: `full_name`, `email`, `phone`, `whatsapp_number`, `telegram_chat_id`
- Mutation para `supabase.from("profiles").update(...)` com invalidação de `["users-with-roles"]`
- Se o email do auth precisar ser atualizado, isso NÃO será feito (requer admin API) — apenas o email no perfil
- Validação com formatação de telefone e feedback via toast

**2. Modificar `UsersTab.tsx`**
- Adicionar estado `editProfileUser` para controlar qual usuário está com o Sheet aberto
- Tornar o nome do usuário na `TableCell` clicável (cursor-pointer, hover underline)
- `onClick` no nome → abre o Sheet com os dados daquele usuário
- Adicionar ícone de edição (Pencil) nos botões de ação como atalho alternativo
- Importar e renderizar `<UserProfileSheet />`

### Campos do Sheet
| Campo | Origem | Editável |
|-------|--------|----------|
| Nome completo | `profiles.full_name` | Sim |
| Email | `profiles.email` | Sim (apenas perfil) |
| Telefone | `profiles.phone` | Sim |
| WhatsApp | `profiles.whatsapp_number` | Sim |
| Telegram ID | `profiles.telegram_chat_id` | Sim |
| Papéis | `user_roles` | Somente leitura (badges) |

### Detalhes Técnicos
- Query: `select('full_name, email, phone, whatsapp_number, telegram_chat_id, avatar_url')` — egress otimizado
- Mutation: update direto no `profiles` com `eq('user_id', userId)`, protegido por RLS (admin tem permissão via staff policies existentes)
- Invalidação: `queryClient.invalidateQueries({ queryKey: ["users-with-roles"] })`
- Permissão: envolver o Sheet em `PermissionGate` module="users" action="edit"

