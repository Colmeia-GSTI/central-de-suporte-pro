

## Plano: Substituir Select por Combobox com busca no seletor de serviços

### Problema

O seletor de serviços em `ContractServicesSection.tsx` usa um `Select` do Radix que não suporta busca, filtragem ou rolagem fluida com muitos itens. Também causa o bug `removeChild` do React 18 + Radix portals.

### Solução

Substituir o `Select` por um **Combobox** usando `Popover` + `Command` (cmdk) — o mesmo padrão já usado em `NfseServiceCodeCombobox.tsx`.

### Mudanças em `src/components/contracts/ContractServicesSection.tsx`

1. **Remover** imports de `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
2. **Adicionar** imports de `Popover`, `PopoverContent`, `PopoverTrigger`, `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, e ícones `Check`, `ChevronsUpDown`
3. **Adicionar** estado `popoverOpen` para controlar abertura do combobox
4. **Substituir** o bloco do `Select` (linhas 286-301) por um Combobox com:
   - `CommandInput` com placeholder "Buscar serviço..."
   - `CommandList` com `max-h-[200px]` para rolagem fluida
   - `CommandEmpty` com mensagem "Nenhum serviço encontrado"
   - Cada `CommandItem` usando `value={service.name}` para matching por texto (busca parcial nativa do cmdk)
   - Ícone `Check` para o item selecionado
   - Ao selecionar, setar `selectedServiceId` e `unitValue`, fechar popover
5. O botão trigger mostra o nome do serviço selecionado ou placeholder

### Benefícios

- **Busca**: digitação filtra em tempo real (nativo do cmdk)
- **Rolagem**: `CommandList` com overflow scroll
- **Match parcial**: cmdk faz fuzzy match por padrão
- **Sem bug**: Popover+Command não tem o bug `removeChild` do Select portals
- **Consistência**: mesmo padrão usado no combobox de códigos NFS-e

### Arquivo

| Arquivo | Mudança |
|---|---|
| `src/components/contracts/ContractServicesSection.tsx` | Trocar Select por Popover+Command combobox |

