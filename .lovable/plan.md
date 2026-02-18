

# Plano: Download Direto de Boletos + Validacao de Envio por Email

## Problemas Identificados

### 1. Boletos #14 e #15 nao possuem dados
Ambas as faturas tem `boleto_url: null`, `boleto_barcode: null`. Nao ha PDF para baixar. O `auto_payment_generated` ja foi resetado para `false`, permitindo nova geracao.

**Acao**: Regenerar os boletos via interface (botao "Gerar Boleto") ou corrigir o fluxo de geracao automatica.

### 2. Download abre em nova aba em vez de baixar
A funcao `openStorageFile` abre o PDF numa nova aba usando blob URL, mas o comportamento esperado e fazer download direto do arquivo.

**Acao**: Alterar `storage-utils.ts` para usar o atributo `download` no elemento `<a>`, forcando download em vez de navegacao.

### 3. Email envia path do Storage como link (nao funciona)
Na funcao `resend-payment-notification`, linha 246, o email inclui `invoice.boleto_url` como href de um link. Mas esse campo contem um caminho interno do Storage (ex: `invoice-documents/boletos/xxx/boleto.pdf`), nao uma URL publica acessivel pelo cliente.

**Acao**: Gerar uma signed URL temporaria (valida por 7 dias) no momento do envio do email, usando o SDK do Supabase no backend, e usar essa URL no email.

### 4. Boleto PDF deve ser anexado/linkado no email de conclusao do contrato
O fluxo de criacao de contrato (`ContractForm.tsx` -> `generate-monthly-invoices`) envia email mas nao inclui link do boleto PDF.

**Acao**: No `generate-monthly-invoices`, apos gerar o boleto, incluir a signed URL do PDF no email enviado ao cliente.

---

## Alteracoes

### Arquivo 1: `src/lib/storage-utils.ts`
- Adicionar funcao `downloadStorageFile` que forca download em vez de abrir em nova aba
- Usar atributo `download` no elemento `<a>` com nome de arquivo amigavel
- Manter `openStorageFile` para casos onde visualizacao e desejada

### Arquivo 2: `src/components/billing/BillingInvoicesTab.tsx`
- Trocar `openStorageFileSafe` por `downloadStorageFileSafe` nos handlers de boleto e NFS-e
- Quando clicar no icone de boleto pronto: baixar o PDF
- Quando clicar no icone de NFS-e autorizada: baixar o PDF

### Arquivo 3: `supabase/functions/resend-payment-notification/index.ts`
- Antes de montar o email, verificar se `boleto_url` e um path do Storage
- Se for, gerar signed URL via `supabase.storage.from(bucket).createSignedUrl(path, 604800)` (7 dias)
- Usar a signed URL no link do email em vez do path interno
- Mesma logica para NFS-e PDF se houver

### Arquivo 4: `supabase/functions/generate-monthly-invoices/index.ts`
- No trecho que envia email apos gerar fatura, verificar se boleto foi gerado com sucesso
- Se `boleto_url` existir, gerar signed URL e incluir no corpo do email
- Incluir linha digitavel no email

---

## Detalhes Tecnicos

### Download vs Visualizacao
```text
// Download forcado (novo)
anchor.download = "boleto_fatura_14.pdf"  // forca download
anchor.href = blobUrl

// Visualizacao (atual)  
newTab.location.href = blobUrl  // abre no navegador
```

### Signed URL no Backend
```text
// No edge function, antes de enviar email:
const { data: signedData } = await supabase.storage
  .from("invoice-documents")
  .createSignedUrl("boletos/invoice-id/boleto.pdf", 604800);  // 7 dias

const boletoLink = signedData?.signedUrl || "";
```

### Resolucao do path no backend
```text
// "invoice-documents/boletos/xxx/boleto.pdf" -> bucket: "invoice-documents", path: "boletos/xxx/boleto.pdf"
```

---

## Resultado Esperado

1. Clicar no icone verde de boleto baixa o PDF diretamente (download, nao abre aba)
2. Clicar no icone verde de NFS-e baixa o PDF diretamente
3. Email de cobranca inclui link funcional para o PDF do boleto (signed URL valida por 7 dias)
4. Email enviado na criacao de contrato inclui link do boleto quando disponivel
5. URLs nos emails usam dominio do Supabase (signed URLs) que sao funcionais e temporarias

