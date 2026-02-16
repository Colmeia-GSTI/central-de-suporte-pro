
# Criar `src/utils/invoiceIndicators.ts` - Logica Centralizada de Indicadores

## Objetivo

Extrair toda a logica duplicada de determinacao de status/cor/tooltip de boleto, NFS-e e email que hoje vive espalhada em `InvoiceInlineActions.tsx` e `InvoiceActionIndicators.tsx` para um unico arquivo utilitario com funcoes puras e tipadas.

## Tipos Exportados

```text
BoletoIndicatorInput {
  boleto_url: string | null;
  boleto_barcode?: string | null;
  boleto_error_msg?: string | null;
  status?: string;
  billing_provider?: string | null;
  pix_code?: string | null;
}

NfseIndicatorInput {
  status: string;
  numero_nfse: string | null;
  pdf_url?: string | null;
  xml_url?: string | null;
}

EmailIndicatorInput {
  email_sent_at?: string | null;
  email_error_msg?: string | null;
  email_status?: string | null;
}

IndicatorResult {
  color: string;           // classe CSS (text-destructive, text-emerald-500, etc.)
  tooltip: string;         // texto do tooltip
  level: "success" | "error" | "warning" | "processing" | "pending";
}

SendBlockResult {
  blocked: boolean;
  reasons: string[];
}
```

## Funcoes Exportadas

| Funcao | Entrada | Saida | Descricao |
|--------|---------|-------|-----------|
| `getBoletoIndicator` | `BoletoIndicatorInput` | `IndicatorResult` | Retorna cor/tooltip considerando `boleto_url` E `boleto_barcode` (conforme regra de "boleto ready") |
| `getNfseIndicator` | `NfseIndicatorInput ou undefined` | `IndicatorResult` | Retorna cor/tooltip para status autorizada/erro/rejeitada/processando/pendente |
| `getEmailIndicator` | `EmailIndicatorInput` | `IndicatorResult` | Retorna cor/tooltip baseado em email_sent_at, email_status e email_error_msg |
| `getSendBlockedStatus` | `{ nfseInfo?: NfseIndicatorInput; ... }` | `SendBlockResult` | Verifica se envio esta bloqueado (NFS-e autorizada sem PDF/XML) |
| `isBoletoReady` | `{ boleto_url, boleto_barcode }` | `boolean` | Helper: `true` se tem URL ou barcode |

## Logica Principal

**`getBoletoIndicator`**: Prioridade: erro > pronto (url OU barcode) > pendente. Tooltip diferencia entre "Abrir PDF", "Copiar codigo de barras", "Erro no boleto" e "Boleto pendente".

**`getNfseIndicator`**: Prioridade: autorizada (sucesso) > erro/rejeitada (erro) > processando (azul) > pendente (muted).

**`getEmailIndicator`**: Prioridade: erro (email_error_msg ou email_status=erro) > enviado (email_sent_at ou email_status=enviado) > pendente.

**`getSendBlockedStatus`**: Verifica se NFS-e esta autorizada mas sem PDF ou XML -- unico cenario que bloqueia envio.

## Arquivo a Criar

| Arquivo | Descricao |
|---------|-----------|
| `src/utils/invoiceIndicators.ts` | Funcoes puras + tipos TypeScript para indicadores de fatura |

## Consumidores Futuros

Apos a criacao, `InvoiceInlineActions.tsx` e `InvoiceActionIndicators.tsx` poderao ser refatorados para usar essas funcoes, eliminando duplicacao. Essa refatoracao pode ser feita em um passo seguinte.
