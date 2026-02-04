
# Plano: Corrigir Erros de Dados Incompletos do Cliente na Emissão de NFS-e

## Diagnóstico da Causa Raiz

### O Problema Identificado

A NFS-e falhou com os erros:
- "E-mail do cliente incompleto"
- "Endereço do cliente incompleto"  
- "CEP do cliente é inválido"

**Causa raiz**: O cliente `cus_000159715230` foi criado no Asaas anteriormente **SEM** os dados completos (email, endereço, CEP). Quando a NFS-e foi emitida, o Asaas usou esses dados incompletos e rejeitou a nota.

### Fluxo do Problema

```text
1. Cliente cadastrado no sistema local COM dados completos:
   ✓ Email: financeiro@capasemu.com.br
   ✓ Endereço: RUA SETE DE AGOSTO, 431 - ANDAR SETIMO
   ✓ CEP: 99025030

2. Cliente criado no Asaas ANTERIORMENTE com dados INCOMPLETOS:
   ✗ Email: não enviado
   ✗ Endereço: não enviado
   ✗ CEP: não enviado

3. NFS-e emitida usando cliente existente no Asaas:
   → Asaas usa dados incompletos → ERRO
```

### Locais com Criação Incompleta (Código Atual)

| Arquivo | Linha | Problema |
|---------|-------|----------|
| `asaas-nfse/index.ts` | 366-371 | Ação `emit` - cria cliente só com name/cpfCnpj |
| `asaas-nfse/index.ts` | 587-592 | Ação `emit_standalone` - cria cliente só com name/cpfCnpj |
| `nfseValidation.ts` | 366-382 | Email/endereço são apenas **warnings**, não erros |

---

## Solução em 3 Partes

### Parte 1: Atualizar Cliente no Asaas Antes de Emitir NFS-e

**Estratégia**: Sempre sincronizar dados do cliente local com o Asaas antes de emitir NFS-e

```text
┌─────────────────────────────────────────────────────────────┐
│  FLUXO CORRIGIDO                                            │
├─────────────────────────────────────────────────────────────┤
│  1. Buscar cliente local COM todos os campos                │
│  2. Se cliente existe no Asaas → ATUALIZAR (PUT)            │
│  3. Se cliente não existe → CRIAR COMPLETO (POST)           │
│  4. Emitir NFS-e com cliente atualizado                     │
└─────────────────────────────────────────────────────────────┘
```

### Parte 2: Bloquear Emissão com Dados Incompletos

**Estratégia**: Transformar warnings em erros bloqueantes no frontend

| Campo | Antes | Depois |
|-------|-------|--------|
| Email | warning | **error** (para NFS-e) |
| Endereço | warning | **error** (para NFS-e) |
| CEP | não validado | **error** (obrigatório) |

### Parte 3: Criar Função de Sincronização de Cliente

Nova função auxiliar que garante dados completos antes de qualquer operação com NFS-e.

---

## Alterações Técnicas

### 1. Edge Function: `asaas-nfse/index.ts`

#### 1.1 Nova função auxiliar `ensureCustomerSync`

