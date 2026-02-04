

# Solucao Definitiva para Erro E0014 (DPS Duplicada) e Melhorias no Sistema de NFS-e

## Analise do Problema

### Dados do XML Enviado (Nota #77 Autorizada)
```text
Numero NFS-e:     77
Serie DPS:        1
Numero DPS:       74
Competencia:      2026-02-04
Valor:            R$ 1.461,44
CNPJ Tomador:     87.603.775/0001-30
Codigo Trib:      010701
ISS Retido:       Sim (tpRetISSQN = 1)
Provedor:         FocusNfe (via Asaas)
```

### Causa Raiz do Erro E0014
O erro **E0014 - DPS Duplicada** ocorre porque:

1. O Portal Nacional da NFS-e valida unicidade pela combinacao:
   - Serie + Numero DPS + CNPJ Emitente + Municipio

2. O Asaas gerencia a numeracao da DPS internamente, mas quando se tenta reemitir uma NFS-e que ja foi processada anteriormente (mesmo com erro), ele pode tentar usar o mesmo numero DPS

3. O sistema atual nao detecta proativamente notas ja existentes antes de tentar reemitir

### Problemas Identificados

| #  | Problema | Impacto |
|----|----------|---------|
| 1  | Reemissao usa mesmo `nfse_history_id` que ja tem `asaas_invoice_id` | Cria conflito no Asaas |
| 2  | Nao ha validacao se a nota ja existe autorizada no Portal | Usuario fica em loop de erro |
| 3  | Mensagens de erro nao sao amigaveis | Dificil entender a acao necessaria |
| 4  | Falta opcao para marcar nota como "ja emitida externamente" | Usuario nao consegue sincronizar |

---

## Solucao Proposta

### 1. Tratamento Inteligente do Erro E0014

Quando o erro E0014 for detectado, o sistema deve:
- Identificar automaticamente o codigo de erro
- Exibir mensagem clara ao usuario
- Oferecer acoes especificas (marcar como autorizada, vincular nota existente)

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

Adicionar mapeamento de erros conhecidos:

```typescript
const KNOWN_ERRORS = {
  E0014: {
    code: "DPS_DUPLICADA",
    title: "Nota Fiscal ja existe",
    message: "Esta NFS-e ja foi emitida anteriormente no Portal Nacional. Verifique no painel do Asaas ou Portal Nacional se a nota esta autorizada.",
    action: "VERIFY_EXTERNAL",
  },
  // Outros erros comuns...
};
```

### 2. Validacao Pre-Emissao para Reemissao

Antes de reemitir uma NFS-e em status `erro` ou `pendente`, verificar se:
- Ja existe um `asaas_invoice_id` vinculado
- Se existir, consultar status atual no Asaas antes de criar novo

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

Na acao `emit`, adicionar verificacao:

```typescript
case "emit": {
  // Se ja tem asaas_invoice_id, verificar status primeiro
  if (nfse_history_id) {
    const { data: existing } = await supabase
      .from("nfse_history")
      .select("asaas_invoice_id, asaas_status")
      .eq("id", nfse_history_id)
      .single();
    
    if (existing?.asaas_invoice_id) {
      // Consultar Asaas para verificar status atual
      const invoice = await asaasRequest(settings, 
        `/invoices/${existing.asaas_invoice_id}`, "GET");
      
      if (invoice.status === "AUTHORIZED") {
        // Atualizar local e retornar sucesso
        await updateNfseAsAuthorized(supabase, nfse_history_id, invoice);
        return successResponse({ already_authorized: true, ... });
      }
      
      if (invoice.status === "ERROR" && 
          invoice.statusDescription?.includes("E0014")) {
        // Nota ja existe - nao reemitir
        throw new AsaasApiError(
          "Esta nota ja foi emitida no Portal Nacional. Use 'Vincular Nota Existente'.",
          409, "DPS_DUPLICADA"
        );
      }
    }
  }
  // ... continuar emissao normal
}
```

### 3. Nova Acao: Vincular Nota Existente

Permitir que usuario vincule manualmente uma nota ja emitida no Portal Nacional, informando o numero da NFS-e.

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

Adicionar nova acao:

```typescript
case "link_external": {
  const { nfse_history_id, numero_nfse, data_autorizacao } = params;
  
  await supabase
    .from("nfse_history")
    .update({
      status: "autorizada",
      numero_nfse: numero_nfse,
      data_autorizacao: data_autorizacao || new Date().toISOString(),
      mensagem_retorno: "Nota vinculada manualmente a emissao externa",
      codigo_retorno: "LINKED_EXTERNAL",
      updated_at: new Date().toISOString(),
    })
    .eq("id", nfse_history_id);
  
  return successResponse({ linked: true });
}
```

### 4. Interface para Vincular Nota Externa

**Arquivo:** `src/components/billing/nfse/NfseDetailsSheet.tsx`

Adicionar dialog para vincular nota quando status for `erro` com E0014:

