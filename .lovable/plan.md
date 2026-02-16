
# Correcao de Erros de Build em Edge Functions

## Erros Identificados e Correcoes

### 1. `generate-second-copy/index.ts` e `renegotiate-invoice/index.ts`
**Erro**: `Cannot find module 'npm:@supabase/functions-js/edge-runtime.d.ts'` + `'err' is of type 'unknown'`
**Correcao**: Remover a linha `import "npm:@supabase/functions-js/edge-runtime.d.ts"` (nao necessaria) e tipar o catch como `catch (err: unknown)` usando `err instanceof Error ? err.message : "Unknown error"`.

### 2. `asaas-nfse/index.ts` (linha 682)
**Erro**: Cast de array para objeto -- `contracts` retorna array quando usado via foreign key join sem `.single()`.
**Correcao**: Usar cast intermediario: `as unknown as { nfse_service_code: string | null } | null`.

### 3. `validate-invoice-numbering/index.ts` (linha 172)
**Erro**: `SequenceGap` nao e assignable a `Record<string, unknown>`.
**Correcao**: Cast explicito: `result = await detectSequenceGaps(client_id) as unknown as Record<string, unknown>`.

### 4. `webhook-banco-inter/index.ts` (multiplos erros)
**Erro**: Tipo generico do `createClient` nao alinha com a tipagem local. `insert`, `update` e acesso a `.id` falham.
**Correcao**: 
- Tipar `supabase` como `any` no parametro de `processPayload` para evitar conflito de generics.
- Alternativa: usar `createClient<any>` na criacao.

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/generate-second-copy/index.ts` | Remover import desnecessario, tipar catch |
| `supabase/functions/renegotiate-invoice/index.ts` | Remover import desnecessario, tipar catch |
| `supabase/functions/asaas-nfse/index.ts` | Fix cast na linha 682 |
| `supabase/functions/validate-invoice-numbering/index.ts` | Cast explicito na linha 172 |
| `supabase/functions/webhook-banco-inter/index.ts` | Tipar supabase como `any` em processPayload, usar `createClient<any>` |
