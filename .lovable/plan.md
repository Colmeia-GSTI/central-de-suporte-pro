

# Plano Abrangente: Correções Críticas no Sistema de Faturamento

## 📋 Resumo dos Problemas Identificados

Analisei o código de produção em profundidade e identifiquei **4 problemas críticos encadeados** que causam os erros reportados na QUAZA:

```
batch-process-invoices
    ↓ (não passa nfse_service_code)
asaas-nfse (usa fallback "0107")
    ↓ (código inválido)
API Asaas rejta: "invalid_municipalServiceExternalId"
    ↓
resend-payment-notification
    ↓ (valida boleto_barcode = null)
Email/WhatsApp falham com 400
```

---

## 🔴 PROBLEMA 1: NFS-e Sem Código de Serviço (CRÍTICO)

### Localização
- **Arquivo**: `supabase/functions/batch-process-invoices/index.ts`
- **Linhas**: 142-166
- **Problema**: Query não inclui `nfse_service_code` do contrato

### Código Atual (INCORRETO)
```typescript
const { data: invoice } = await supabase
  .from("invoices")
  .select("*, contracts(name, description, nfse_descricao_customizada)")
  .eq("id", invoiceId)
  .single();
```

### Dados da QUAZA
```
contracts.nfse_service_code = "010701"  // Gestão de TI - Remoto
Sendo enviado para Asaas: municipalServiceExternalId = "0107"  // TRUNCADO!
```

### Corrigido para:
```typescript
const { data: invoice } = await supabase
  .from("invoices")
  .select("*, contracts(name, description, nfse_descricao_customizada, nfse_service_code)")
  .eq("id", invoiceId)
  .single();

// Depois usar:
service_description: invoice.contracts?.nfse_descricao_customizada || 
  invoice.contracts?.description || 
  `Prestação de serviços - ${invoice.contracts?.name}`,
municipal_service_code: invoice.contracts?.nfse_service_code,  // NOVO
```

### Validações Adicionadas
```typescript
if (!invoice.contracts?.nfse_service_code) {
  result.nfse_status = "error";
  result.nfse_error = "Contrato não possui código de serviço NFS-e configurado";
  console.error(`[batch-process] Contrato sem nfse_service_code: ${invoice.contract_id}`);
}
```

---

## 🔴 PROBLEMA 2: Boleto Status "Enviado" Mas Sem Dados (CRÍTICO)

### Localização
- **Arquivo**: `supabase/functions/banco-inter/index.ts`
- **Linhas**: 471-496
- **Problema**: API retorna apenas `codigoSolicitacao`, não os dados do boleto

### Fluxo Atual (INCORRETO)
```
1. POST /cobranca/v3/cobrancas → API retorna codigoSolicitacao
2. Atualiza invoice com boleto_barcode = null
3. Status marcado como "enviado" mesmo sem dados
4. Notificações falham porque não tem barcode
```

### Solução: Implementar Polling

```typescript
// Após criar boleto, fazer polling para obter dados completos
if (result.codigoSolicitacao) {
  console.log("[BANCO-INTER] Boleto criado async, iniciando polling...");
  
  let boletoCompleto = false;
  let tentativas = 0;
  const maxTentativas = 12; // 60 segundos (5 segundos cada)
  
  while (!boletoCompleto && tentativas < maxTentativas) {
    await new Promise(r => setTimeout(r, 5000)); // Aguarda 5 segundos
    tentativas++;
    
    try {
      const detailsResponse = await mtlsFetch(
        `${baseUrl}/cobranca/v3/cobrancas/${result.codigoSolicitacao}`,
        { 
          method: "GET",
          headers: { Authorization: `Bearer ${access_token}` }
        }
      );
      
      if (detailsResponse.ok) {
        const details = await detailsResponse.json();
        if (details.codigoBarras && details.linhaDigitavel) {
          console.log("[BANCO-INTER] Dados do boleto obtidos com sucesso");
          
          // Atualizar com dados completos
          await supabase
            .from("invoices")
            .update({
              boleto_barcode: details.linhaDigitavel,
              boleto_url: details.pdfUrl,
              payment_method: "boleto",
              notes: `${existingNotes} codigoSolicitacao:${result.codigoSolicitacao} nossoNumero:${details.nossoNumero}`.trim()
            })
            .eq("id", invoice_id);
          
          boletoCompleto = true;
          break;
        }
      }
    } catch (pollError) {
      console.warn(`[BANCO-INTER] Polling tentativa ${tentativas} falhou:`, pollError);
    }
  }
  
  if (!boletoCompleto) {
    // Se não conseguiu dados após polling, salvar só o codigoSolicitacao
    console.warn("[BANCO-INTER] Timeout no polling - boleto pode estar pendente");
    await supabase
      .from("invoices")
      .update({
        notes: `${existingNotes} codigoSolicitacao:${result.codigoSolicitacao}`.trim(),
        boleto_status: "pendente"  // NÃO "enviado"!
      })
      .eq("id", invoice_id);
  }
}
```

