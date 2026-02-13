
# Tratar Duplicidade de Boleto no Banco Inter como Sucesso

## Diagnostico

A fatura #9 do Clube Comercial de Passo Fundo (ID `2b6c2740...`) **ja possui boleto gerado** (codigo de barras `0779000116...`, codigo de solicitacao `4d188f59...`). Quando voce clicou "Faturar Agora" novamente, o Banco Inter rejeitou com a mensagem:

> "Existe uma cobranca emitida ha poucos minutos com os mesmos dados com a situacao 'a receber'"

O sistema interpreta qualquer erro HTTP do Banco Inter como falha, mas nesse caso especifico, o boleto ja existe e esta ativo. O comportamento correto e detectar a duplicidade e tratar como sucesso.

## Solucao

### Arquivo: `supabase/functions/banco-inter/index.ts` (linhas 624-628)

Atualmente o codigo faz:

```text
if (!boletoResponse.ok) {
  const errorText = await boletoResponse.text();
  console.error("[BANCO-INTER] Boleto error:", errorText);
  throw new Error("Erro ao gerar boleto: " + errorText);
}
```

**Mudanca**: Antes de lancar o erro, verificar se a mensagem contem indicadores de duplicidade (ex: "existe uma cobranca emitida" ou "codigo de solicitacao"). Se sim:

1. Extrair o `codigoSolicitacao` da mensagem de erro do Inter
2. Verificar se a fatura ja possui `boleto_barcode` preenchido no banco
3. Se ja tiver, retornar sucesso com os dados existentes em vez de lancar erro
4. Se nao tiver, usar o `codigoSolicitacao` retornado para fazer polling e obter os dados do boleto

```text
if (!boletoResponse.ok) {
  const errorText = await boletoResponse.text();
  console.error("[BANCO-INTER] Boleto error:", errorText);

  // Detectar erro de duplicidade do Banco Inter
  const isDuplicate = errorText.includes("existe uma cobrança emitida") 
    || errorText.includes("existe uma cobranca emitida")
    || errorText.includes("código de solicitação");

  if (isDuplicate) {
    console.log("[BANCO-INTER] Boleto duplicado detectado, verificando dados existentes...");

    // Verificar se a fatura ja tem boleto_barcode
    const { data: currentInv } = await supabase
      .from("invoices")
      .select("boleto_barcode, boleto_status, notes")
      .eq("id", invoice_id)
      .single();

    if (currentInv?.boleto_barcode) {
      console.log("[BANCO-INTER] Boleto ja existe com barcode, retornando sucesso");
      return new Response(
        JSON.stringify({ 
          success: true, 
          duplicate: true,
          message: "Boleto ja gerado anteriormente" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se nao tem barcode mas tem codigoSolicitacao, extrair e fazer polling
    const match = errorText.match(/código de solicitação:\s*([a-f0-9-]+)/i)
      || errorText.match(/codigo de solicitação:\s*([a-f0-9-]+)/i);
    if (match?.[1]) {
      // Continuar com polling usando o codigo extraido
      result = { codigoSolicitacao: match[1] };
      // (segue o fluxo normal de polling que ja existe no codigo)
    } else {
      throw new Error("Erro ao gerar boleto: " + errorText);
    }
  } else {
    throw new Error("Erro ao gerar boleto: " + errorText);
  }
}
```

### Arquivo: `supabase/functions/batch-process-invoices/index.ts`

Nenhuma mudanca necessaria. A funcao batch ja trata o retorno da edge function corretamente -- se `banco-inter` retornar 200, o batch registra como sucesso.

## Resumo

| Cenario | Antes | Depois |
|---------|-------|--------|
| Boleto duplicado com barcode ja salvo | Erro 500 | Retorna 200 com flag `duplicate: true` |
| Boleto duplicado sem barcode salvo | Erro 500 | Extrai codigo e faz polling para obter barcode |
| Outros erros do Banco Inter | Erro 500 | Mantido (sem mudanca) |