```typescript
async function ensureCustomerSync(
  supabase: SupabaseClient,
  settings: AsaasSettings,
  clientId: string,
  correlationId: string
): Promise<{ customerId: string; client: ClientData }> {
  // 1. Buscar cliente COM TODOS os campos necessários
  const { data: client } = await supabase
    .from("clients")
    .select("id, name, email, financial_email, phone, whatsapp, document, zip_code, address, city, state, asaas_customer_id")
    .eq("id", clientId)
    .single();

  if (!client) {
    throw new AsaasApiError("Cliente não encontrado", 404, "CLIENT_NOT_FOUND");
  }

  // 2. Validar dados obrigatórios para NFS-e
  const email = client.email || client.financial_email;
  const address = client.address;
  const postalCode = client.zip_code?.replace(/\D/g, "");

  const missingFields: string[] = [];
  if (!email) missingFields.push("E-mail");
  if (!address) missingFields.push("Endereço");
  if (!postalCode || postalCode.length !== 8) missingFields.push("CEP válido");

  if (missingFields.length > 0) {
    throw new AsaasApiError(
      `Dados obrigatórios do cliente faltando: ${missingFields.join(", ")}. Atualize o cadastro do cliente.`,
      400,
      "CLIENT_INCOMPLETE_DATA"
    );
  }

  // 3. Montar payload completo
  const customerPayload = {
    name: client.name,
    email: email,
    phone: client.phone?.replace(/\D/g, ""),
    mobilePhone: client.whatsapp?.replace(/\D/g, ""),
    cpfCnpj: client.document?.replace(/\D/g, ""),
    postalCode: postalCode,
    address: extractStreetFromAddress(address),
    addressNumber: extractNumberFromAddress(address) || "S/N",
    province: client.city || "Não informado",
    externalReference: client.id,
    notificationDisabled: false,
  };

  let customerId: string;

  // 4. Criar ou atualizar cliente no Asaas
  if (client.asaas_customer_id) {
    // Cliente existe - ATUALIZAR para garantir dados atualizados
    log(correlationId, "info", "Atualizando cliente no Asaas", { customer_id: client.asaas_customer_id });
    await asaasRequest(
      settings, 
      `/customers/${client.asaas_customer_id}`, 
      "PUT", 
      customerPayload, 
      correlationId
    );
    customerId = client.asaas_customer_id;
  } else {
    // Cliente não existe - CRIAR completo
    log(correlationId, "info", "Criando cliente no Asaas com dados completos");
    const customer = await asaasRequest(settings, "/customers", "POST", customerPayload, correlationId);
    customerId = customer.id;
    
    // Salvar ID do Asaas no cliente local
    await supabase
      .from("clients")
      .update({ asaas_customer_id: customerId })
      .eq("id", clientId);
  }

  return { customerId, client };
}

// Funções auxiliares para extrair número do endereço
function extractStreetFromAddress(address: string): string {
  // Remove o número do endereço (ex: "RUA X, 123" -> "RUA X")
  return address.replace(/,?\s*\d+.*$/, "").trim() || address;
}

function extractNumberFromAddress(address: string): string | null {
  // Extrai número do endereço (ex: "RUA X, 123" -> "123")
  const match = address.match(/,?\s*(\d+)/);
  return match ? match[1] : null;
}
```

#### 1.2 Modificar ação `emit` (linhas ~350-380)

Substituir criação parcial por chamada à nova função:

```typescript
// ANTES (problemático):
if (client.asaas_customer_id) {
  customerId = client.asaas_customer_id;
} else {
  const createResult = await asaasRequest(settings, "/customers", "POST", {
    name: client.name || "Cliente",
    cpfCnpj: client.document?.replace(/\D/g, ""),
    // FALTAM: email, address, postalCode
  }, correlationId);
  customerId = createResult.id;
}

// DEPOIS (corrigido):
const { customerId, client: syncedClient } = await ensureCustomerSync(
  supabase, settings, client_id, correlationId
);
```

#### 1.3 Modificar ação `emit_standalone` (linhas ~584-600)

Mesma correção:

```typescript
// ANTES (problemático):
if (!customerId) {
  const createResult = await asaasRequest(settings, "/customers", "POST", {
    name: client.name || "Cliente",
    cpfCnpj: client.document?.replace(/\D/g, ""),
    // FALTAM: email, address, postalCode
  }, correlationId);
  customerId = createResult.id;
}

// DEPOIS (corrigido):
const { customerId: syncedCustomerId } = await ensureCustomerSync(
  supabase, settings, client_id, correlationId
);
customerId = syncedCustomerId;
```

---

### 2. Validação Frontend: `src/components/billing/nfse/nfseValidation.ts`

Transformar campos em erros bloqueantes para emissão de NFS-e:

