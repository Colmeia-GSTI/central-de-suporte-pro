
# Plano: Ativar usuários pendentes + corrigir bug crítico de ativação

## Diagnóstico confirmado

**Bug raiz** em `UsersTab.tsx` L176:
```ts
supabase.functions.invoke("confirm-user-email?action=confirm", { body: { user_id: userId } })
```
O método `invoke()` trata `"confirm-user-email?action=confirm"` como **nome literal da função** — a query string é ignorada. A Edge Function recebe a request sem `?action=confirm`, lê `searchParams.get("action") || "list"` e retorna o **listamento de usuários** em vez de confirmar. O frontend então mostra "sucesso" porque `data` chega populado e nenhum erro é lançado.

**Listagem (L117)** já está correta — usa GET sem body, e a Edge Function default action é "list".

**create-user / create-client-user**: já usam `email_confirm: true`. Apenas falta comentário explicativo.

---

## Mudanças

### 1. Migração SQL — ativar usuários pendentes

```sql
UPDATE auth.users 
SET email_confirmed_at = NOW(),
    updated_at = NOW()
WHERE email IN (
  'luana@capasemu.com.br',
  'engenharia9@airduto.com.br'
)
AND email_confirmed_at IS NULL;
```

Reportar quantas linhas foram afetadas.

### 2. `supabase/functions/confirm-user-email/index.ts`

Substituir leitura de query string pelo body. Como a action `list` continua sendo chamada via GET (sem body), tratar ambos os caminhos:

```ts
// Suportar action via body (POST) ou query string (GET legacy)
let action = "list";
let userId: string | undefined;

if (req.method === "POST") {
  const body = await req.json().catch(() => ({}));
  action = body.action || "list";
  userId = body.user_id;
} else {
  const url = new URL(req.url);
  action = url.searchParams.get("action") || "list";
}
```

Retornar resposta padronizada no confirm:
```ts
return new Response(
  JSON.stringify({ success: true, message: "Usuário confirmado" }),
  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

### 3. `src/components/settings/UsersTab.tsx`

**L176** — corrigir invoke:
```ts
const { data, error } = await supabase.functions.invoke("confirm-user-email", {
  body: { action: "confirm", user_id: userId },
});
if (error) throw error;
if (data?.error) throw new Error(data.error);
if (!data?.success) throw new Error("Falha ao ativar usuário");
return data;
```

**onSuccess** — invalidar também `users-with-roles` para refletir status:
```ts
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ["user-confirmation-status"] });
  queryClient.invalidateQueries({ queryKey: ["users-with-roles"] });
  toast({ title: "Usuário ativado com sucesso", ... });
},
```

### 4. `supabase/functions/create-user/index.ts` (L167)

Adicionar comentário explicativo (sem mudar comportamento):
```ts
// email_confirm: true — admin-created users bypass email confirmation flow.
// Welcome email is sent separately via send-welcome-email.
email_confirm: true,
```

### 5. `supabase/functions/create-client-user/index.ts` (L170 e L209)

Mesmo comentário nas duas ocorrências de `email_confirm: true`.

### 6. Limpeza

- Remover `headers: { "Content-Type": "application/json" }` redundante na query de listagem (L119) — `invoke` adiciona automaticamente.
- Verificar imports não utilizados em `UsersTab.tsx` após mudanças.
- TypeScript sem erros.

---

## Arquivos

| Arquivo | Ação |
|---------|------|
| Migração SQL | Criar (ativar 2 usuários) |
| `supabase/functions/confirm-user-email/index.ts` | Editar: action via body |
| `src/components/settings/UsersTab.tsx` | Editar: invoke correto + invalidação |
| `supabase/functions/create-user/index.ts` | Editar: comentário |
| `supabase/functions/create-client-user/index.ts` | Editar: comentário (2 locais) |

Sem novos arquivos. Sem novos hooks. 4 arquivos editados + 1 migração.

---

## Relatório final (a incluir)

1. Linhas afetadas pela migração de ativação
2. Bug raiz: query string ignorada por `invoke()`
3. Confirmar que `create-user` / `create-client-user` já usavam `email_confirm: true` (apenas documentado)
