
# Filtro de Periodo na Listagem de Faturas

## Objetivo
Adicionar filtro de periodo temporal na aba de Faturas do Faturamento, com padrao "Mes Atual" e opcoes rapidas de 30/60/90 dias, alem de periodo personalizado e filtro de inadimplencia.

## Alteracoes

### Arquivo: `src/components/billing/BillingInvoicesTab.tsx`

**1. Novo estado de periodo**
- Adicionar estado `dateRange` com tipo `{ from: Date; to: Date }`, inicializado com primeiro e ultimo dia do mes atual
- Adicionar estado `periodPreset` com valores: `"month" | "30" | "60" | "90" | "custom"`
- Importar `startOfMonth`, `endOfMonth`, `subDays` de `date-fns`

**2. Barra de filtros de periodo (novo componente inline)**
- Renderizar entre o header de busca e os summary chips
- Layout: grupo de botoes compactos (chips/toggle) lado a lado:
  - `Mes Atual` (default, selecionado)
  - `30 dias`
  - `60 dias`
  - `90 dias`
  - `Personalizado` (abre dois date pickers inline: "De" e "Ate")
  - Separador visual + chip `Inadimplentes` (toggle que filtra `status = overdue`)
- No mobile: scroll horizontal com `overflow-x-auto`

**3. Aplicar filtro na query Supabase**
- Adicionar `.gte("due_date", formatISO(from))` e `.lte("due_date", formatISO(to))` na query existente
- Incluir `from` e `to` na `queryKey`: `["invoices", statusFilter, fromISO, toISO]`
- Resetar `currentPage` para 1 ao trocar periodo

**4. Logica dos presets**
- `month`: `startOfMonth(new Date())` ate `endOfMonth(new Date())`
- `30`: `subDays(new Date(), 30)` ate `new Date()`
- `60`: `subDays(new Date(), 60)` ate `new Date()`
- `90`: `subDays(new Date(), 90)` ate `new Date()`
- `custom`: usuario escolhe datas via dois inputs `type="date"` ou Popover+Calendar
- `Inadimplentes`: seta `statusFilter = "overdue"` e usa preset atual

**5. Recalcular totais (summary chips)**
- Os totais ja sao calculados sobre `invoices` (dados filtrados pela query), entao ajustarao automaticamente ao periodo

## Layout Visual

```text
[Busca...]  [Status: v]  [Limpar]           [Atualizar] [Inadimp.] [+ Nova Fatura]
[Mes Atual] [30d] [60d] [90d] [Personalizado |  De: ___  Ate: ___ ]
[A Receber: R$...]  [Vencido: R$...]  [Recebido: R$...]
```

- Botoes de periodo usam `variant="outline"` com `variant="default"` (primary) quando ativo
- Compacto: `h-8 text-xs` para nao ocupar espaco vertical excessivo
- No mobile os botoes de periodo ficam em linha com scroll horizontal

## Detalhes Tecnicos

| Aspecto | Decisao |
|---|---|
| Filtro de data | Aplicado no `.gte()/.lte()` da query Supabase (server-side) |
| Performance | Reduz volume de dados trafegados vs filtrar no frontend |
| Cache | Query key inclui datas, cache separado por periodo |
| Inadimplencia | Reutiliza o `statusFilter = "overdue"` existente |
| Date picker custom | Usa Popover + Calendar do Shadcn (ja disponivel no projeto) |
| Formato de data | ISO `YYYY-MM-DD` para compatibilidade com Supabase |

## Arquivo modificado

| Arquivo | Alteracao |
|---|---|
| `src/components/billing/BillingInvoicesTab.tsx` | Adicionar estados de periodo, barra de presets, filtro na query, e logica de inadimplencia |
