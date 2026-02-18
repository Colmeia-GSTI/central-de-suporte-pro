

# Fix: Verificar retorno do `functions.invoke` no bloco de pagamento

## Problema

No `generate-monthly-invoices/index.ts`, o bloco de geracao de pagamento (linhas 430-445) nao verifica o retorno de `supabase.functions.invoke()`. Diferente do bloco NFS-e (que ja foi corrigido e faz `const { data, error } = ...`), o bloco de pagamento simplesmente faz `await` e ignora o resultado.

Isso causa:
- Se `banco-inter` ou `asaas-nfse` retornar erro HTTP, ele e silenciosamente ignorado
- `auto_payment_generated` e marcado como `true` mesmo quando falhou
- `boleto_status` permanece `pendente` sem mensagem de erro
- Faturas como CVR e Ruaro ficam "perdidas" sem boleto

## Correcao

Alterar APENAS o bloco de pagamento (linhas 430-445) para capturar e verificar o retorno, seguindo o mesmo padrao ja usado no bloco NFS-e logo abaixo.

### Antes (linhas 430-445):
```typescript
if (provider === "asaas") {
  await supabase.functions.invoke("asaas-nfse", { body: { ... } });
} else {
  await supabase.functions.invoke("banco-inter", { body: { ... } });
}
```

### Depois:
```typescript
const invokeResult = provider === "asaas"
  ? await supabase.functions.invoke("asaas-nfse", { body: { ... } })
  : await supabase.functions.invoke("banco-inter", { body: { ... } });

if (invokeResult.error) {
  throw new Error(
    `Erro ao gerar ${paymentType} via ${provider}: ${invokeResult.error.message || JSON.stringify(invokeResult.error)}`
  );
}

const responseData = invokeResult.data as Record<string, unknown> | null;
if (responseData?.error) {
  throw new Error(
    `Provedor ${provider} retornou erro: ${String(responseData.error)}`
  );
}
```

O `throw` e capturado pelo `catch (paymentError)` existente na linha 458, que ja atualiza `boleto_status: "erro"` e `boleto_error_msg` corretamente.

## Arquivo afetado

- `supabase/functions/generate-monthly-invoices/index.ts` -- linhas 430-445 apenas

## O que NAO muda

- O bloco NFS-e (479-514) ja esta correto -- sem alteracao
- O `catch` existente (458-469) ja grava o erro na fatura -- sem alteracao
- O marcador `auto_payment_generated: true` (450-455) so executa se nao houver throw -- comportamento correto
- Nenhum outro arquivo e alterado

## Impacto

- Previne falhas silenciosas em futuras geracoes de faturas
- Erros de provedor passam a ser visiveis na aba "Erros" do faturamento
- Zero risco de breaking change -- o fluxo de sucesso continua identico
- As faturas CVR e Ruaro precisam ter os boletos regenerados manualmente pela interface (botao "Gerar Boleto")
