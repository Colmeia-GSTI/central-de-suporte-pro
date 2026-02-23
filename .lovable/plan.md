

# Correcao: Email sintetico com dominio invalido na Edge Function create-client-user

## Problema

Os logs mostram o erro repetido:

```
Error creating auth user: AuthApiError: Unable to validate email address: invalid format
Synthetic email: adriana.krauzer@sociedade-cultural-recreativa-.internal
```

O dominio `sociedade-cultural-recreativa-` termina com hifen, o que e invalido para email.

## Causa Raiz

No arquivo `supabase/functions/create-client-user/index.ts`, o slug do cliente e gerado assim:

```text
.replace(/^-|-$/g, "")   <-- remove hifens das pontas
.substring(0, 30)         <-- corta em 30 chars, REINTRODUZINDO hifen no final
```

O nome "SOCIEDADE CULTURAL RECREATIVA E BENEF SAO JOAO BOSCO" gera o slug `sociedade-cultural-recreativa-e-benef-sao-joao-bosco`. Apos o `substring(0, 30)`, fica `sociedade-cultural-recreativa-` (com hifen no final).

## Correcao

Adicionar um segundo `.replace(/-$/g, "")` APOS o `substring` e um fallback para slug vazio:

**Arquivo:** `supabase/functions/create-client-user/index.ts` (linhas 120-126)

De:
```typescript
const clientSlug = clientData.name
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .substring(0, 30);
```

Para:
```typescript
const clientSlug = clientData.name
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .substring(0, 30)
  .replace(/-$/g, "") || "client";
```

Isso garante que:
1. O hifen reintroduzido pelo corte sera removido
2. Se o slug ficar vazio por algum motivo, usa "client" como fallback

## Resultado Esperado

O email sintetico passara a ser `adriana.krauzer@sociedade-cultural-recreativa.internal` (dominio valido).

