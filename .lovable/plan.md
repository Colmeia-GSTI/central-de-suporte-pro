

# Otimizacao de Consumo de Recursos - Implementacao

Todas as 7 otimizacoes serao aplicadas conforme o plano ja aprovado anteriormente.

## Alteracoes

### 1. Auth - Eliminar queries duplicadas
**Arquivo:** `src/hooks/useAuth.tsx`
- Adicionar `lastFetchRef = useRef<number>(0)` junto aos outros refs
- No `fetchUserData`, verificar `Date.now() - lastFetchRef.current < 5000` para pular re-fetch recente
- Atualizar `lastFetchRef.current = Date.now()` no inicio de cada fetch real
- Resultado: de 3 fetches de profiles/user_roles para 1 no carregamento inicial

### 2. TV Dashboard - Pausa em background
**Arquivo:** `src/pages/tv-dashboard/TVDashboardPage.tsx`
- Adicionar `refetchIntervalInBackground: false` nas 4 queries existentes (linhas 53-55, 69-71, 103-105, 118-120)
- Resultado: polling pausa automaticamente quando a aba nao esta visivel

### 3. TV Dashboard - Ranking via RPC
**Arquivo:** `src/pages/tv-dashboard/TVDashboardPage.tsx`
- Substituir a query N+1 do ranking (linhas 73-105) pela RPC `get_technician_ranking`
- Elimina 2 queries separadas (technician_points + profiles) por 1 chamada RPC

### 4. Sidebar Badge - Filtro por role
**Arquivo:** `src/hooks/useTechnicianTicketCount.ts`
- Importar `roles` do `useAuth` (ja disponivel no hook)
- Condicionar `enabled` para rodar apenas quando o usuario tem role `technician`
- Resultado: elimina polling de 5 minutos para admins, financeiros e managers

### 5. Dashboard - Aumentar staleTime de Recent Tickets
**Arquivo:** `src/pages/Dashboard.tsx`
- Linha 101: alterar `staleTime: 1000 * 30` para `staleTime: 1000 * 120`
- Resultado: menos refetches ao navegar entre paginas

### 6. MessageMetrics - Limite de registros
**Arquivo:** `src/components/settings/MessageMetricsDashboard.tsx`
- Linha 24: adicionar `.limit(500)` na query de `message_logs`
- Resultado: protecao contra carga excessiva de dados

### 7. AgingReport - Adicionar staleTime
**Arquivo:** `src/components/billing/AgingReportWidget.tsx`
- Adicionar `staleTime: 120000` na query (junto ao `refetchInterval` existente)
- Resultado: evita refetches duplicados ao navegar entre abas

## Detalhes Tecnicos

### useAuth.tsx - Guard de dedup (diff conceitual)
```text
+ const lastFetchRef = useRef<number>(0);

  const fetchUserData = useCallback(async (userId: string) => {
+   // Skip if fetched recently (dedup guard)
+   if (Date.now() - lastFetchRef.current < 5000) {
+     logger.debug("Skipping fetch - data loaded recently", "Auth");
+     return;
+   }
+   lastFetchRef.current = Date.now();
    // ... rest of fetch logic unchanged
```

### useTechnicianTicketCount.ts - Role filter (diff conceitual)
```text
  export function useTechnicianTicketCount() {
-   const { user } = useAuth();
+   const { user, roles } = useAuth();
+   const isTechnician = roles.includes("technician");

    return useQuery({
      // ...
-     enabled: !!user?.id,
+     enabled: !!user?.id && isTechnician,
```

### TVDashboardPage.tsx - Background pause + RPC (diff conceitual)
```text
  // Todas as 4 queries recebem:
  + refetchIntervalInBackground: false,

  // Ranking substituido por:
  const { data } = await supabase.rpc("get_technician_ranking", {
    start_date: new Date(Date.now() - 365*24*60*60*1000).toISOString(),
    limit_count: 5,
  });
```

## Resumo de Impacto

| Otimizacao | Requests Eliminados |
|---|---|
| Auth dedup | ~4 requests/login |
| TV background pause | ~4.320/dia (aba oculta) |
| TV ranking RPC | 1 em vez de 2 queries |
| Sidebar badge filter | ~288/dia (nao-tecnicos) |
| Dashboard staleTime | Variavel (navegacao) |
| MessageMetrics limit | Protecao de egress |
| AgingReport staleTime | Variavel (navegacao) |

## Arquivos a Modificar
- `src/hooks/useAuth.tsx`
- `src/pages/tv-dashboard/TVDashboardPage.tsx`
- `src/hooks/useTechnicianTicketCount.ts`
- `src/pages/Dashboard.tsx`
- `src/components/settings/MessageMetricsDashboard.tsx`
- `src/components/billing/AgingReportWidget.tsx`