### Importante: Nunca Marcar como "Enviado" Sem Dados
```typescript
// ANTES (ERRADO)
boleto_status: "enviado"  // Sem ter barcode/url

// DEPOIS (CORRETO)
boleto_status: "enviado"  // Só depois de ter TODOS os dados
```

---

## 🔴 PROBLEMA 3: Notificações Falham Sem Boleto (CRÍTICO)

### Localização
- **Arquivo**: `supabase/functions/resend-payment-notification/index.ts`
- **Linhas**: 133-140
- **Problema**: Valida prematuramente, sem considerar que boleto pode estar processando

### Código Atual (MUITO RESTRITIVO)
```typescript
const hasBoleto = !!invoice.boleto_barcode;
const hasPix = !!invoice.pix_code;

if (!hasBoleto && !hasPix) {
  return new Response(
    JSON.stringify({ error: "Esta fatura não tem boleto ou PIX gerado" }),
    { status: 400, ... }
  );
}
```

### Problema
- Boleto foi criado mas ainda está em polling
- `boleto_barcode = null` temporariamente
- Notificação retorna erro 400
- Batch process falha

### Solução: Permitir Boleto em Processamento

```typescript
const hasBoleto = !!invoice.boleto_barcode || !!invoice.boleto_url;
const hasPix = !!invoice.pix_code;
const boleto_em_processamento = invoice.boleto_status === "pendente" || invoice.boleto_status === "processando";

if (!hasBoleto && !hasPix && !boleto_em_processamento) {
  return new Response(
    JSON.stringify({ 
      error: "Esta fatura não tem boleto ou PIX gerado e não está em processamento",
      has_boleto: hasBoleto,
      has_pix: hasPix,
      boleto_status: invoice.boleto_status
    }),
    { status: 400, ... }
  );
}

// Se boleto está em processamento, mandar email com aviso
let emailContent = defaultContent;
if (boleto_em_processamento && !hasBoleto) {
  emailContent = emailContent.replace(
    "{{boleto_section}}",
    `<div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p>⏳ Boleto em processamento - será enviado em breve</p>
    </div>`
  );
}
```

---

## 🔴 PROBLEMA 4: Asaas com Fallback Inválido

### Localização
- **Arquivo**: `supabase/functions/asaas-nfse/index.ts`
- **Linhas**: 736-738
- **Problema**: Fallback usa "0107" que não é válido

### Código Atual (PROBLEMÁTICO)
```typescript
} else {
  // Fallback: usar código padrão de serviços de informática
  invoicePayload.municipalServiceExternalId = "0107";
  invoicePayload.municipalServiceName = "Suporte técnico em informática";
}
```

### Solução: Forçar Código Válido ou Rejeitar

```typescript
} else {
  // NÃO usar fallback - rejeitar
  throw new AsaasApiError(
    "Código de serviço municipal não fornecido e não encontrado. Verifique a configuração do contrato.",
    400,
    "MISSING_MUNICIPAL_SERVICE_CODE"
  );
}
```

---

## ✅ FLUXO CORRIGIDO

