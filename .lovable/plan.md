

## Plano: Corrigir crash e ajustar formulário de contratos

### Causa Raiz

O `ContractForm.tsx` usa 7+ componentes `Select` do Radix UI simultaneamente. A combinação de múltiplos portals Radix com React 18 causa o erro fatal `NotFoundError: Failed to execute 'removeChild' on 'Node'`, que derruba a página inteira (ErrorBoundary mostra "Erro ao carregar esta página").

### Solução

Converter **o seletor de clientes** para Combobox (Popover+Command) — é o mais crítico pois tem lista dinâmica e precisa de busca. Os demais Selects (support_model, status, term_type, billing_provider, payment_preference, adjustment_index) são estáticos com 3-5 itens e funcionam melhor como `<select>` nativo via Radix, mas precisam ter `modal={false}` no `SelectContent` para evitar conflito de portals.

### Mudanças em `src/components/contracts/ContractForm.tsx`

1. **Adicionar imports**: `Popover`, `PopoverContent`, `PopoverTrigger`, `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, ícones `Check`, `ChevronsUpDown`

2. **Converter seletor de clientes** (linhas 530-551) para Combobox com:
   - Estado `clientPopoverOpen` para controlar abertura
   - `CommandInput` com placeholder "Buscar cliente..."
   - `CommandList` com `max-h-[200px]` para rolagem
   - `CommandEmpty` com "Nenhum cliente encontrado"
   - `CommandItem` com `value={client.name}` para busca por nome
   - Ícone `Check` no item selecionado

3. **Adicionar `modal={false}`** em todos os `SelectContent` restantes para evitar conflito de portal DOM:
   - `support_model` (linha ~564)
   - `status` (linha ~602)
   - `term_type` (linha ~643)
   - `billing_provider` (linha ~728)
   - `payment_preference` (linha ~751)
   - `adjustment_index` (linha ~894)

### Resultado

- A página de criação de contratos para de crashar
- O seletor de clientes ganha busca/autocomplete
- Todos os Select estáticos funcionam sem conflito de portals
- O fluxo completo de criação fica funcional para testes

### Arquivo

| Arquivo | Mudança |
|---|---|
| `src/components/contracts/ContractForm.tsx` | Converter cliente para Combobox, adicionar `modal={false}` nos demais SelectContent |

