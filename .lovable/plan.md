
# Otimizacao de Consumo de Recursos - Colmeia GSTI

## Diagnostico Atual

Analise completa dos pontos de consumo excessivo identificados no sistema:

### Problema 1: Queries de Auth Duplicadas (CRITICO)
O `useAuth` faz fetch de `profiles` + `user_roles` no init. Quando `onAuthStateChange` dispara (evento `SIGNED_IN` ou `TOKEN_REFRESHED`), faz fetch novamente via `setTimeout`. Na rede, observam-se **3 chamadas duplicadas** de `profiles` e `user_roles` no carregamento inicial.

**Causa raiz:** O init busca os dados, depois o listener `onAuthStateChange` dispara quase simultaneamente e busca de novo, e em seguida um token refresh pode disparar mais uma vez.

**Correcao:** Adicionar um guard no `onAuthStateChange` para pular o `fetchUserData` se os dados ja foram carregados recentemente (debounce por timestamp).

### Problema 2: TV Dashboard Polling sem Visibility Check (CRITICO)
O `TVDashboardPage` tem **4 queries** com `refetchInterval` (120s-300s) que rodam continuamente, mesmo com a aba em segundo plano. Em um monitor TV ligado 24h, isso representa ~4.320 requests/dia. Mas se alguem abrir a pagina em uma aba do navegador e esquecer, o polling continua desnecessariamente.

**Correcao:** Adicionar `refetchIntervalInBackground: false` em todas as queries do TV Dashboard. Isso e nativo do React Query e pausa o polling quando a aba nao esta visivel.

### Problema 3: TV Dashboard Ranking com N+1 (MEDIO)
O ranking no TV Dashboard ainda usa o padrao antigo: busca `technician_points`, depois busca `profiles` em query separada. A RPC `get_technician_ranking` ja existe e faz tudo em uma unica query.

**Correcao:** Substituir as 2 queries por uma chamada RPC.

### Problema 4: useTechnicianTicketCount roda para todos (MEDIO)
O hook `useTechnicianTicketCount` e chamado no `AppSidebar` para **todos os usuarios**, inclusive admins e financeiros que nao precisam do badge. A propriedade `enabled: !!user?.id` nao filtra por role, gerando polling desnecessario a cada 5 minutos para usuarios que nunca verao o badge (ele so aparece no link "/tickets").

**Correcao:** Condicionar o `enabled` a roles que incluem `technician`, usando o `useAuth` que ja esta disponivel no hook.

### Problema 5: Dashboard staleTime curto para Recent Tickets (BAIXO)
A query `recent-tickets` no Dashboard tem `staleTime: 30s`, o que significa que ao navegar para outra pagina e voltar em menos de 1 minuto, ela refaz o fetch. Como o Realtime ja cobre atualizacoes de tickets, esse staleTime pode ser aumentado.

**Correcao:** Aumentar `staleTime` de 30s para 120s.

### Problema 6: MessageMetricsDashboard carrega TODOS os message_logs (BAIXO)
A query em `MessageMetricsDashboard` faz `select("channel, status")` sem limit, carregando **todos** os registros de `message_logs` para agregar no frontend. Com o tempo, isso pode se tornar milhares de registros.

**Correcao:** Adicionar `.limit(500)` como teto de seguranca. Em futuro, substituir por uma RPC de agregacao.

### Problema 7: AgingReportWidget sem staleTime (BAIXO)
O widget tem `refetchInterval: 5min` mas nenhum `staleTime`, o que significa que toda navegacao para a aba de conciliacao dispara um novo fetch mesmo que os dados tenham acabado de ser carregados.

**Correcao:** Adicionar `staleTime: 120000`.

---

## Plano de Implementacao

### Fase 1: Auth - Eliminar queries duplicadas

**Arquivo:** `src/hooks/useAuth.tsx`

Adicionar um `lastFetchRef` com timestamp para evitar re-fetch dentro de 5 segundos:
- Declarar `const lastFetchRef = useRef<number>(0)` no AuthProvider
- No `fetchUserData`, verificar se `Date.now() - lastFetchRef.current < 5000` e retornar cedo se verdadeiro
- Atualizar `lastFetchRef.current = Date.now()` no inicio de cada fetch real

Resultado esperado: de 3 fetches para 1 no carregamento inicial.

### Fase 2: TV Dashboard - Otimizar polling e ranking

**Arquivo:** `src/pages/tv-dashboard/TVDashboardPage.tsx`

1. Adicionar `refetchIntervalInBackground: false` em todas as 4 queries
2. Substituir a query de ranking (linhas 73-105) pela RPC `get_technician_ranking`:
```typescript
const { data } = await supabase.rpc("get_technician_ranking", {
  start_date: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  limit_count: 5,
});
return (data || []).map((r: any) => ({
  name: r.name,
  points: r.points,
}));
```

### Fase 3: Sidebar Badge - Condicionar por role

**Arquivo:** `src/hooks/useTechnicianTicketCount.ts`

Adicionar import de `useAuth` para verificar roles e condicionar `enabled`:
```typescript
const { user, roles } = useAuth();
const isTechnician = roles.includes("technician");
// ...
enabled: !!user?.id && isTechnician,
```

**Arquivo:** `src/components/layout/AppSidebar.tsx`

O hook ja retorna `0` quando desabilitado, nenhuma mudanca necessaria na sidebar.

### Fase 4: Ajustes de staleTime e limites

**Arquivo:** `src/pages/Dashboard.tsx` (linha 101)
- Alterar `staleTime: 1000 * 30` para `staleTime: 1000 * 120` na query `recent-tickets`

**Arquivo:** `src/components/settings/MessageMetricsDashboard.tsx` (linha 24)
- Adicionar `.limit(500)` na query de `message_logs`

**Arquivo:** `src/components/billing/AgingReportWidget.tsx` (linha 58)
- Adicionar `staleTime: 120000` na query

---

## Resumo de Impacto

| Otimizacao | Requests Eliminados | Impacto |
|---|---|---|
| Auth dedup | ~4 requests/login | Carregamento 200ms mais rapido |
| TV background pause | ~4.320/dia (se aba oculta) | Reducao massiva em cenario de aba esquecida |
| TV ranking RPC | 1 query em vez de 2 | Reducao de round-trips |
| Sidebar badge role filter | ~288/dia (para nao-tecnicos) | Elimina polling desnecessario |
| Dashboard staleTime | ~variavel | Menos refetches em navegacao |
| MessageMetrics limit | Protecao de egress | Evita carga de milhares de registros |
| AgingReport staleTime | ~variavel | Evita refetches duplicados |

## Arquivos a Modificar
- `src/hooks/useAuth.tsx` - Guard de dedup
- `src/pages/tv-dashboard/TVDashboardPage.tsx` - Background pause + RPC ranking
- `src/hooks/useTechnicianTicketCount.ts` - Role filter
- `src/pages/Dashboard.tsx` - staleTime
- `src/components/settings/MessageMetricsDashboard.tsx` - Limit
- `src/components/billing/AgingReportWidget.tsx` - staleTime
