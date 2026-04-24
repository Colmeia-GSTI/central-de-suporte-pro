# TESTING.md — Estratégia de testes

## Visão geral

Este projeto tem uma rede de segurança automatizada que cobre **5 fluxos críticos** para evitar regressões grandes antes que cheguem à produção.

Os testes rodam em **Vitest + jsdom**, com mocks do Supabase client (não tocam rede real). Cada teste roda em isolamento — não dependem de ordem nem de estado externo.

## Stack

- **Runner:** Vitest 3.x (`bunx vitest run`)
- **DOM:** jsdom (configurado em `vitest.config.ts`)
- **React:** @testing-library/react + @testing-library/user-event
- **Mocks:** mock chainable em `src/test/mocks/supabase.ts` (sem MSW — escolha consciente para manter execução < 500ms por teste)
- **Cobertura:** @vitest/coverage-v8 (`bunx vitest run --coverage`)

## Estrutura

```
src/test/
  setup.ts                 # matchMedia stub + jest-dom
  mocks/
    supabase.ts           # createSupabaseMock() chainable
    http.ts               # mockFetchOnce() para chamadas externas
  helpers/
    render.tsx            # renderWithProviders (QueryClient + MemoryRouter)
    factories.ts          # makeUser, makeClient, makeContract, makeInvoice, makeTicketFormData
  integration/
    login.test.tsx                  # 3 testes — fluxo de login (frontend)
    create-ticket.test.tsx          # 3 testes — buildTicketPayload (lógica pura)
    generate-invoices.test.ts       # 3 testes — edge function logic
    notify-due-invoices.test.ts     # 3 testes — edge function logic
    resend-confirmation.test.ts     # 3 testes — edge function logic
```

## Refator habilitado pelos testes

Para tornar lógicas testáveis sem rodar Deno nem renderizar componentes inteiros, fizemos 2 extrações:

1. **`src/lib/ticket-payload.ts`** — `buildTicketPayload()` extraído de `TicketForm.tsx`. O componente passou a chamar a função pura.
2. **`supabase/functions/<edge>/logic.ts`** — handlers puros para `generate-monthly-invoices`, `notify-due-invoices` e `resend-confirmation`. Recebem o supabase client por parâmetro (sem imports `npm:`), espelhando o caminho de decisão do `index.ts` de produção. O `Deno.serve(...)` em `index.ts` permanece a fonte de produção; os arquivos `logic.ts` são alvo dedicado de testes.

## Como rodar

```bash
bun test                       # todos os testes
bunx vitest run src/test/integration   # só os 5 fluxos críticos
bunx vitest run --coverage     # com relatório de cobertura
bunx vitest                    # modo watch
```

## Cobertura medida

| Arquivo | % Stmts | % Branch |
|---|---|---|
| `src/lib/ticket-payload.ts` | 96.87 | 77.77 |
| `src/pages/Login.tsx` | 70.85 | 52.94 |
| `supabase/functions/generate-monthly-invoices/logic.ts` | 82.02 | 57.14 |
| `supabase/functions/notify-due-invoices/logic.ts` | 81.08 | 50.00 |
| `supabase/functions/resend-confirmation/logic.ts` | 77.41 | 66.66 |
| **Média (alvo: >70%)** | **77.77** | **60.78** |

## Convenções

- Cada fluxo tem 3 testes: **happy path**, **erro de input**, **erro de backend / edge case**.
- Cada teste deve rodar em **< 500ms** (use mocks, evite timers reais).
- **Zero flakiness:** não depender de ordem de execução, de horário do sistema (use `Date.now()` apenas via factories), nem de rede.
- Use `renderWithProviders()` para componentes — já injeta QueryClient e Router.
- Use `createSupabaseMock({ tables, functions })` para mockar respostas — qualquer chain (`.select().eq().limit().single()`) resolve com o mesmo `{data, error}` configurado para a tabela.

## Quando expandir

Adicione testes para:
- Novos handlers de edge function — extraia a lógica para `logic.ts` antes.
- Refatorações grandes de hooks/lib — escreva o teste **antes** da refatoração para travar comportamento.
- Bugs corrigidos — adicione um teste que falha sem o fix.

Não adicione testes para componentes puramente visuais ou queries triviais — eles inflam a suíte sem ganho real.
