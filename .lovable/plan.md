

# Corrigir Escopos OAuth do Banco Inter

## Problema

O sistema solicita os escopos `boleto-cobranca.read` e `boleto-cobranca.write` ao autenticar com o Banco Inter, mas a API v3 do Inter alterou os nomes dos escopos. O portal mostra "API Cobranca (Boleto + Pix)" habilitada, porem os nomes internos dos escopos mudaram.

Na API v3 do Banco Inter (endpoint `cdpj.partners.bancointer.com.br`), os escopos corretos sao:

- **Boleto**: `boleto-cobranca.read` e `boleto-cobranca.write` (para a API /cobranca/v3/)

Entretanto, o Inter pode rejeitar a requisicao quando ambos os escopos sao enviados **juntos** em uma unica string separada por espaco. Algumas aplicacoes no portal exigem que os escopos sejam solicitados **individualmente**.

## Diagnostico Detalhado

1. A funcao `banco-inter` solicita na linha 181: `"boleto-cobranca.read boleto-cobranca.write"` (ambos juntos)
2. Na geracao de boleto (linha 396): `"boleto-cobranca.read boleto-cobranca.write"` (ambos juntos)
3. O portal Inter mostra os escopos como habilitados, mas o token OAuth retorna `"No registered scope value"`
4. A rede mostra "Failed to fetch" — a funcao pode nao estar implantada

## Solucao

### 1. Reimplantar a funcao `banco-inter`
A funcao pode nao estar implantada apos alteracoes recentes. Reimplantar para garantir que esta ativa.

### 2. Alterar a estrategia de solicitacao de escopos
Em vez de pedir ambos os escopos juntos (`"boleto-cobranca.read boleto-cobranca.write"`), solicitar **apenas o escopo necessario** para cada operacao:

- Para **gerar boleto**: usar apenas `boleto-cobranca.write`
- Para **consultar boleto**: usar apenas `boleto-cobranca.read`  
- Para **cancelar boleto**: usar `boleto-cobranca.write`
- Para **gerar PIX**: usar apenas `cob.write`
- Para **teste de conexao**: testar cada escopo **individualmente** (um por um)

### 3. Adicionar fallback
Se a solicitacao com escopo unico falhar, tentar com ambos juntos como fallback. Isso garante compatibilidade com diferentes configuracoes no portal Inter.

## Alteracoes Tecnicas

### Arquivo: `supabase/functions/banco-inter/index.ts`

**Linha 181** - Teste de conexao (boleto):
```
// Antes: "boleto-cobranca.read boleto-cobranca.write" (juntos)
// Depois: testar cada escopo individualmente
```

**Linha 191** - Teste de conexao (PIX):
```
// Antes: "cob.read cob.write" (juntos)  
// Depois: testar cada escopo individualmente
```

**Linhas 394-397** - Geracao de pagamento:
```
// Antes: ambos escopos juntos
// Depois: apenas o escopo de escrita para geracao
```

**Linha 268** - Cancelamento:
```
// Antes: "boleto-cobranca.read boleto-cobranca.write"
// Depois: "boleto-cobranca.write" (so precisa de write para cancelar)
```

### Logica do teste de conexao (action: "test")
```text
1. Tentar "boleto-cobranca.write" sozinho
   - Se OK: marcar boleto.write como disponivel
   - Se falhar: logar erro
2. Tentar "boleto-cobranca.read" sozinho
   - Se OK: marcar boleto.read como disponivel
   - Se falhar: logar erro
3. Tentar "cob.write" sozinho
   - Se OK: marcar pix.write como disponivel
   - Se falhar: logar erro
4. Tentar "cob.read" sozinho
   - Se OK: marcar pix.read como disponivel
   - Se falhar: logar erro
5. Retornar lista de escopos disponiveis
```

### Logica de geracao de boleto/PIX
```text
1. Tentar com escopo unico ("boleto-cobranca.write")
2. Se falhar, tentar com ambos ("boleto-cobranca.read boleto-cobranca.write")
3. Se ambos falharem, retornar erro detalhado
```

## Arquivos Modificados
- `supabase/functions/banco-inter/index.ts` (unico arquivo)
- Reimplantar a funcao apos a alteracao

## Riscos
- Nenhum risco — estamos apenas alterando a estrategia de solicitacao de escopo OAuth, sem mudar a logica de negocio
- O fallback garante compatibilidade com ambas as configuracoes (escopos individuais ou combinados)

