# Infraestrutura, Build, PWA e Testes

> Módulo da hierarquia **[AGENTS.md](../../AGENTS.md)** · Domínios transversais em [_transversais.md](./_transversais.md).
> Fonte: re-auditoria de 2026-07-21 — ver [docs/audit/AUDITORIA_2026-07-21.md](../audit/AUDITORIA_2026-07-21.md). Regras de negócio detalhadas de cobrança em [docs/REGRAS_DE_COBRANCA.md](../REGRAS_DE_COBRANCA.md).

## Escopo

Fundação do app: build Vite+SWC com chunking manual, PWA via vite-plugin-pwa/Workbox (autoUpdate, manifest estático), shell de UI (App/AppLayout/AnimatedRoutes com lazy+retry e três boundaries de erro), cliente Supabase gerado e infra de testes Vitest. Estado geral sólido e bem alinhado ao MAPA; principais pendências são código morto residual (2 exports no-op, mocks/http.ts órfão, example.test.ts placeholder, placeholder.svg), ausência de typecheck/CI, client.ts sem validação de env e coexistência de dois service workers no escopo '/'.

## Fluxos (rota → componente → hook → edge → tabela)

- index.html#root → src/main.tsx (createRoot) → src/App.tsx (ErrorBoundary→QueryClientProvider→BrowserRouter→GlobalErrorHandler→AuthProvider→RealtimeProvider) → AnimatedRoutes
- AnimatedRoutes → ProtectedRoute(allowedRoles/requireStaff) → LazyPage(LazyErrorBoundary+Suspense[HoneycombLoader]+PageTransition) → página lazy (lazyWithRetry 3x) → AppLayout(shell) → hooks/React Query → supabase client → PostgREST/Edge/Storage
- /billing/delinquency → ProtectedRoute(admin/manager/financial) → DelinquencyReportPage envolto em PageErrorBoundary → em crash: supabase.from('application_logs').insert({level:error, module:ui, action:page_crash})
- AppLayout header: submit da busca → regex ^#?\d+$ → navigate('/tickets?search=') senão navigate('/clients?search=')
- PWA: vite-plugin-pwa(autoUpdate) gera sw.js (Workbox) — precache globPatterns + runtimeCaching NetworkFirst p/ *.supabase.co (50 entradas/24h); manifest via public/manifest.json ligado no index.html
- Teste: src/test/integration/generate-invoices.test.ts → helpers/factories.ts + mocks/supabase.ts → supabase/functions/generate-monthly-invoices/logic.ts (medido em coverage.include)

## Regras de negócio

- lazyWithRetry: reimporta módulo lazy até 3 tentativas com atraso exponencial (1s*tentativa) — AnimatedRoutes.tsx:15-28
- Falha de chunk dinâmico (unhandledrejection com 'Failed to fetch dynamically imported module'/'Loading chunk') → toast + window.location.reload() após 2s — App.tsx:46-49
- Gate de rota por papel: ProtectedRoute allowedRoles/requireStaff por rota (ex.: /billing = admin/manager/financial; /settings/feature-flags = admin) — AnimatedRoutes.tsx:148-188
- GamificationGuard: se feature flag 'gamification_enabled' off → Navigate to '/' — AnimatedRoutes.tsx:127-131
- Busca global: entrada casando ^#?\d+$ vai p/ tickets, senão p/ clientes — AppLayout.tsx:91-96
- Tema: persistido em localStorage; 'system' resolve via matchMedia(prefers-color-scheme) e reage a mudança — AppLayout.tsx:36-74
- SessionExpiryIndicator: alerta quando restam <10min (WARNING) e crítico <2min (CRITICAL); atualiza a cada 30s — SessionExpiryIndicator.tsx:13-15,38,44,48
- Cache React Query global: retry 1, staleTime 5min, gcTime 15min, sem refetch on focus/reconnect/mount — App.tsx:14-25
- PageErrorBoundary registra crash em application_logs (level=error, module=ui, action=page_crash, context com page/stack/url) — PageErrorBoundary.tsx:41-54
- Workbox runtimeCaching: NetworkFirst 'supabase-cache' p/ *.supabase.co, maxEntries 50, maxAge 24h — vite.config.ts:57-68
- navigateFallback:null — sem fallback SPA para navegação offline — vite.config.ts:56

## Arquivos-chave

