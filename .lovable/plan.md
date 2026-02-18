
# Fix: PDF abre com dominio supabase em vez do dominio customizado

## Problema

Quando o usuario clica para abrir o PDF da NFS-e ou boleto, o `createSignedUrl` gera uma URL apontando para `silefpsayliwqtoskkdz.supabase.co/storage/...`. O navegador bloqueia o `window.open()` para esse dominio externo (popup blocker), e mesmo quando nao bloqueia, o usuario ve a URL do backend em vez do dominio `suporte.colmeiagsti.com`.

## Causa Raiz

O Supabase SDK gera signed URLs usando o dominio do projeto Supabase diretamente. Nao ha como forcar o SDK a usar outro dominio. Alem disso, `window.open()` dentro de callbacks async (apos `await`) e frequentemente bloqueado pelos navegadores como popup nao solicitado.

## Solucao

Substituir o padrao `createSignedUrl` + `window.open()` por download via blob. Isso:
1. Baixa o arquivo em memoria usando `supabase.storage.from().download()`
2. Cria um `URL.createObjectURL(blob)` local (dominio do proprio app)
3. Abre o blob URL ou dispara download -- sem popup blocker, sem dominio externo

### Implementacao

Criar uma funcao utilitaria `openStorageFile` centralizada em `src/lib/storage-utils.ts` que:
- Recebe bucket e path
- Faz download via SDK (`supabase.storage.from(bucket).download(path)`)
- Cria blob URL e abre com `window.open()` ou fallback via `<a>` click
- Trata erros com toast

### Arquivos a alterar

| Arquivo | Alteracao |
|---------|-----------|
| `src/lib/storage-utils.ts` | **NOVO** - funcao `openStorageFile(bucket, path)` |
| `src/components/billing/BillingInvoicesTab.tsx` | Substituir `createSignedUrl` + `window.open` por `openStorageFile` (2 locais: linhas ~435 e ~580) |
| `src/components/billing/BillingNfseTab.tsx` | Substituir `openUrlOrSigned` para usar `openStorageFile` (linha ~106) |
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | Substituir `openUrlOrSigned` para usar `openStorageFile` (linha ~77) |
| `src/components/billing/nfse/NfseShareMenu.tsx` | Manter `createSignedUrl` apenas para copiar link (clipboard) -- nao abre popup |

### Detalhes Tecnicos

**Nova funcao `openStorageFile`:**
```text
1. Determina bucket e path a partir da URL armazenada
2. Chama supabase.storage.from(bucket).download(path)
3. Cria blob URL: URL.createObjectURL(blob)
4. Cria elemento <a> invisivel com href=blobURL, target=_blank
5. Dispara click programatico (nao e bloqueado como popup)
6. Limpa blob URL apos timeout com URL.revokeObjectURL()
```

**Logica de parsing do path:**
- Se comeca com `nfse-files/` -> bucket `nfse-files`, path sem prefixo
- Se comeca com `nfse/` -> bucket `nfse-files`, path como esta
- Se comeca com `invoice-documents/` -> bucket `invoice-documents`, path sem prefixo
- URLs externas (http/https) -> `window.open` direto (fallback)

Essa abordagem resolve tanto o bloqueio de popup quanto a exposicao do dominio do backend.
