

# Retornar Dados do Boleto Existente na Resposta de Duplicidade

## Problema

Quando o sistema detecta um boleto duplicado e a fatura ja possui `boleto_barcode`, a resposta atual retorna apenas `{ success: true, duplicate: true }` sem incluir o barcode nem a URL do PDF. Isso impede o reenvio do boleto ao cliente.

## Solucao

### Arquivo: `supabase/functions/banco-inter/index.ts`

**1. Incluir `boleto_url` na query** (linha 639):

Alterar o select de:
```text
.select("boleto_barcode, boleto_status, notes")
```
Para:
```text
.select("boleto_barcode, boleto_url, boleto_status, notes")
```

**2. Retornar os dados na resposta** (linhas 645-652):

Alterar o JSON de retorno para incluir barcode e PDF:

```text
return new Response(
  JSON.stringify({ 
    success: true, 
    duplicate: true,
    message: "Boleto ja gerado anteriormente",
    boleto_barcode: currentInv.boleto_barcode,
    boleto_url: currentInv.boleto_url || null,
  }),
  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

## Resumo

| Campo | Antes | Depois |
|-------|-------|--------|
| `boleto_barcode` | Nao retornado | Retornado |
| `boleto_url` (PDF) | Nao retornado | Retornado |
| Comportamento do caller | Sabe que deu certo mas nao tem dados | Pode reenviar o boleto ao cliente |

