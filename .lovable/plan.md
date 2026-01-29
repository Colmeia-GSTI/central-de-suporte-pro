

# Plano: Correção do Sistema NFS-e + Integração Financeira Completa

## Problemas Identificados na Análise

### 1. BUG CRÍTICO: Reenvio Não Processa no Asaas

**Localização:** `src/components/billing/nfse/NfseDetailsSheet.tsx` (linhas 222-240)

**Problema:** O `resendMutation` apenas atualiza o status local para "pendente":
```typescript
const resendMutation = useMutation({
  mutationFn: async () => {
    const { error } = await supabase
      .from("nfse_history")
      .update({ status: "pendente", mensagem_retorno: null, ... })
      .eq("id", nfse.id);
    if (error) throw error;
  },
  // NÃO CHAMA A API ASAAS!
});
```

**Já o `NfseActionsMenu.tsx` faz corretamente** (linhas 200-229):
```typescript
const { data, error } = await supabase.functions.invoke("asaas-nfse", {
  body: { action: "emit", client_id, value, service_description, ... },
});
```

### 2. Edições Não São Passadas no Reenvio

Quando o usuário edita valor/descrição e clica em "Validar e Reenviar":
- Os campos editados são salvos no banco ✅
- MAS o reenvio não passa os valores editados para a API ❌

### 3. Falta de Botão "Emitir Completo" nas Faturas

Atualmente são passos separados:
1. Gerar Boleto
2. Gerar PIX  
3. Emitir NFS-e
4. Enviar Email
5. Enviar WhatsApp

**Desejado:** Um único botão que faz tudo automaticamente.

### 4. Sem Vinculação Visual NFS-e ↔ Fatura

Na listagem de faturas não mostra se já tem NFS-e vinculada.

---

## Plano de Implementação

### Fase 1: Corrigir Bug de Reenvio (Crítico)

**Arquivo:** `src/components/billing/nfse/NfseDetailsSheet.tsx`

**Alteração:**
1. Modificar `resendMutation` para:
   - Primeiro salvar alterações locais (valor, competência, descrição)
   - Depois chamar a edge function `asaas-nfse` com action `emit`
   - Passar os valores editados atualizados

**Antes (problemático):**
```typescript
const resendMutation = useMutation({
  mutationFn: async () => {
    await supabase.from("nfse_history")
      .update({ status: "pendente", ... })
      .eq("id", nfse.id);
  },
});
```

**Depois (corrigido):**
```typescript
const resendMutation = useMutation({
  mutationFn: async () => {
    // 1. Salvar alterações locais primeiro
    await supabase.from("nfse_history").update({
      valor_servico: valor,
      descricao_servico: descricao,
      competencia: normalizeCompetencia(competencia) + "-01",
      updated_at: new Date().toISOString(),
    }).eq("id", nfse.id);
    
    // 2. Chamar API Asaas para reemitir
    const { data, error } = await supabase.functions.invoke("asaas-nfse", {
      body: {
        action: "emit",
        client_id: nfse.client_id,
        value: valor,
        service_description: descricao,
        nfse_history_id: nfse.id,
        competencia: normalizeCompetencia(competencia),
      },
    });
    
    if (error) throw error;
    if (!data.success) throw new Error(data.error);
    return data;
  },
});
```

---

### Fase 2: Adicionar Botão "Emitir Completo" nas Faturas

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx`

**Alterações:**
1. Criar função `handleEmitComplete` que:
   - Gera boleto se não existir
   - Gera PIX se não existir
   - Emite NFS-e se tiver contrato
   - Envia notificação por Email + WhatsApp

2. Adicionar opção no dropdown de ações

**Nova função:**
```typescript
const handleEmitComplete = async (invoice: InvoiceWithClient) => {
  setProcessingComplete(invoice.id);
  try {
    // 1. Gerar boleto se não existe
    if (!invoice.boleto_url) {
      await supabase.functions.invoke("banco-inter", {
        body: { invoice_id: invoice.id, payment_type: "boleto" },
      });
    }
    
    // 2. Gerar PIX se não existe
    if (!invoice.pix_code) {
      await supabase.functions.invoke("banco-inter", {
        body: { invoice_id: invoice.id, payment_type: "pix" },
      });
    }
    
    // 3. Emitir NFS-e se tiver contrato
    if (invoice.contract_id) {
      await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "emit",
          client_id: invoice.client_id,
          invoice_id: invoice.id,
          contract_id: invoice.contract_id,
          value: invoice.amount,
        },
      });
    }
    
    // 4. Enviar notificações
    await supabase.functions.invoke("resend-payment-notification", {
      body: { invoice_id: invoice.id, channels: ["email", "whatsapp"] },
    });
    
    toast.success("Fatura processada e enviada!");
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  } catch (error) {
    toast.error("Erro no processamento", { description: error.message });
  } finally {
    setProcessingComplete(null);
  }
};
```

**Novo item no dropdown:**
```typescript
<DropdownMenuItem onClick={() => handleEmitComplete(invoice)}>
  <Zap className="mr-2 h-4 w-4" />
  Emitir Completo (Boleto + NFS-e + Enviar)
