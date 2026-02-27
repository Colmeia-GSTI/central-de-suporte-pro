

# Correção do Erro de Build: batch-process-invoices

## Problema

A edge function `supabase/functions/batch-process-invoices/index.ts` importa `z` de `npm:zod@3.23.8`, mas o ambiente Deno nao consegue resolver esse pacote. O erro impede o deploy das edge functions.

## Causa Raiz

O formato `npm:zod@3.23.8` depende de configuracao especifica no `deno.json` ou de `nodeModulesDir: "auto"`. Como o projeto usa Lovable Cloud, o padrao e importar de CDN (esm.sh) para edge functions.

## Correcao

### Arquivo: `supabase/functions/batch-process-invoices/index.ts`

Substituir a linha 2:

```typescript
// De:
import { z } from "npm:zod@3.23.8";

// Para:
import { z } from "https://esm.sh/zod@3.23.8";
```

Isso alinha com o padrao usado em outras edge functions do projeto que importam dependencias externas via esm.sh.

## Verificacao Adicional

Verificar se ha outras edge functions com o mesmo padrao `npm:` que possam causar o mesmo erro.

## Impacto

- Corrige o erro de build atual
- Nenhuma alteracao funcional - apenas o metodo de importacao muda
- A funcionalidade do zod permanece identica
