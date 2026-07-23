---
paths:
  - "supabase/functions/**"
---

# Convenções das Edge Functions (Deno)

Carregado automaticamente ao tocar em `supabase/functions/`.

## ⚠️ Push não deploya edge function
Commit + `git push` sincroniza o **código-fonte** e o Lovable rebuilda o **frontend**, mas as funções
Deno **não sobem sozinhas**. Deploy é passo separado — invoque a skill `/deploy-edge`.

## Estrutura
- `index.ts` (handler HTTP) + **`logic.ts`** (regra pura, testável, recebe o client por parâmetro)
  + `*_test.ts`. Extraia para `logic.ts` ao tocar numa edge que ainda não segue o padrão.
- Helpers compartilhados em `supabase/functions/_shared/` (`auth-helpers`, `email-helpers`,
  `notification-logger`, templates de e-mail). **Reutilize antes de escrever.**
- Segredos vêm de `Deno.env.get(...)` — secrets do Lovable Cloud/Supabase. Nunca hardcode.

## verify_jwt
`supabase/config.toml` controla `verify_jwt` por função. **Webhook de provedor externo exige
`verify_jwt = false`** — sem isso o provedor recebe 401 e o evento se perde silenciosamente.
Crons chamam edges com `Authorization: Bearer <service-role>`, então `verify_jwt = true` é o correto lá.

## Guard local (deno)
`bunx tsc` **não cobre** `supabase/functions/` — o tsconfig só inclui `src/`. Use deno:

```bash
deno test -A --no-lock supabase/functions/<funcao>/   # type-check + testes
deno check supabase/functions/<funcao>/index.ts       # só type-check
```
`deno` está em `~/.deno/bin`. Rode isso antes de pedir deploy — uma edge quebrada em produção
custa muito mais caro que 30 s de check.

## Cuidados
- Edges de dinheiro (`asaas-nfse`, `generate-monthly-invoices`, `banco-inter`, `manual-payment`)
  mexem em cobrança real. Mudança ali exige teste + revisão, nunca "deve funcionar".
- Erro em integração externa é **não-fatal** por padrão nos notificadores (log e segue);
  em fluxo de cobrança é **fail-closed** (aborta em vez de prosseguir às cegas).
