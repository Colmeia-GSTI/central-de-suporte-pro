

# Plano Atualizado: Vinculação Obrigatória de Ativo ao Iniciar Atendimento

## Resumo da Atualização

A lista de ativos que aparece no dialog de seleção deve ser **filtrada pelo cliente (empresa) do ticket**:
- Se o ticket tiver `client_id`: mostrar apenas ativos desse cliente
- Se o ticket **não** tiver `client_id`: não mostrar lista de ativos, apenas opção "Outro"

---

## Análise do Estado Atual

### Já Existe e Funciona:
- Tabela `tickets` possui campo `asset_id` (FK para `assets`)
- Função RPC `get_ticket_form_data(p_client_id)` já filtra ativos por cliente:
  ```sql
  WHERE (p_client_id IS NULL OR client_id = p_client_id)
    AND status = 'active'
  ```
- `TicketDetailsTab.tsx` já usa essa RPC para buscar ativos filtrados
- Assets são sempre vinculados a um cliente (`assets.client_id` é obrigatório)

### Comportamento Correto Garantido:
- Quando `p_client_id` é passado → retorna apenas ativos desse cliente
- Quando `p_client_id` é `NULL` → retorna todos os ativos (mas vamos ajustar para retornar vazio)

---

## Etapas de Implementação

### Etapa 1: Adicionar Campo para Descrição de Ativo Personalizado

Criar migração SQL:

```sql
ALTER TABLE public.tickets 
ADD COLUMN IF NOT EXISTS asset_description TEXT;

COMMENT ON COLUMN public.tickets.asset_description IS 
  'Descrição do dispositivo quando opção "Outro" é selecionada ao iniciar atendimento';
```

### Etapa 2: Criar Dialog de Seleção de Ativo

Novo componente `AssetSelectionDialog.tsx`:

```text
+--------------------------------------------------+
|  SELECIONAR DISPOSITIVO DO ATENDIMENTO           |
+--------------------------------------------------+
|                                                  |
|  Qual dispositivo será atendido? *               |
|                                                  |
|  (Se ticket TEM cliente vinculado):              |
|  +--------------------------------------------+  |
|  | Selecionar dispositivo...                v |  |
|  +--------------------------------------------+  |
|  - [Computador] PC Recepção - Dell OptiPlex     |
|  - [Notebook] Notebook João - HP ProBook        |
|  - [Impressora] Impressora RH - HP LaserJet     |
|  - [Outro] Outro dispositivo (especificar)      |
|                                                  |
|  (Se ticket NÃO tem cliente vinculado):          |
|  Nenhum cliente vinculado a este chamado.        |
|  +--------------------------------------------+  |
|  | Descreva o dispositivo ou problema geral   |  |
|  +--------------------------------------------+  |
|                                                  |
|  [Cancelar]               [Iniciar Atendimento] |
+--------------------------------------------------+
```

**Lógica do componente:**

1. Recebe `clientId` como prop (do ticket)
2. Se `clientId` existir:
   - Busca ativos via RPC `get_ticket_form_data(clientId)`
   - Mostra lista de ativos + opção "Outro"
3. Se `clientId` for `null`:
   - Não busca ativos (lista vazia)
   - Mostra apenas campo de descrição obrigatório
4. Se "Outro" selecionado ou não há cliente:
   - Mostra campo de texto obrigatório para descrição

### Etapa 3: Modificar Fluxo de Início do Ticket

Alterar `TicketsPage.tsx`:

1. Criar state para controlar o dialog de seleção de ativo
2. Ao clicar em "Iniciar":
   - Salvar ticket pendente em state
   - Abrir `AssetSelectionDialog`
3. Após confirmar seleção no dialog:
   - Executar mutation incluindo `asset_id` ou `asset_description`
   - Abrir detalhes do ticket

**Código atualizado da mutation:**

```typescript
const startTicketMutation = useMutation({
  mutationFn: async ({ 
    ticketId, 
    assetId, 
    assetDescription 
  }: { 
    ticketId: string; 
    assetId: string | null; 
    assetDescription: string | null;
  }) => {
    const { error } = await supabase
      .from("tickets")
      .update({
        status: "in_progress",
        assigned_to: user?.id,
        first_response_at: new Date().toISOString(),
        asset_id: assetId,
        asset_description: assetDescription,
      })
      .eq("id", ticketId);
    if (error) throw error;
    // ... registrar histórico
  },
});
```

### Etapa 4: Exibir Ativo/Descrição nos Detalhes

Modificar `TicketDetailsTab.tsx`:

- Se `asset_id` preenchido: mostrar nome do ativo (já funciona)
- Se `asset_description` preenchido: mostrar a descrição
- Se ambos vazios: mostrar "Não especificado"

---

## Arquivos a Serem Modificados/Criados

| Arquivo | Ação |
|---------|------|
| Migração SQL | CRIAR - Adicionar campo `asset_description` |
| `src/components/tickets/AssetSelectionDialog.tsx` | CRIAR - Dialog de seleção |
| `src/pages/tickets/TicketsPage.tsx` | MODIFICAR - Integrar dialog no fluxo de início |
| `src/components/tickets/TicketDetailsTab.tsx` | MODIFICAR - Exibir descrição do ativo |

---

## Regras de Negócio

| Cenário | Comportamento |
|---------|---------------|
| Ticket com cliente | Lista ativos do cliente + opção "Outro" |
| Ticket sem cliente | Apenas campo de descrição obrigatório |
| Seleção "Outro" | Campo de descrição obrigatório |
| Ativo cadastrado selecionado | Salva `asset_id`, `asset_description` = null |
| Descrição preenchida | Salva `asset_description`, `asset_id` = null |

---

## Seção Técnica

### Estrutura do AssetSelectionDialog

```typescript
interface AssetSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
  ticketId: string;
  onConfirm: (assetId: string | null, assetDescription: string | null) => void;
  isPending?: boolean;
}

// Tipos de ativo para exibição com ícones
const assetTypeLabels = {
  computer: "Computador",
  notebook: "Notebook",
  server: "Servidor",
  printer: "Impressora",
  switch: "Switch",
  router: "Roteador",
  other: "Outro",
};
```

### Validação de Seleção

```typescript
// Validação antes de permitir iniciar
const canSubmit = useMemo(() => {
  if (selectedAssetId && selectedAssetId !== "other") {
    return true; // Ativo cadastrado selecionado
  }
  if (selectedAssetId === "other" && customDescription.trim()) {
    return true; // "Outro" com descrição preenchida
  }
  if (!clientId && customDescription.trim()) {
    return true; // Sem cliente, com descrição
  }
  return false;
}, [selectedAssetId, customDescription, clientId]);
```

---

## Resultado Esperado

1. **Técnico clica "Iniciar"** → Dialog de seleção de ativo aparece
2. **Se ticket tem cliente** → Lista de ativos do cliente é exibida
3. **Se ticket não tem cliente** → Apenas campo de descrição
4. **Seleção obrigatória** → Não pode iniciar sem selecionar/descrever
5. **Dados salvos** → `asset_id` ou `asset_description` preenchido
6. **Relatórios** → Podem agrupar chamados por dispositivo