```tsx
{nfse.status === "erro" && 
 nfse.mensagem_retorno?.includes("E0014") && (
  <Alert className="bg-amber-50 border-amber-200">
    <AlertDescription>
      <p className="font-medium">Nota ja existe no Portal Nacional</p>
      <p className="text-sm mt-1">
        Informe o numero da NFS-e para sincronizar o registro.
      </p>
      <div className="flex gap-2 mt-3">
        <Input 
          placeholder="Numero NFS-e (ex: 77)"
          value={numeroExterno}
          onChange={(e) => setNumeroExterno(e.target.value)}
        />
        <Button onClick={handleLinkExternal}>
          Vincular
        </Button>
      </div>
    </AlertDescription>
  </Alert>
)}
```

### 5. Melhorar Mensagens de Erro

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

Enriquecer parsing de erros da prefeitura:

```typescript
function parseStatusDescription(statusDescription: string | null): {
  codigo: string | null;
  descricao: string;
  acao: string | null;
} {
  if (!statusDescription) {
    return { codigo: null, descricao: "Erro desconhecido", acao: null };
  }
  
  // Extrair codigo do formato "Codigo: E0014\r\nDescricao: ..."
  const codigoMatch = statusDescription.match(/C[oó]digo:\s*(\w+)/i);
  const descMatch = statusDescription.match(/Descri[cç][aã]o:\s*(.+?)(?:\r?\n|$)/i);
  
  const codigo = codigoMatch?.[1] || null;
  const descricao = descMatch?.[1]?.trim() || statusDescription;
  
  // Mapear acao sugerida
  const acoesConhecidas: Record<string, string> = {
    E0014: "Verifique se a nota ja existe no Portal Nacional e use 'Vincular Nota Existente'",
    E0001: "Verifique os dados do certificado digital",
    // ... outros codigos
  };
  
  return {
    codigo,
    descricao,
    acao: codigo ? acoesConhecidas[codigo] || null : null,
  };
}
```

### 6. Log de Eventos Enriquecido

**Arquivo:** `supabase/functions/asaas-nfse/index.ts`

Ao detectar erro E0014, logar com detalhes uteis:

```typescript
if (codigo === "E0014") {
  await logNfseEvent(supabase, historyId, "dps_duplicada", "warn",
    "DPS duplicada detectada - nota possivelmente ja emitida no Portal Nacional",
    correlationId, {
      asaas_invoice_id: invoice.id,
      status_description: invoice.statusDescription,
      sugestao: "Verifique no Portal Nacional se existe nota autorizada para este cliente/valor"
    }
  );
}
```

---

## Arquivos a Modificar

| Arquivo | Alteracao |
|---------|-----------|
| `supabase/functions/asaas-nfse/index.ts` | Adicionar verificacao pre-emissao, acao `link_external`, parsing de erros |
| `src/components/billing/nfse/NfseDetailsSheet.tsx` | Adicionar UI para vincular nota externa |
| `src/components/billing/nfse/nfseFormat.ts` | Adicionar funcao `formatErrorMessage` |

---

## Fluxo Corrigido

```text
USUARIO TENTA REEMITIR
         |
         v
   Verificar se ja tem 
   asaas_invoice_id?
         |
   +-----+-----+
   |           |
  NAO         SIM
   |           |
   v           v
Criar nova   Consultar status
nota         no Asaas
   |           |
   |     +-----+-----+
   |     |           |
   |  AUTHORIZED   ERROR
   |     |           |
   |     v           v
   |  Atualizar   E0014?
   |  como        +--+--+
   |  autorizada  SIM  NAO
   |     |         |    |
   |     |         v    v
   |     |    Exibir   Tentar
   |     |    opcao    reemitir
   |     |    vincular
   |     |         |
   v     v         v
 SUCESSO      Usuario vincula
              nota externa
```

---

## Beneficios

1. **Prevencao de erros**: Detecta notas duplicadas antes de tentar reemitir
2. **Recuperacao facil**: Usuario pode vincular nota ja emitida externamente
3. **Mensagens claras**: Erros da prefeitura sao traduzidos para acoes concretas
4. **Rastreabilidade**: Logs detalhados para cada cenario de erro
5. **Sincronizacao**: Permite manter historico alinhado com Portal Nacional

---

## Detalhes Tecnicos

### Estrutura do Erro E0014 (Prefeitura de Passo Fundo-RS)

```text
Retorno da prefeitura de Passo Fundo-RS: 
Codigo: E0014
Descricao: Conjunto de Serie, Numero, Codigo do Municipio 
Emissor e CNPJ/CPF informado nesta DPS ja existe em uma 
NFS-e gerada a partir de uma DPS enviada anteriormente.
```

### Campos Relevantes da API Asaas

| Campo | Descricao |
|-------|-----------|
| `status` | Status atual: SCHEDULED, SYNCHRONIZED, AUTHORIZATION_PENDING, AUTHORIZED, ERROR |
| `statusDescription` | Retorno detalhado da prefeitura (inclui codigo de erro) |
| `errors[]` | Lista de erros genericos do Asaas |
| `number` | Numero da NFS-e (quando autorizada) |
| `validationCode` | Codigo de verificacao |

