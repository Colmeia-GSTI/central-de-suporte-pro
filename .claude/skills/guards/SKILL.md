---
name: guards
description: Roda a bateria completa de verificação do projeto (type-check, testes, build, deno) antes de commitar ou pedir deploy. Use quando terminar uma mudança e antes de qualquer push.
disable-model-invocation: true
---

# Guards do projeto

Não há CI. Estes comandos **são** a rede de segurança — rode-os você mesmo e mostre a saída.

## Frontend (sempre)
```bash
bunx tsc --noEmit     # baseline: 0 erros. Qualquer erro novo é regressão sua.
bun run test          # baseline: 12 arquivos / 78 testes passando
```
`bun run build` **não** falha em erro de tipo — por isso o `tsc` separado é obrigatório.

## Edge functions (se tocou em supabase/functions/)
```bash
deno test -A --no-lock supabase/functions/<funcao>/
```
`tsconfig` só cobre `src/`, então o `tsc` acima **não vê** as edges. `deno` está em `~/.deno/bin`.

## Build (se tocou em config de build, PWA ou dependências)
```bash
bun run build
git diff --stat -- supabase/functions/mcp/index.ts   # DEVE estar vazio
```
⚠️ No Windows o `mcpPlugin()` corrompe `supabase/functions/mcp/index.ts` a cada build
(gera 8 linhas com um `import npm:C:\…` inválido, apagando as 4 ferramentas MCP).
Se o diff não estiver vazio: `git restore supabase/functions/mcp/index.ts`.

## Docs (se removeu ou moveu arquivo .md)
Confira que nenhum link ficou órfão antes de commitar.

## Regra
Reporte o resultado real. Teste que falhou é reportado com a saída, não omitido.
Se um guard não pôde rodar, diga qual e por quê — não declare "tudo verde" por omissão.
