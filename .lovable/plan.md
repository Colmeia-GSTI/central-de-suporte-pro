
# Melhorias no Módulo de Contratos: Edição com Serviços e Histórico Completo

## Resumo das Melhorias Solicitadas

1. **Página de Edição**: Exibir todos os dados do contrato e a lista de serviços para modificar, adicionar ou remover
2. **Listagem de Contratos**: Adicionar botão de ação para acessar o histórico completo antes de editar
3. **Histórico Completo**: Visualizar histórico financeiro (faturas, pagamentos) e de notas fiscais vinculados ao contrato

---

## Análise do Estado Atual

### O que já existe:
- `ContractServicesSection` - Componente completo para gerenciar serviços do contrato (adicionar, remover, alterar quantidade)
- `EntityHistoryTimeline` - Componente reutilizável para exibir histórico
- Tabelas de histórico: `contract_history`, `contract_service_history`
- O formulário de edição já carrega os serviços existentes via query

### O que falta:
1. A página de edição não passa o `contractId` para o `ContractServicesSection`
2. Não há botão de histórico na listagem de contratos
3. Não existe um painel/dialog de histórico unificado mostrando:
   - Histórico do contrato (alterações de dados)
   - Histórico de serviços (adições/remoções)
   - Faturas geradas pelo contrato
   - NFS-e emitidas pelo contrato

---

## Plano de Implementação

### Arquivo 1: `src/components/contracts/ContractHistorySheet.tsx` (NOVO)

Criar um componente Sheet para exibir o histórico completo do contrato com abas:

```text
+------------------------------------------+
|  Histórico do Contrato: [Nome]      [X]  |
+------------------------------------------+
| [Alterações] [Serviços] [Faturas] [NFS-e]|
+------------------------------------------+
|                                          |
|  Timeline de eventos com:                |
|  - Ícone + Cor por tipo de ação          |
|  - Descrição da alteração                |
|  - Usuário responsável                   |
|  - Data/hora relativa                    |
|                                          |
+------------------------------------------+
```

**Funcionalidades:**
- Aba "Alterações": Histórico de mudanças no contrato (`contract_history`)
- Aba "Serviços": Histórico de serviços adicionados/removidos (`contract_service_history`)
- Aba "Faturas": Lista de faturas vinculadas ao contrato (`invoices`)
- Aba "NFS-e": Notas fiscais emitidas para as faturas do contrato (`nfse_records`)

---

### Arquivo 2: `src/pages/contracts/ContractsPage.tsx` (MODIFICAR)

Adicionar botão de ação "Histórico" na coluna de ações da tabela:

**Alterações:**
1. Importar ícone `History` do lucide-react
2. Importar componente `ContractHistorySheet`
3. Adicionar estado para controlar o sheet de histórico
4. Adicionar botão com tooltip "Ver histórico" antes do botão de edição

```typescript
// Novo estado
const [historySheet, setHistorySheet] = useState<{ 
  open: boolean; 
  contract: ContractWithClient | null 
}>({ open: false, contract: null });

// Novo botão na coluna de ações
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setHistorySheet({ open: true, contract })}
      >
        <History className="h-4 w-4" />
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p>Ver histórico</p>
    </TooltipContent>
  </Tooltip>
</TooltipProvider>
```

---

### Arquivo 3: `src/components/contracts/ContractForm.tsx` (MODIFICAR)

Garantir que o `ContractServicesSection` receba o `contractId` para funcionar corretamente no modo de edição:

**Alteração atual (linha ~610):**
```typescript
<ContractServicesSection
  contractId={contractData?.id}  // <- Já está passando!
  initialServices={contractServices}
  onChange={handleServicesChange}
/>
```

O código já está correto! O problema pode estar na query de serviços existentes que não está retornando dados. Vou verificar e corrigir se necessário.

---

### Arquivo 4: `src/pages/contracts/EditContractPage.tsx` (MODIFICAR)

Melhorar a página de edição para exibir mais informações e organização em tabs:

**Layout proposto:**
```text
+------------------------------------------+
| <- Editar Contrato                       |
|    [Nome do contrato] - [Cliente]        |
+------------------------------------------+
| [Dados Gerais] [Serviços] [Faturamento]  |
+------------------------------------------+
|                                          |
|  Formulário organizado por seções        |
|  com scroll suave entre seções           |
|                                          |
+------------------------------------------+
```

Alternativa mais simples: Manter o layout atual mas garantir que a seção de serviços esteja visível e funcional.

---

## Resumo de Arquivos

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/contracts/ContractHistorySheet.tsx` | CRIAR | Painel lateral com histórico completo em abas |
| `src/pages/contracts/ContractsPage.tsx` | MODIFICAR | Adicionar botão de histórico na listagem |
| `src/components/contracts/ContractForm.tsx` | VERIFICAR | Garantir que serviços carreguem na edição |

---

## Detalhes Técnicos

### Query para buscar histórico unificado

```typescript
// Histórico do contrato
const { data: contractHistory } = useQuery({
  queryKey: ["contract-history", contractId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("contract_history")
      .select(`
        id,
        action,
        changes,
        comment,
        created_at,
        profiles:user_id(full_name)
      `)
      .eq("contract_id", contractId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

// Faturas do contrato
const { data: invoices } = useQuery({
  queryKey: ["contract-invoices", contractId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        amount,
        due_date,
        status,
        paid_date,
        reference_month,
        nfse_records(id, numero, status, created_at)
      `)
      .eq("contract_id", contractId)
      .order("due_date", { ascending: false });
    if (error) throw error;
    return data;
  },
});
```

### Estrutura do ContractHistorySheet

```typescript
interface ContractHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: {
    id: string;
    name: string;
    client_name?: string;
  };
}
```

---

## Experiência do Usuário

### Fluxo 1: Ver histórico pela listagem
1. Usuário acessa `/contracts`
2. Clica no ícone de "Histórico" na linha do contrato
3. Sheet abre com 4 abas: Alterações, Serviços, Faturas, NFS-e
4. Navega entre as abas para ver informações específicas

### Fluxo 2: Editar contrato com serviços
1. Usuário acessa `/contracts`
2. Clica no ícone de "Editar" na linha do contrato
3. Abre página de edição com todos os campos preenchidos
4. Seção "Serviços do Contrato" mostra os serviços atuais
5. Pode adicionar, remover ou alterar quantidades
6. Ao salvar, todas as alterações são registradas no histórico

---

## Impacto

- **3 arquivos modificados/criados**
- **Nenhuma alteração no banco de dados** (tabelas já existem)
- **Nenhuma alteração em Edge Functions**
- Melhoria significativa na experiência de gestão de contratos
