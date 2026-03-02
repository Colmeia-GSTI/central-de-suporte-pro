
# Correções e Melhorias: Trigger de Perfil, Exclusão de Usuários e Vínculo com Empresa

## Problema 1: Causa raiz dos perfis ausentes

O trigger `handle_new_user` atual faz duas coisas ao criar um usuário via signup:
1. Insere na tabela `profiles`
2. Atribui automaticamente o papel `technician`

O problema: se qualquer parte falhar (ex: conflito de dados, timeout), o INSERT no profiles falha silenciosamente e o usuário fica "invisível". Alem disso, atribuir `technician` automaticamente para qualquer pessoa que se registre pelo formulario publico e incorreto -- deveria ficar sem papel ate o admin definir.

**Solucao**: Reescrever o trigger com tratamento de erro (`EXCEPTION`) e remover a atribuicao automatica de papel para auto-registro. O trigger passara a usar `BEGIN...EXCEPTION WHEN OTHERS` para garantir que o perfil seja sempre criado, mesmo se houver algum conflito.

## Problema 2: Falta opcao de excluir usuarios

A aba de Usuarios em Configuracoes nao permite excluir usuarios. Sera criada uma Edge Function `delete-user` que:
- Valida que o solicitante e admin
- Impede exclusao do proprio usuario
- Remove o usuario via `admin.deleteUser()` (que cascateia para profiles e user_roles)
- Registra a acao em audit_logs

Na UI, sera adicionado um botao de excluir com `ConfirmDialog` destrutivo.

## Problema 3: Vincular usuario a empresa (cliente)

Na aba de Usuarios, ao clicar em um usuario, deve ser possivel vincula-lo a uma empresa. Sera adicionado:
- Um botao "Vincular Empresa" na linha de acoes do usuario
- Um Dialog com um Select para escolher o cliente
- A logica cria/atualiza um registro em `client_contacts` vinculando o `user_id` ao `client_id`
- Se o usuario nao tiver papel `client` ou `client_master`, oferecer adicionar automaticamente

---

## Alteracoes Tecnicas

### 1. Migracao SQL -- Corrigir trigger `handle_new_user`

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, full_name, email)
    VALUES (
      NEW.id, 
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 
      NEW.email
    )
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[handle_new_user] Failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;
```

Mudancas:
- Adicionado `ON CONFLICT (user_id) DO NOTHING` para evitar falha por duplicacao
- Removida atribuicao automatica de papel `technician` (admin define manualmente)
- Adicionado `EXCEPTION WHEN OTHERS` para nunca bloquear o signup

### 2. Nova Edge Function: `delete-user`

| Arquivo | `supabase/functions/delete-user/index.ts` |
|---|---|
| Metodo | POST |
| Body | `{ user_id: string }` |
| Validacoes | Admin autenticado, nao pode excluir a si mesmo |
| Acao | `adminClient.auth.admin.deleteUser(userId)` |
| Auditoria | INSERT em `audit_logs` |

### 3. Atualizar `src/components/settings/UsersTab.tsx`

| Funcionalidade | Detalhes |
|---|---|
| Excluir usuario | Botao com icone Trash2, abre ConfirmDialog destrutivo, chama edge function `delete-user` |
| Vincular empresa | Botao com icone Building2, abre Dialog com Select de clientes, insere em `client_contacts` |
| Query de clientes | Nova `useQuery` para listar clientes ativos (apenas id e name) |
| Estado | Novos estados: `deleteConfirm`, `linkClientDialogOpen`, `selectedClientId` |

### 4. Arquivos modificados

| Arquivo | Mudanca |
|---|---|
| Migracao SQL | Corrigir trigger `handle_new_user` |
| `supabase/functions/delete-user/index.ts` | Nova Edge Function |
| `src/components/settings/UsersTab.tsx` | Botoes de excluir e vincular empresa |
