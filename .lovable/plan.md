

# Plano: Corrigir listagem de clientes e campo de data de reajuste

## Problema Identificado

### Causa Raiz: Cache Desatualizado (Query Key Divergente)

Quando um novo cliente e cadastrado (ex: "Viapiana"), o `ClientForm` invalida o cache com a chave `["clients"]`. Porem, o formulario de contratos (`ContractForm`) busca clientes usando a chave `["clients-select"]`. Como essas chaves sao diferentes, o cache do formulario de contratos nunca e atualizado apos a criacao de um novo cliente.

Agravante: o `QueryClient` global esta configurado com `staleTime: 5 minutos`, o que significa que mesmo ao navegar para a pagina de novo contrato, o React Query reutiliza dados em cache antigos sem refazer a consulta.

### Problema Secundario: Campo de Data de Reajuste

O campo "Data do Proximo Reajuste" usa um `<Input type="date">` nativo do HTML. Isso funciona de forma inconsistente entre navegadores e nao segue o padrao visual do sistema (Shadcn UI). Precisa ser substituido por um date picker com calendario clicavel.

---

## Solucao

### 1. Corrigir invalidacao de cache no ClientForm

**Arquivo:** `src/components/clients/ClientForm.tsx`

No `onSuccess` da mutation, adicionar invalidacao da chave `["clients-select"]` alem da existente `["clients"]`:

```typescript
onSuccess: (clientId) => {
  clearDraft();
  queryClient.invalidateQueries({ queryKey: ["clients"] });
  queryClient.invalidateQueries({ queryKey: ["clients-select"] }); // NOVO
  // ... resto do codigo
};
```

### 2. Corrigir invalidacao na pagina de exclusao de clientes

**Arquivo:** `src/pages/clients/ClientsPage.tsx`

No `deleteMutation.onSuccess`, tambem invalidar `["clients-select"]` para manter consistencia.

### 3. Substituir Input de data por DatePicker com calendario

**Arquivo:** `src/components/contracts/ContractForm.tsx`

Substituir o `<Input type="date">` do campo `adjustment_date` por um componente `Popover` + `Calendar` do Shadcn UI, com formatacao em PT-BR e botao clicavel mostrando a data selecionada.

O componente renderizara:
- Um botao com icone de calendario que abre um popover
- Um calendario mensal para selecao de data
- Formatacao da data no padrao brasileiro (dd/MM/yyyy)
- Placeholder "Selecione a data" quando vazio

### 4. Garantir que a pagina de contratos tambem invalide o cache de clientes

**Arquivo:** `src/pages/contracts/ContractsPage.tsx`

No `deleteMutation.onSuccess`, invalidar `["clients-select"]` para prevenir inconsistencias futuras.

---

## Detalhes Tecnicos

### Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `src/components/clients/ClientForm.tsx` | Adicionar `invalidateQueries(["clients-select"])` no onSuccess |
| `src/pages/clients/ClientsPage.tsx` | Adicionar `invalidateQueries(["clients-select"])` no delete onSuccess |
| `src/components/contracts/ContractForm.tsx` | Trocar `<Input type="date">` por `Popover + Calendar` do Shadcn |

### Imports adicionais no ContractForm

- `Popover`, `PopoverTrigger`, `PopoverContent` de `@/components/ui/popover`
- `Calendar` de `@/components/ui/calendar`
- `CalendarIcon` de `lucide-react`
- `format` de `date-fns`
- `ptBR` de `date-fns/locale/pt-BR`
- `cn` de `@/lib/utils`

