

# Correcao do Build - parse-certificate

## Problema
A edge function `parse-certificate` usa `npm:node-forge@1.3.1` que nao e resolvido no ambiente de deploy. O erro impede o build de todo o projeto.

## Solucao

Reescrever `supabase/functions/parse-certificate/index.ts` substituindo `node-forge` por Web Crypto API nativa do Deno para parsing de certificados PKCS#12.

Como a Web Crypto API nao suporta PKCS#12 nativamente, a abordagem sera:

1. Usar a biblioteca `npm:pkijs` (que funciona em Deno) para parsing ASN.1 e PKCS#12
2. Alternativa mais simples: usar `npm:asn1js` + `npm:pvtsutils` que sao dependencias leves e compativeis

Na pratica, a forma mais confiavel e usar `node-forge` com a versao correta. O problema e provavelmente a versao ou o formato de importacao. Vou:

1. Alterar a importacao para usar `https://esm.sh/node-forge@1.3.1` (formato URL) em vez de `npm:` prefix, que e mais estavel no edge runtime
2. Manter toda a logica existente intacta

## Arquivo alterado
- `supabase/functions/parse-certificate/index.ts` - linha 2: trocar `import forge from "npm:node-forge@1.3.1"` por `import forge from "https://esm.sh/node-forge@1.3.1"`

## Impacto
- Corrige o erro de build
- Nenhuma mudanca de logica ou comportamento
- Funcionalidade de parsing de certificado digital (.pfx/.p12) permanece identica

