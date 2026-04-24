# Feature Flags

Sistema simples para ligar/desligar funcionalidades em runtime, sem deploy.

## Por que existe
Proteger a refatoração: se algo novo quebrar em produção, desligamos pela tabela `feature_flags` em vez de reverter código.

## Modelo
Tabela `public.feature_flags`:

| Campo | Descrição |
|---|---|
| `key` | Identificador único (snake_case). Ex: `new_billing_dashboard`. |
| `enabled` | Master switch. Se `false`, flag retorna `false` para todos. |
| `description` | Texto livre explicando o que a flag controla. |
| `rollout_percentage` | 0-100. Percentual de usuários que recebem a flag (rollout gradual). |
| `enabled_for_roles` | Array de roles. Se preenchido, só usuários com pelo menos uma dessas roles passam no filtro. |
| `enabled_for_user_ids` | Array de UUIDs. Whitelist absoluta — sempre liga, ignora rollout. |
| `updated_by` | Último admin que alterou. |

## RLS
- **SELECT:** todo usuário autenticado lê (front precisa decidir UI).
- **INSERT/UPDATE/DELETE:** apenas `admin` (via `has_role`).

## Uso no front

```tsx
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

function NewBillingDashboard() {
  const isEnabled = useFeatureFlag("new_billing_dashboard");
  if (!isEnabled) return <LegacyDashboard />;
  return <NewDashboard />;
}
```

Chave inexistente sempre retorna `false` — sem crash.

## Ordem de avaliação
1. `enabled === false` → `false`
2. `userId` está em `enabled_for_user_ids` → `true`
3. `enabled_for_roles` definido e usuário não tem nenhuma dessas roles → `false`
4. `rollout_percentage >= 100` → `true`
5. `rollout_percentage <= 0` sem outras restrições → `true` (flag ligada para todos)
6. Caso contrário, hash determinístico FNV-1a de `userId:key` → bucket 0-99 → liga se `bucket < rollout_percentage`

O hash é determinístico: o mesmo usuário sempre cai no mesmo bucket para a mesma flag, garantindo experiência consistente em rollouts graduais.

## Boas práticas
- Use `snake_case` na chave.
- Crie a flag desativada (`enabled = false`), depois suba o código que a consulta.
- Para rollout gradual: `enabled = true`, suba `rollout_percentage` em etapas (10 → 25 → 50 → 100).
- Para canário interno: use `enabled_for_user_ids` com IDs do time.
- Remova flags antigas do banco quando a feature for considerada estável (>30 dias a 100%).

## Cache
React Query com `staleTime: 5min`. Mudanças no admin invalidam imediatamente via `queryClient.invalidateQueries(["feature_flags"])`.

## Admin
`/settings/feature-flags` — CRUD completo, restrito a `admin`.