```
Frontend: Seleciona faturas (ex: QUAZA)
    ↓
BillingBatchProcessing: Envia invoice_ids
    ↓
batch-process-invoices:
  1. Busca contrato COM nfse_service_code ("010701")
  2. Passa municipal_service_code para asaas-nfse
  ↓
asaas-nfse:
  1. Recebe municipal_service_code = "010701" ✓
  2. NÃO usa fallback
  3. Envia municipalServiceExternalId = "010701" para API
  ↓
API Asaas:
  1. Reconhece código válido ✓
  2. NFS-e emitida com sucesso ✓
  ↓
banco-inter:
  1. Cria boleto (codigoSolicitacao)
  2. Faz polling por 60 segundos
  3. Obtém codigoBarras e linhaDigitavel
  4. Marca como "enviado" APENAS com dados completos
  ↓
resend-payment-notification:
  1. Encontra boleto_barcode preenchido
  2. Email enviado com linha digitável
  3. WhatsApp enviado
  ↓
Resultado Final: ✓ NFS-e emitida, ✓ Boleto gerado, ✓ Notificações enviadas
```

---

## 📁 Arquivos a Modificar

| Arquivo | Linhas | Tipo | Impacto |
|---------|--------|------|--------|
| `supabase/functions/batch-process-invoices/index.ts` | 142-165 | BUG CRÍTICO | Semeia erro na NFS-e |
| `supabase/functions/banco-inter/index.ts` | 471-496 | DESIGN GAP | Boletos sem dados |
| `supabase/functions/resend-payment-notification/index.ts` | 133-140 | LÓGICA RESTRITIVA | Notificações falham |
| `supabase/functions/asaas-nfse/index.ts` | 736-738 | FALLBACK INVÁLIDO | NFS-e rejeitadas |

---

## 🛡️ Salvaguardas Adicionadas

### 1. Validação Pré-Processamento
```typescript
// Em batch-process-invoices, antes de processar:
if (!invoice.contracts?.nfse_service_code) {
  console.error(`[batch-process] ERRO: Contrato ${invoice.contract_id} sem nfse_service_code`);
  result.nfse_status = "error";
  result.nfse_error = "Contrato não possui código de serviço";
  continue;
}
```

### 2. Logging Detalhado
```typescript
// Log o código sendo enviado
console.log(`[batch-process] Enviando NFS-e: código=${invoice.contracts.nfse_service_code}, descrição=${invoice.contracts.nfse_descricao_customizada}`);

console.log(`[asaas-nfse] MunicipalServiceCode final: ${municipal_service_code}`);
```

### 3. Histórico de Auditoria
- Todos os 4 passos salvos em `nfse_event_logs`
- Rastreamento de qual código foi usado
- Timestamps de cada tentativa

### 4. Retry Inteligente
```typescript
// Se falhar pela primeira vez, tentar novamente antes de marcar como erro permanente
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    // fazer ação
    break;
  } catch (error) {
    if (attempt === 2) throw error;  // Última tentativa
    await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
  }
}
```

---

## 📊 Resultado Esperado

**Antes (Problema):**
- ❌ Boleto: `boleto_status = "enviado"`, `boleto_barcode = null`
- ❌ NFS-e: Erro "Código de serviço precisa ser informado"
- ❌ Notificações: Erro 400
- ❌ Cliente: Nenhuma cobrança gerada

**Depois (Corrigido):**
- ✅ Boleto: `boleto_status = "enviado"`, `boleto_barcode = "123.456..."`
- ✅ NFS-e: Emitida com código correto "010701"
- ✅ Notificações: Email + WhatsApp enviados com dados completos
- ✅ Cliente: Recebe cobrança completa (boleto + NFS-e + notificações)

---

## 🔒 Garantias Contra Regressão

1. **Validação em tempo de contrato**: Campo `nfse_service_code` é obrigatório
2. **Alertas no painel**: Se contrato está sem código, mostrar aviso visual
3. **Testes de integração**: Mockup da QUAZA para validar flow completo
4. **Webhook de confirmação**: Asaas confirma código recebido corretamente
5. **Auditoria completa**: Cada fatura rastreada em `nfse_event_logs`