```typescript
// ANTES (warning apenas):
if (!input.client.address) {
  issues.push({
    level: "warning",  // Permitia continuar
    field: "client.address",
    message: "Endereço do cliente não informado",
    code: "CLIENTE_ENDERECO",
  });
}

// DEPOIS (erro bloqueante):
if (!input.client.address) {
  issues.push({
    level: "error",  // Bloqueia emissão
    field: "client.address",
    message: "Endereço do cliente é obrigatório para emissão de NFS-e",
    code: "CLIENTE_ENDERECO",
  });
}
```

Adicionar validação de CEP:

```typescript
// NOVO - Validar CEP
const zip = (input.client.zip_code ?? "").replace(/\D/g, "");
if (!zip || zip.length !== 8) {
  issues.push({
    level: "error",
    field: "client.zip_code",
    message: "CEP do cliente inválido ou não informado (deve ter 8 dígitos)",
    code: "CLIENTE_CEP",
  });
}
```

---

### 3. Interface de Seleção de Cliente: `NfseAvulsaDialog.tsx`

Mostrar alerta quando cliente selecionado tem dados incompletos:

```typescript
// Adicionar query para dados completos do cliente
const { data: selectedClient } = useQuery({
  queryKey: ["client-nfse-validation", clientId],
  queryFn: async () => {
    if (!clientId) return null;
    const { data } = await supabase
      .from("clients")
      .select("id, name, email, financial_email, address, zip_code, city")
      .eq("id", clientId)
      .single();
    return data;
  },
  enabled: !!clientId,
});

// Verificar completude
const clientValidation = useMemo(() => {
  if (!selectedClient) return null;
  const missing: string[] = [];
  if (!selectedClient.email && !selectedClient.financial_email) missing.push("E-mail");
  if (!selectedClient.address) missing.push("Endereço");
  if (!selectedClient.zip_code?.replace(/\D/g, "") || 
      selectedClient.zip_code.replace(/\D/g, "").length !== 8) missing.push("CEP");
  return missing.length > 0 ? missing : null;
}, [selectedClient]);
```

Exibir alerta:

```tsx
{clientValidation && (
  <Alert variant="destructive" className="py-2">
    <ShieldAlert className="h-4 w-4" />
    <AlertDescription className="text-sm">
      <strong>Cadastro incompleto:</strong> O cliente precisa de {clientValidation.join(", ")}.
      <Button variant="link" size="sm" className="h-auto p-0 ml-1">
        Editar cliente
      </Button>
    </AlertDescription>
  </Alert>
)}
```

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `supabase/functions/asaas-nfse/index.ts` | **MODIFICAR** | Adicionar `ensureCustomerSync`, corrigir `emit` e `emit_standalone` |
| `src/components/billing/nfse/nfseValidation.ts` | **MODIFICAR** | Email/endereço/CEP como erros bloqueantes |
| `src/components/billing/nfse/NfseAvulsaDialog.tsx` | **MODIFICAR** | Alerta de dados incompletos + bloquear botão |
| `src/lib/nfse-validation.ts` | **MODIFICAR** | Adicionar validação de CEP, transformar warnings em errors |

---

## Fluxo Corrigido

```text
┌─────────────────────────────────────────────────────────────────────┐
│  EMISSÃO DE NFS-e (CORRIGIDO)                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Usuário seleciona cliente                                       │
│     ↓                                                               │
│  2. Frontend valida dados obrigatórios (email, endereço, CEP)       │
│     ├─ Se incompleto → BLOQUEIA com mensagem de erro                │
│     └─ Se completo → continua                                       │
│     ↓                                                               │
│  3. Ao submeter, Edge Function chama ensureCustomerSync()           │
│     ├─ Cliente existe no Asaas? → PUT para atualizar dados          │
│     └─ Cliente não existe? → POST com dados completos               │
│     ↓                                                               │
│  4. NFS-e emitida com cliente completo                              │
│     → SUCESSO                                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

1. **Validação preventiva**: Erros exibidos ANTES de tentar emitir
2. **Sincronização automática**: Cliente sempre atualizado no Asaas antes da emissão
3. **Mensagens claras**: Usuário sabe exatamente quais campos estão faltando
4. **Sem erros de dados incompletos**: Problema nunca mais ocorrerá para nenhum cliente
