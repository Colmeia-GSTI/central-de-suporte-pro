# Plano — QA Completo das Mudanças desta Etapa

## Escopo coberto
1. **Seção 0.3** — Testes de integração (5 fluxos) + refactors de testabilidade
2. **Item 1.1** — Reparo `/billing/delinquency`, `PageErrorBoundary`, `unwrapEmbed`
3. **Itens prévios** — `useFeatureFlag`, `FeatureFlagsPage`, rota protegida

## Fase 1 — Validação automatizada (sem browser)

Executar em sequência e reportar output bruto:

1. **TypeScript**: `bunx tsc --noEmit` — esperado 0 erros
2. **Suite de integração**: `bunx vitest run src/test/integration` — esperado 18/18 passando
   - `login.test.tsx` (3)
   - `create-ticket.test.tsx` (3)
   - `generate-invoices.test.ts` (3)
   - `notify-due-invoices.test.ts` (3)
   - `resend-confirmation.test.ts` (3)
   - `delinquency-page.test.tsx` (3)
3. **Suite completa**: `bunx vitest run` — capturar total (incluindo `useAuth.test.tsx`, `ProtectedRoute.test.tsx`, `example.test.ts`, `asaas-nfse_test.ts`, `banco-inter_test.ts`); reportar falhas pré-existentes sem corrigir
4. **Coverage dos 5 fluxos-alvo**: `bunx vitest run --coverage src/test/integration` — esperado >70% médio nos arquivos:
   - `src/pages/Login.tsx`
   - `src/lib/ticket-payload.ts`
   - `supabase/functions/generate-monthly-invoices/logic.ts`
   - `supabase/functions/notify-due-invoices/logic.ts`
   - `supabase/functions/resend-confirmation/logic.ts`
5. **Build**: `bunx vite build` — esperado sucesso, sem warnings novos
6. **Lint**: `bun run lint` — reportar mas não bloquear em warnings pré-existentes

## Fase 2 — QA de interface no preview (browser tools)

Login com sessão atual do usuário no preview. Para cada cenário, screenshot + observação.

### 2.1 Página `/billing/delinquency` (Item 1.1)
- Navegar para `/billing/delinquency`
- Verificar: página carrega sem crash, lista de inadimplentes renderiza, gráfico aparece, filtros funcionam
- Verificar console: nenhum `TypeError`, sem warning de `unwrapEmbed` salvo se houver órfão real
- Testar busca por nome de cliente
- Testar checkbox de seleção e botão de notificação em lote (sem disparar — só validar UI habilitar/desabilitar)

### 2.2 `PageErrorBoundary` (resiliência)
- Verificar que `DelinquencyReportPage` está envolto pelo `PageErrorBoundary` no código
- **Sem disparar crash real em produção**: validar apenas via teste unitário já existente (`delinquency-page.test.tsx`) que cobre os 3 shapes de embed
- Reportar que o boundary loga em `application_logs` (módulo `ui`, ação `page_crash`) — citar query SQL para verificação posterior caso o usuário queira

### 2.3 `/settings/feature-flags` (etapa prévia)
- Navegar para `/settings/feature-flags`
- Confirmar proteção por role admin (se usuário logado for admin, página renderiza; senão redirect `/unauthorized`)
- Verificar listagem de flags, toggle on/off, persistência (refresh da página mantém estado)

### 2.4 Login (`src/pages/Login.tsx`)
- Já testado por `login.test.tsx` em integração — não logar/deslogar manualmente para não quebrar a sessão atual

### 2.5 Criar ticket (`/tickets/new`)
- Navegar para `/tickets/new`
- Verificar form renderiza, dropdowns carregam (cliente, categoria, prioridade)
- **Não submeter** — apenas validar que `buildTicketPayload` extraído continua produzindo payload via lógica do form

## Fase 3 — Banco de dados (read-only)

Queries de sanidade via `supabase--read_query`:

1. **Logs de crash da boundary** (últimas 24h):
   ```sql
   select created_at, message, context->>'page' as page
   from application_logs
   where module='ui' and action='page_crash'
   order by created_at desc limit 10;
   ```
2. **Feature flags ativas**:
   ```sql
   select key, enabled, description from feature_flags order by key;
   ```
3. **Sanidade de invoices com client embed** (confirma que dados batem com o que a página espera):
   ```sql
   select count(*) filter (where client_id is null) as orfas,
          count(*) as total
   from invoices where status='overdue';
   ```

## Fase 4 — Relatório final

Reporte estruturado contendo:

| Item | Resultado | Evidência |
|---|---|---|
| TS errors | 0 / N | output `tsc` |
| Testes integração | 18/18 ou X/18 | output vitest |
| Coverage 5 fluxos | X% | output coverage |
| Build | OK / FAIL | output vite |
| `/billing/delinquency` UI | OK / FAIL | screenshot |
| `/settings/feature-flags` UI | OK / FAIL | screenshot |
| `/tickets/new` UI | OK / FAIL | screenshot |
| Logs de crash 24h | N registros | query result |
| Bloqueios | lista | — |

## Não fazer
- Não corrigir nada encontrado — apenas reportar
- Não submeter formulários reais (criar ticket, notificar inadimplente)
- Não fazer logout / mudar de usuário
- Não tocar em arquivos de produção
- Não expandir escopo para outras páginas

## Aprovação
Aguardo OK para sair do plan mode e executar as 4 fases. Se preferir pular a Fase 2 (browser, mais cara), me avise — Fases 1+3+4 já dão cobertura forte via testes automatizados + DB.