- `vite.config.ts` — Config Vite: React SWC, mcpPlugin(Lovable), componentTagger(dev), VitePWA(autoUpdate, manifest:false, Workbox NetworkFirst p/ *.supabase.co), manualChunks de vendors, alias @, dedupe react
- `vitest.config.ts` — Config Vitest: jsdom, globals, setup.ts, include src/**/*.{test,spec}, coverage v8 com 5 entradas include
- `index.html` — Shell HTML pt-BR: meta OG/twitter, link manifest, theme-color #ffb300, #root + main.tsx; favicon externo (storage.googleapis.com)
- `tailwind.config.ts` — Tema Tailwind com CSS vars HSL, keyframes e animações, tailwindcss-animate
- `postcss.config.js` — PostCSS: tailwindcss + autoprefixer
- `components.json` — Config shadcn CLI (baseColor slate, cssVariables, aliases)
- `tsconfig.json` — TS raiz frouxo (strictNullChecks:false, files=deno.d.ts); não inclui src _(uso: parcial)_
- `tsconfig.app.json` — TS do app (bundler, react-jsx, types vitest/globals, include src)
- `tsconfig.node.json` — TS estrito só para vite.config.ts
- `package.json` — Scripts (dev/build/lint/test) e deps; packageManager bun@1.1.30
- `src/main.tsx` — createRoot render <App/> + import index.css
- `src/App.tsx` — Árvore de providers (ErrorBoundary>QueryClient>Tooltip>Toasters>BrowserRouter>GlobalErrorHandler>AuthProvider>RealtimeProvider>AnimatedRoutes); QueryClient tunado; GlobalErrorHandler p/ unhandledrejection + reload em chunk-load fail
- `src/vite-env.d.ts` — Referência de tipos vite/client
- `src/components/layout/AnimatedRoutes.tsx` — Tabela de rotas; lazyWithRetry(3x); LazyErrorBoundary+LazyFallback(HoneycombLoader); GamificationGuard(feature flag); ProtectedRoute com allowedRoles/requireStaff; redirects legados
- `src/components/layout/AppLayout.tsx` — Chrome do app: sidebar+header, toggle de tema (localStorage+matchMedia), busca global (#ticket vs cliente), SessionExpiryIndicator, NotificationDropdown
- `src/components/layout/AppSidebar.tsx` — Navegação lateral (menu de setores)
- `src/components/layout/PageTransition.tsx` — Passthrough <div> (animações desativadas); + RouteChangeLoader/RouteProgressBar que retornam null _(uso: parcial)_
- `src/components/layout/GlobalProgress.tsx` — Barra de progresso topo via useIsFetching (React Query)
- `src/components/layout/BackgroundPattern.tsx` — Fundo decorativo estático memoizado (hexágonos/orbs)
- `src/components/layout/SessionExpiryIndicator.tsx` — Badge de contagem regressiva quando sessão <10min (crítico <2min)
- `src/components/ErrorBoundary.tsx` — Boundary global (class): logger.componentError, ações retry/voltar ao início; aceita fallback
- `src/components/common/PageErrorBoundary.tsx` — Boundary por-página: registra crash em application_logs (level error, module ui, action page_crash) + UI retry/voltar _(uso: parcial)_
- `src/integrations/supabase/client.ts` — Cliente Supabase gerado (localStorage/persist/autoRefresh)
- `public/manifest.json` — Manifest PWA (standalone, ícones, theme #ffb300, background #0f1114)
- `public/pwa-icons/*.png` — Ícones PWA 144/192/384/512
- `public/og-image.png` — Card social OG/twitter
- `public/favicon.ico` — Favicon local _(uso: parcial)_
- `public/robots.txt` — Diretivas de crawler _(uso: incerto)_
- `public/placeholder.svg` — Placeholder default do Lovable _(uso: nao)_
- `src/test/setup.ts` — Setup Vitest: jest-dom + mock de window.matchMedia
- `src/test/helpers/render.tsx` — renderWithProviders (QueryClient+MemoryRouter) p/ testes de componente
- `src/test/helpers/factories.ts` — Factories makeInvoice/Client/Contract/User/TicketFormData
- `src/test/mocks/supabase.ts` — createSupabaseMock: builder chainable + spies (insert/update/invoke)
- `src/test/mocks/http.ts` — mockFetchOnce/restoreFetch p/ fetch externo _(uso: nao)_
- `src/test/example.test.ts` — Teste placeholder (expect(true).toBe(true)) _(uso: parcial)_
- `src/test/integration/*.test.*` — 8 testes de integração (audit-logs, delinquency-page, generate-invoices, login, merge-clients, notify-due-invoices, resend-confirmation, user-management)

## Código morto — tratado na Fase 2 ou pendente de decisão

- `RouteChangeLoader` (src/components/layout/PageTransition.tsx:12) — Retorna null; 0 usos externos
- `RouteProgressBar` (src/components/layout/PageTransition.tsx:17) — Retorna null; 0 usos externos
- `mockFetchOnce / restoreFetch (arquivo inteiro)` (src/test/mocks/http.ts) — Nenhum teste importa; restoreFetch é no-op
- `example.test.ts` (src/test/example.test.ts) — Teste placeholder sem cobertura real (expect(true).toBe(true))
- `placeholder.svg` (public/placeholder.svg) — Asset default do Lovable, não referenciado

## Notas de divergência (auditoria vs MAPA antigo)

- MAPA §3.18 (linha 946) afirma que os testes exercitam logic.ts de 4 edges incluindo detect-auth-anomalies — FALSO: detect-auth-anomalies só tem index.ts+logic.ts (sem *_test.ts) e NÃO está em vitest coverage.include; os testes src cobrem 3 edges (generate-monthly-invoices, notify-due-invoices, resend-confirmation)
- MAPA (linhas 957/978) alega 'theme-color divergente' entre index.html e manifest — na prática coincidem (#ffb300 em ambos: index.html:25 e manifest.json:8); só background_color difere (manifest #0f1114; index.html não define)
- MAPA (linha 963) trata mocks/http.ts apenas como 'restoreFetch no-op' — na verdade o arquivo inteiro é órfão: nem mockFetchOnce nem restoreFetch são importados por qualquer teste
- MAPA §3.18 lista corretamente RouteChangeLoader e example.test.ts como código morto a auditar (linha 979), mas omite RouteProgressBar (também no-op/0 refs) e public/placeholder.svg (0 refs)
- MAPA foca coverage.include só em edges; na realidade coverage.include tem 5 entradas incluindo src/lib/ticket-payload.ts e src/pages/Login.tsx (vitest.config.ts:16-21)
- Nota de alinhamento: MAPA (linha 942) inclui src/components/ui/sidebar.tsx no módulo — confere (primitivo shadcn usado por AppSidebar); vitest include é src/** apenas, então as *_test.ts sob supabase/functions NÃO rodam neste Vitest (só via imports nos testes de integração src)

