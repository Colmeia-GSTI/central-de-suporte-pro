
# Plano: Indicador de Processamento + Verificação Individual de Status NFS-e

## Resumo

Implementar duas melhorias na interface de NFS-e:
1. **Indicador de tempo estimado** - Exibir tempo decorrido e estimativa de processamento para notas em "processando"
2. **Botão de verificação individual** - Permitir atualizar o status de uma NFS-e específica no Asaas

---

## Análise do Estado Atual

### Fluxo de Status NFS-e (Asaas → Portal Nacional)

```text
SCHEDULED (enviada) → SYNCHRONIZED → AUTHORIZATION_PENDING → AUTHORIZED
     ↓                                      ↓
  "processando"                         "autorizada"
```

**Tempos típicos de processamento:**
- **Ambiente Sandbox**: 1-5 minutos
- **Ambiente Produção**: 15-60 minutos (depende da prefeitura)

### Componentes Identificados

| Arquivo | Função |
|---------|--------|
| `BillingNfseTab.tsx` | Tabela de listagem com botão "Verificar status" global |
| `NfseDetailsSheet.tsx` | Painel lateral de detalhes da NFS-e |
| `asaas-nfse/index.ts` | Edge function com ação `get_status` existente |
| `poll-asaas-nfse-status/index.ts` | Polling em lote (fallback) |

---

## Implementação

### Etapa 1: Criar Componente de Indicador de Processamento

Novo componente `NfseProcessingIndicator.tsx` que exibe:
- Tempo decorrido desde a emissão
- Barra de progresso estimada
- Status atual do Asaas (SCHEDULED, SYNCHRONIZED, etc.)

**Interface visual:**

```text
┌─────────────────────────────────────────────────────────┐
│ ⏳ Aguardando Autorização                               │
│                                                         │
│ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░  35%          │
│                                                         │
│ Status: AUTHORIZATION_PENDING                           │
│ Tempo decorrido: 12 minutos                             │
│ Estimativa: ~30-60 min (produção)                       │
│                                                         │
│ ℹ️ A nota foi enviada e está aguardando autorização     │
│    da prefeitura. Este processo é automático.           │
│                                                         │
│ [🔄 Verificar agora]                                    │
└─────────────────────────────────────────────────────────┘
```

### Etapa 2: Criar Ação "check_single_status" no Edge Function

Adicionar nova ação no `asaas-nfse/index.ts` que:
1. Consulta o status no Asaas
2. Atualiza o registro local
3. Baixa PDF/XML se autorizada
4. Retorna o novo status

### Etapa 3: Adicionar Indicador na Tabela de Listagem

Na tabela de NFS-e, para registros com status "processando":
- Exibir ícone animado de loading
- Tooltip com tempo decorrido
- Badge com status Asaas (se disponível)

### Etapa 4: Adicionar Botão de Verificação Individual

No `NfseDetailsSheet.tsx`:
- Botão "Verificar status agora" visível quando status = "processando"
- Spinner durante a verificação
- Toast com resultado

---

## Especificação Técnica

### Novo Componente: `NfseProcessingIndicator.tsx`

```typescript
interface NfseProcessingIndicatorProps {
  nfse: {
    id: string;
    asaas_invoice_id: string | null;
    asaas_status: string | null;
    created_at: string;
    data_emissao: string | null;
    ambiente: string | null;
  };
  onRefresh?: () => void;
  compact?: boolean;
}

// Estimativas de tempo por ambiente
const ESTIMATED_TIMES = {
  sandbox: { min: 1, max: 5 },      // minutos
  production: { min: 15, max: 60 }, // minutos
};

// Mapeamento de status Asaas para descrição
const ASAAS_STATUS_LABELS = {
  SCHEDULED: "Agendada para envio",
  SYNCHRONIZED: "Sincronizada com prefeitura",
  AUTHORIZATION_PENDING: "Aguardando autorização",
  AUTHORIZED: "Autorizada",
  ERROR: "Erro no processamento",
  CANCELED: "Cancelada",
  CANCELLATION_PENDING: "Cancelamento pendente",
};

// Progresso estimado por status
const STATUS_PROGRESS = {
  SCHEDULED: 15,
  SYNCHRONIZED: 40,
  AUTHORIZATION_PENDING: 70,
  AUTHORIZED: 100,
  ERROR: 0,
  CANCELED: 0,
};
```

### Nova Ação Edge Function: `check_single_status`