</DropdownMenuItem>
```

---

### Fase 3: Mostrar Status NFS-e na Listagem de Faturas

**Arquivo:** `src/components/billing/BillingInvoicesTab.tsx`

**Alterações:**
1. Modificar query para buscar NFS-e vinculada:
```typescript
const { data: invoices } = useQuery({
  queryFn: async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select("*, clients(name), contract_id")
      .order("due_date", { ascending: false });
    // ...
  },
});

// Query separada para NFS-e de cada invoice
const { data: nfseByInvoice } = useQuery({
  queryKey: ["nfse-by-invoices"],
  queryFn: async () => {
    const { data } = await supabase
      .from("nfse_history")
      .select("invoice_id, status, numero_nfse")
      .not("invoice_id", "is", null);
    // Criar map: { invoice_id: { status, numero } }
    return data?.reduce((acc, n) => {
      acc[n.invoice_id!] = n;
      return acc;
    }, {});
  },
});
```

2. Adicionar badge na coluna de status:
```typescript
{nfseByInvoice?.[invoice.id] && (
  <Badge variant="outline" className="ml-2">
    <FileText className="h-3 w-3 mr-1" />
    NFS-e {nfseByInvoice[invoice.id].status === "autorizada" ? "✓" : "..."}
  </Badge>
)}
```

---

### Fase 4: Adicionar Preview Antes de Emitir NFS-e

**Arquivo:** `src/components/financial/EmitNfseDialog.tsx`

**Alterações:**
1. Adicionar um passo de confirmação mostrando todos os dados:
   - Cliente (nome, CPF/CNPJ)
   - Valor
   - Competência
   - Descrição do serviço
   - Código tributário
2. Botão "Confirmar e Emitir" após revisão

---

### Fase 5: Motivo Obrigatório para Cancelamento

**Arquivo:** `src/components/billing/nfse/NfseDetailsSheet.tsx`

**Alterações:**
1. Adicionar campo de texto "Motivo do Cancelamento" no dialog de confirmação
2. Validar que não está vazio antes de permitir cancelar
3. Passar o motivo para a edge function
4. Salvar no campo `motivo_cancelamento` da tabela

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | Corrigir resendMutation, adicionar motivo cancelamento |
| `src/components/billing/BillingInvoicesTab.tsx` | Botão "Emitir Completo", badge NFS-e |
| `src/components/financial/EmitNfseDialog.tsx` | Preview antes de emitir |
| `src/components/nfse/NfseActionsMenu.tsx` | Garantir consistência com NfseDetailsSheet |

---

## Resultado Esperado

1. **Bug corrigido:** Editar e reenviar NFS-e agora funciona corretamente
2. **Dados sempre salvos:** Alterações são persistidas antes do envio
3. **Fluxo integrado:** Botão "Emitir Completo" para boleto + NFS-e + enviar
4. **Rastreabilidade:** Faturas mostram se têm NFS-e vinculada
5. **Preview:** Usuário confirma dados antes de emitir
6. **Cancelamento:** Motivo obrigatório para auditoria

---

## Resumo das Etapas

| Etapa | Descrição | Prioridade |
|-------|-----------|------------|
| 1 | Corrigir bug resendMutation | Crítica |
| 2 | Botão "Emitir Completo" | Alta |
| 3 | Badge NFS-e nas faturas | Média |
| 4 | Preview antes de emitir | Média |
| 5 | Motivo obrigatório cancelamento | Média |

