
# Corrigir Polling do Boleto: Token com Escopo Correto

## Problema Raiz
O boleto e criado com sucesso no Banco Inter (escopo `boleto-cobranca.write`), mas o polling que busca os dados completos (barcode, PDF) usa o mesmo token. O endpoint GET de consulta exige o escopo `boleto-cobranca.read`, causando erro "requested scope is not registered for this client" em todas as tentativas de polling.

O mesmo problema afeta a funcao `poll-boleto-status` (fallback), que ja usa o escopo correto `boleto-cobranca.read` -- mas como so processa registros com mais de 1 hora, nao resolve o problema imediato.

## Solucao

### Alteracao em `supabase/functions/banco-inter/index.ts`

**Obter um segundo token com escopo `boleto-cobranca.read` antes do loop de polling (linhas 548-585):**

1. Antes do loop de polling (apos linha 547), solicitar um novo token com escopo `boleto-cobranca.read`
2. Usar esse token de leitura nas requisicoes GET do polling
3. Se o token de leitura falhar, registrar o aviso e confiar no fallback (`poll-boleto-status`)

### Codigo proposto (pseudocodigo):

```text
// Apos criar o boleto com sucesso (codigoSolicitacao)

// Obter token de LEITURA para polling
readTokenResult = tryGetToken("boleto-cobranca.read")
  OU tryGetToken("boleto-cobranca.read boleto-cobranca.write")

if (readToken obtido) {
  // Loop de polling usando readToken
  for (tentativa 1..6) {
    GET /cobranca/v3/cobrancas/{codigoSolicitacao}
    Authorization: Bearer {readToken}  // <-- token correto
  }
} else {
  // Log warning e confiar no poll-boleto-status fallback
}
```

### Detalhes tecnicos:
- Reutilizar a funcao `tryGetTokenWithFallback` ja existente no arquivo
- O token de leitura sera solicitado apenas quando necessario (apos criacao async do boleto)
- Fallback para escopo combinado caso o individual falhe
- Nenhuma alteracao de banco de dados necessaria
