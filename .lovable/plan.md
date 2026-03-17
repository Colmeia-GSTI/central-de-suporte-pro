

# Correção Completa: Trigger Ausente + Indicador de Usuário Órfão + Melhoria no Dialog de Vinculação

## Diagnóstico Confirmado

1. **Trigger `on_auth_user_created` NÃO EXISTE** no banco — a query retornou `[]`. A função `handle_new_user()` existe mas nunca é chamada automaticamente. Usuários que se cadastram pelo `/register` ficam sem `profiles` e sem `user_roles`.

2. **2 usuários órfãos** confirmados: Milena Kasten e Ilce Siqueira (têm profile e role `client`, mas **nenhum vínculo** em `client_contacts`).

3. **Frontend**: O `UsersTab` não tem nenhum indicador visual de que um usuário `client` está sem empresa vinculada. O dialog de vincular empresa não tem filtro de busca.

## Plano de Implementação

### 1. Migração SQL — Criar trigger ausente

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

Isso resolve a causa raiz: todo novo cadastro via `/register` terá profile + role `client` automaticamente.

### 2. UsersTab — Query de vínculos + badge "Sem empresa"

- Adicionar query para buscar `client_contacts` agrupados por `user_id` (apenas user_ids com role `client`/`client_master`)
- Na coluna Status, para usuários com role cliente sem vínculo em `client_contacts`: exibir badge amber "Sem empresa" ao lado do status atual
- Isso torna imediatamente visível quais usuários precisam ser vinculados

### 3. UsersTab — Filtro de busca no dialog de vincular empresa

- Adicionar `Input` com filtro de texto no dialog existente (linhas 688-728)
- Filtrar a lista de empresas pelo texto digitado
- Mostrar empresas já vinculadas ao usuário (se houver) com indicador visual

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| Migração SQL | Trigger `on_auth_user_created` |
| `src/components/settings/UsersTab.tsx` | Query `client_contacts`, badge "Sem empresa", filtro no dialog |

