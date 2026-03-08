

# Correção: PDF bloqueado pelo navegador (ERR_BLOCKED_BY_CLIENT)

## Causa Raiz

A função `openStorageFile` em `src/lib/storage-utils.ts` faz:
1. Abre `window.open("about:blank")` 
2. Baixa o arquivo via `supabase.storage.download()`
3. Cria um `blob:` URL e navega a aba para ele

O Microsoft Edge (e outros navegadores com proteções de segurança) **bloqueia URLs `blob:`** abertas em novas abas — especialmente ao navegar de `about:blank` para `blob:https://...`. Esse é o erro `ERR_BLOCKED_BY_CLIENT`.

## Solução

Substituir a abordagem de `download() → blob URL` por **Signed URLs** (`createSignedUrl()`). Isso gera uma URL HTTPS temporária válida que nenhum navegador bloqueia.

## Alterações

### `src/lib/storage-utils.ts`
- **`openStorageFile`**: Usar `supabase.storage.from(bucket).createSignedUrl(path, 3600)` em vez de `download()`. Abrir a signed URL diretamente com `window.open()` — sem blob, sem tab pré-aberta.
- **`downloadStorageFile`**: Manter o download via blob para salvar em disco (funciona diferente — não abre aba, apenas trigger de download via anchor), mas adicionar fallback com signed URL caso o blob falhe.
- Adicionar função auxiliar `getSignedUrl()` reutilizável.

### Impacto
Todos os pontos que usam `openStorageFile` serão corrigidos automaticamente:
- `BillingNfseTab.tsx` (botões PDF e XML)
- `NfseDetailsSheet.tsx` (visualização de detalhes)
- `NfseShareMenu.tsx` (já usa signed URL — OK)

| Arquivo | Mudança |
|---|---|
| `src/lib/storage-utils.ts` | Refatorar `openStorageFile` para usar signed URLs; adicionar `getSignedUrl` helper |

