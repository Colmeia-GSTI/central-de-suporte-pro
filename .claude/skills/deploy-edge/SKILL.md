---
name: deploy-edge
description: Deploya edge functions Deno alteradas no Lovable Cloud. Use sempre que tocar em supabase/functions/ e precisar que a mudança valha em produção — git push NÃO deploya edge function.
disable-model-invocation: true
---

# Deploy de Edge Function (Lovable Cloud)

Argumento: nomes das funções a deployar (ex.: `asaas-nfse notify-due-invoices`).
Sem argumento, descubra pelo diff quais funções em `supabase/functions/` mudaram.

## Por que esta skill existe
`git push` sincroniza o **código-fonte** com o Lovable e rebuilda o **frontend**, mas **não
redeploya as funções Deno**. Sem este passo, a edge em produção continua com o código antigo —
e o sintoma é confuso: o repo está certo, o comportamento não.

## Passos

1. **Guard local antes de tudo.** Uma edge quebrada em produção custa mais que 30 s de check:
   ```bash
   deno test -A --no-lock supabase/functions/<funcao>/
   ```
   Sem testes na função, ao menos `deno check supabase/functions/<funcao>/index.ts`.

2. **Confira o bundle MCP** (só se `bun run build` rodou nesta sessão):
   ```bash
   git diff --stat -- supabase/functions/mcp/index.ts   # tem que estar vazio
   ```
   Se aparecer alterado, `git restore supabase/functions/mcp/index.ts` — ver AGENTS.md §6.

3. **Commit e push** — o fonte precisa estar em `main` antes do deploy:
   ```bash
   git push origin HEAD:main
   ```

4. **Dispare o deploy** via `mcp__…_Lovable__send_message`, pedindo **apenas o deploy**.
   Texto que funciona (evita o agente reescrever código e queimar créditos):

   > Deploy only the following Edge Functions from the current `main` code, without any changes:
   > `<funcao-1>`, `<funcao-2>`.
   > Do NOT modify, rewrite, or improve any code. Do NOT touch migrations or data.
   > Just deploy the existing source as-is and confirm.

5. **⚠️ `send_message` quase sempre reporta falha por timeout (300 s) mesmo com o deploy OK.**
   Não retente às cegas — isso duplica o trabalho e gasta crédito. **Verifique**:
   ```
   mcp__…_Lovable__list_messages   → procure a confirmação do agente
   git fetch && git log origin/main --oneline -3   → commit "Deployed … Edge Func."
   ```

6. **Reporte** quais funções foram deployadas e com que evidência (mensagem do agente ou commit).

## Não faça
- Não peça ao agente do Lovable para "corrigir" ou "melhorar" nada — só deploy.
- Não use o MCP do Supabase (`deploy_edge_function`) — o backend é Lovable Cloud.
