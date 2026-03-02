
# Correção de Telas Brancas e Otimização de Performance

## Causas Raiz Identificadas

### 1. Sem handler global para erros assíncronos não capturados
Quando uma Promise falha sem `try/catch` (ex: falha de rede, erro em Edge Function), o React "morre" silenciosamente e exibe tela branca. Não existe nenhum handler `unhandledrejection` no sistema.

### 2. Lazy loading sem proteção contra falha de carregamento
Os ~25 componentes lazy-loaded (`React.lazy`) não têm retry nem Error Boundary dedicado. Se o chunk JS falhar ao carregar (rede instável, deploy novo), a tela fica branca sem feedback.

### 3. Possível duplicação de instância do React
O `vite.config.ts` não tem `resolve.dedupe` para React, o que pode causar hooks corrompidos e crash silencioso.

### 4. Conflito de configuração de refetch
O `usePermissionOverrides` tem `refetchOnWindowFocus: true` enquanto o QueryClient global tem `false`. Isso causa re-render em cascata ao voltar à aba, podendo "piscar" a UI.

### 5. ErrorBoundary apenas no nível raiz
Se um componente de página quebra, o ErrorBoundary raiz captura mas reseta TODA a aplicação. Sem Error Boundaries por rota, qualquer erro em uma página derruba tudo.

---

## Alterações Propostas

### Arquivo: `src/App.tsx`
- Adicionar `useEffect` com listener `window.addEventListener("unhandledrejection")` para capturar Promises não tratadas, exibir toast de erro e prevenir crash
- Envolver em um componente interno (`AppInner`) para poder usar hooks dentro do `QueryClientProvider`

### Arquivo: `vite.config.ts`
- Adicionar `resolve.dedupe: ["react", "react-dom", "react/jsx-runtime"]` para forçar instância única do React

### Arquivo: `src/components/layout/AnimatedRoutes.tsx`
- Criar componente `LazyErrorBoundary` que captura erros de chunk com botão "Recarregar"
- Adicionar lógica de retry automático no `React.lazy` (até 3 tentativas com delay) para chunks que falham ao carregar
- Envolver cada `LazyPage` com Error Boundary dedicado em vez de depender apenas do raiz

### Arquivo: `src/hooks/usePermissionOverrides.ts`
- Remover `refetchOnWindowFocus: true` para alinhar com a configuração global e evitar re-renders desnecessários ao voltar à aba

### Arquivo: `src/components/auth/ProtectedRoute.tsx`
- Reduzir o safety timeout de auth de 5s (em useAuth) para garantir que o loading nunca "trava" -- já existe, mas validar que funciona corretamente com as novas mudanças

---

## Detalhes Técnicos

| Alteração | Impacto |
|---|---|
| Handler `unhandledrejection` | Previne crash silencioso, exibe toast amigável |
| `resolve.dedupe` no Vite | Elimina bugs de hooks por React duplicado |
| Retry em `React.lazy` | Chunks que falham tentam recarregar 3x antes de mostrar erro |
| Error Boundary por rota | Erro em uma página não derruba o sistema inteiro |
| Remover `refetchOnWindowFocus` em overrides | Elimina re-renders em cascata ao voltar à aba |

| Arquivo | O que muda |
|---|---|
| `src/App.tsx` | Adicionar handler global de unhandled rejections |
| `vite.config.ts` | Adicionar `resolve.dedupe` para React |
| `src/components/layout/AnimatedRoutes.tsx` | Retry em lazy imports + Error Boundary por rota |
| `src/hooks/usePermissionOverrides.ts` | Remover `refetchOnWindowFocus: true` |
