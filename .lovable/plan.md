

## Diagnóstico: Crash na página de Novo Contrato

### Problema encontrado

A página `/contracts/new` crasha imediatamente ao carregar, exibindo "Erro ao carregar esta página".

**Causa raiz:** O componente `Select` do Radix UI em `ContractServicesSection.tsx` recebe `value=""` (string vazia) no estado inicial de `selectedServiceId`. O Radix Select interpreta string vazia como um valor válido e tenta renderizar um `<SelectBubbleInput>` para ele, mas como não existe nenhum `<SelectItem>` com `value=""`, isso causa um crash no DOM (`removeChild` error).

### Correção

**Arquivo:** `src/components/contracts/ContractServicesSection.tsx`

1. Mudar o estado `selectedServiceId` de `""` para `undefined`
2. Atualizar o `Select` para passar `value={selectedServiceId || ""}` e no `onValueChange` tratar o reset corretamente
3. Alternativa mais simples e robusta: manter `""` mas passar `value={selectedServiceId || undefined}` ao `Select`, e no reset setar `""` internamente mas converter para `undefined` na prop

A correção mais limpa:
- `const [selectedServiceId, setSelectedServiceId] = useState<string>("")` fica como está
- No `<Select>`: trocar `value={selectedServiceId}` para `value={selectedServiceId || undefined}`
- No reset após adicionar: `setSelectedServiceId("")` fica como está (internamente é "", mas o Select recebe `undefined`)

### Arquivos a editar

- `src/components/contracts/ContractServicesSection.tsx` — corrigir prop `value` do `Select`

