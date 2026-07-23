---
paths:
  - "src/**/*.{ts,tsx}"
---

# Convenções do frontend

Carregado automaticamente ao tocar em qualquer arquivo de `src/`.

## Componentes
- Pequenos e focados. Passou de ~150–200 linhas, refatore em subcomponentes.
- **Cheque `src/components/ui/` antes de criar UI nova.** Faltando primitivo, instale via shadcn CLI.
- Telas em `src/pages/`; reutilizáveis em `src/components/<domínio>/`.

## Estilo
- **Somente Tailwind** — nada de CSS puro nem CSS-in-JS. Mobile-first (`sm:`, `md:`, …).
- Use as variáveis de tema do `tailwind.config.ts` (`primary`, `secondary`, …). shadcn `baseColor: slate`.

## Dados
- Client: `import { supabase } from "@/integrations/supabase/client";`
- Realtime: use o hook **`useUnifiedRealtime`** (não crie subscription avulsa).
- Lógica que exige segredo ou API de terceiro **mora em edge function**, nunca aqui.
- Estado de servidor via TanStack Query; estado local via hooks React.

## Permissões e validação
- UI protegida por `src/components/auth/PermissionGate.tsx` ou `usePermissions` (`can`/`canAny`/`canAll`).
  Isso é **UX apenas** — a proteção real é RLS + edge function.
- Todo formulário tem schema **Zod**.
- Não envolva tudo em `try/catch`; deixe o erro subir para o `ErrorBoundary`.

## Formatação (pt-BR)
| O quê | Fonte única |
|---|---|
| Moeda (BRL) | `src/lib/currency.ts` |
| Datas | `date-fns` (+ `date-fns-tz` para fuso) |
| Telefone | `src/lib/phone.ts` (`formatPhone`, `stripPhone`, `phoneToWhatsApp`) |
| Toasts | `sonner` (`toast.error` / `toast.success` / `toast`) |

Interface sempre em **português do Brasil**.

## Guard antes de commitar
```bash
bunx tsc --noEmit    # baseline é 0 erros — qualquer erro novo é regressão
bun run test         # 78 testes
```