```typescript
case "check_single_status": {
  const { nfse_history_id } = params;
  
  // 1. Buscar registro local
  const { data: record } = await supabase
    .from("nfse_history")
    .select("id, asaas_invoice_id, status, client_id")
    .eq("id", nfse_history_id)
    .single();
  
  if (!record?.asaas_invoice_id) {
    throw new AsaasApiError("NFS-e não possui ID no Asaas", 400);
  }
  
  // 2. Consultar Asaas
  const invoice = await asaasRequest(
    settings, 
    `/invoices/${record.asaas_invoice_id}`, 
    "GET"
  );
  
  // 3. Mapear status e atualizar local
  const newStatus = STATUS_MAP[invoice.status] || "processando";
  const updateData = {
    asaas_status: invoice.status,
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
  
  if (invoice.status === "AUTHORIZED") {
    updateData.numero_nfse = invoice.number?.toString();
    updateData.codigo_verificacao = invoice.validationCode;
    updateData.data_autorizacao = new Date().toISOString();
    // ... baixar PDF/XML
  }
  
  await supabase
    .from("nfse_history")
    .update(updateData)
    .eq("id", nfse_history_id);
  
  return { success: true, invoice, new_status: newStatus };
}
```

### Hook para Verificação de Status

```typescript
const useCheckNfseStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (nfseHistoryId: string) => {
      const { data, error } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "check_single_status",
          nfse_history_id: nfseHistoryId,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["nfse-history"] });
      // ...
    },
  });
};
```

---

## Arquivos a Modificar/Criar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/billing/nfse/NfseProcessingIndicator.tsx` | **CRIAR** | Componente de indicador de processamento |
| `supabase/functions/asaas-nfse/index.ts` | **MODIFICAR** | Adicionar ação `check_single_status` |
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | **MODIFICAR** | Adicionar indicador e botão de verificação |
| `src/components/billing/BillingNfseTab.tsx` | **MODIFICAR** | Adicionar indicador na tabela |
| `src/components/billing/nfse/nfseFormat.ts` | **MODIFICAR** | Adicionar função de formatação de status Asaas |

---

## Interface Final

### Na Tabela de Listagem

```text
┌──────────┬────────────────┬──────────────┬─────────────┬───────────────────────┐
│ Número   │ Cliente        │ Valor        │ Status      │ Arquivos              │
├──────────┼────────────────┼──────────────┼─────────────┼───────────────────────┤
│ -        │ CAPASEMU       │ R$ 1.455,34  │ 🔄 12min    │ [📜] [📄]             │
│          │                │              │ Processando │ [🔄 Verificar]        │
├──────────┼────────────────┼──────────────┼─────────────┼───────────────────────┤
│ 2025607  │ Empresa ABC    │ R$ 850,00    │ ✓ Autorizada│ [📜] [📄] [📋]       │
└──────────┴────────────────┴──────────────┴─────────────┴───────────────────────┘
```

### No Painel de Detalhes

```text
┌─────────────────────────────────────────────────────────┐
│  NFS-e - (aguardando número)                           │
│  Cliente: CAPASEMU • Competência: JAN/2025             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │ ⏳ AGUARDANDO AUTORIZAÇÃO DA PREFEITURA           │  │
│  │                                                   │  │
│  │ ██████████████░░░░░░░░░░░░░░░░░░░░░  45%         │  │
│  │                                                   │  │
│  │ 📍 Status Asaas: AUTHORIZATION_PENDING           │  │
│  │ ⏱️ Tempo decorrido: 18 minutos                   │  │
│  │ 📊 Estimativa: 30-60 min (ambiente produção)     │  │
│  │                                                   │  │
│  │ ℹ️ A nota foi transmitida e está na fila de      │  │
│  │    autorização da prefeitura. O status é         │  │
│  │    atualizado automaticamente via webhook.       │  │
│  │                                                   │  │
│  │        [🔄 Verificar Status Agora]               │  │
│  └───────────────────────────────────────────────────┘  │
│                                                         │
│  Valor: R$ 1.455,34    ISS: R$ 29,11                   │
│  Emissão: 04/02/2026 15:32                             │
└─────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

1. **Feedback visual claro** de que a nota está em processamento
2. **Tempo decorrido** exibido em tempo real
3. **Estimativa de tempo** baseada no ambiente (sandbox/produção)
4. **Botão de verificação individual** para forçar atualização
5. **Status Asaas detalhado** (SCHEDULED, AUTHORIZATION_PENDING, etc.)
6. **Atualização automática** quando webhook chegar
