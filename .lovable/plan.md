
# Corrigir Menu Lateral e Investigar Falta de Role

## Causa Raiz Identificada

A usuario "Cleissi" (user_id: `33f83785-...`) tem um registro em `client_contacts` vinculando-a a uma empresa, mas **nao possui nenhum registro em `user_roles`**. Isso aconteceu porque ela foi vinculada a uma empresa pelo fluxo "Vincular Empresa" na aba Usuarios das Configuracoes, que apenas insere em `client_contacts` sem atribuir a role `client` em `user_roles`.

O fluxo `create-client-user` (Edge Function) atribui a role corretamente, mas o fluxo de "link" manual no `UsersTab.tsx` nao faz isso.

## Plano de Correcao (2 partes)

### Parte 1: Corrigir deteccao de cliente no sidebar

**Arquivo**: `src/components/layout/AppSidebar.tsx`

Alterar a logica na linha 134 de:

```typescript
const isClientUser = roles.length > 0 && roles.every(role => role === "client" || role === "client_master");
```

Para:

```typescript
const hasStaffRole = roles.some(role => ["admin", "manager", "technician", "financial"].includes(role));
const isClientUser = !hasStaffRole;
```

Isso garante que qualquer usuario sem roles de staff (incluindo users com roles vazias como a Cleissi) veja o menu simplificado com "Dashboard" e "Perfil" ao inves de uma sidebar vazia.

### Parte 2: Corrigir fluxo de vinculacao para atribuir role automaticamente

**Arquivo**: `src/components/settings/UsersTab.tsx`

No `linkClientMutation` (linhas 213-233), apos inserir em `client_contacts`, verificar se o usuario ja possui uma role de cliente. Se nao possuir, inserir a role `client` em `user_roles` automaticamente.

**De** (apenas insere contato):
```typescript
mutationFn: async ({ userId, clientId, userName }) => {
  const { error } = await supabase.from("client_contacts").insert({...});
  if (error) throw error;
}
```

**Para** (insere contato + atribui role se necessario):
```typescript
mutationFn: async ({ userId, clientId, userName }) => {
  const { error } = await supabase.from("client_contacts").insert({...});
  if (error) throw error;

  // Verificar se usuario ja tem role de cliente
  const { data: existingRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const hasClientRole = existingRoles?.some(r => r.role === "client" || r.role === "client_master");
  const hasStaffRole = existingRoles?.some(r => ["admin","manager","technician","financial"].includes(r.role));

  // Se nao tem role de cliente nem de staff, atribuir "client"
  if (!hasClientRole && !hasStaffRole) {
    await supabase.from("user_roles").insert({ user_id: userId, role: "client" });
  }
}
```

### Parte 3: Corrigir a Cleissi agora (migracao)

Executar uma migracao SQL para atribuir a role `client` a todos os usuarios que estao em `client_contacts` mas nao possuem nenhuma role em `user_roles`:

```sql
INSERT INTO user_roles (user_id, role)
SELECT DISTINCT cc.user_id, 'client'::app_role
FROM client_contacts cc
WHERE cc.user_id IS NOT NULL
  AND cc.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = cc.user_id
  );
```

## Resumo de Impacto

| Cenario | Antes | Depois |
|---|---|---|
| Usuario sem roles no sidebar | Sidebar vazia | Menu de cliente (Dashboard + Perfil) |
| Vincular usuario a empresa | Apenas cria contato | Cria contato + atribui role `client` |
| Usuarios existentes sem role | Sem acesso | Migracao atribui role `client` |
| Staff vinculado a empresa | Sem mudanca | Nao recebe role extra (ja tem staff) |

## Arquivos modificados

| Arquivo | Acao |
|---|---|
| `src/components/layout/AppSidebar.tsx` | Editar -- corrigir deteccao de cliente |
| `src/components/settings/UsersTab.tsx` | Editar -- atribuir role ao vincular empresa |
| Migracao SQL | Criar -- corrigir usuarios existentes sem role |
