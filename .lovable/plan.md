

## Plano: Painel de Contadores na Listagem de Contratos

### O que será feito

Adicionar um painel com 2 cards de estatísticas entre o campo de busca e a tabela, mostrando:

1. **Contratos Ativos** — contagem de contratos com `status = 'active'`
2. **Receita Mensal Total** — soma do `monthly_value` de todos os contratos ativos

### Visual

```text
┌──────────────────────┐  ┌──────────────────────┐
│ 📄 Contratos Ativos  │  │ 💰 Receita Mensal    │
│        12            │  │    R$ 24.500,00       │
└──────────────────────┘  └──────────────────────┘
```

### Alterações em `src/pages/contracts/ContractsPage.tsx`

1. **Calcular os contadores a partir dos dados já carregados** (`contracts`), sem query adicional:
   - `activeCount = contracts.filter(c => c.status === 'active').length`
   - `totalMonthly = contracts.filter(c => c.status === 'active').reduce(sum de monthly_value)`

2. **Renderizar 2 cards** usando `Card` + ícones (`FileText`, `DollarSign`) no estilo consistente com o `AnimatedStatCard` do Dashboard, posicionados entre a busca e a tabela em um grid `grid-cols-2`.

3. **Loading state**: Exibir `Skeleton` nos cards enquanto `isLoading` for `true`.

### Arquivo

| Arquivo | Mudança |
|---|---|
| `src/pages/contracts/ContractsPage.tsx` | Adicionar grid de 2 stat cards entre busca e tabela |

