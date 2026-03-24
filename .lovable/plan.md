

# Implementação: Cards de Status Clicáveis + Teste de Push

## Parte 1: Cards de Status Clicáveis

### Arquivo 1: `src/components/tickets/TicketStatsBar.tsx`

- Adicionar props `onFilterChange?: (filter: string) => void` e `activeFilter?: string`
- Passar `onClick` para cada `StatCard` com o filtro correspondente:
  - Abertos → `"open"`, Em Andamento → `"in_progress"`, Aguardando → `"waiting"`, Pausados → `"paused"`, Sem Técnico → `"unassigned"`, Resolvidos → `"resolved"`
- Toggle: clicar no card ativo reseta para `"active"` (filtro padrão)
- Destaque visual: adicionar `ring-2 ring-primary` no card ativo
- Adicionar prop `isActive` ao `StatCard` para controlar o estilo

### Arquivo 2: `src/pages/tickets/TicketsPage.tsx` (linha 393)

Substituir `<TicketStatsBar />` por:

```tsx
<TicketStatsBar
  activeFilter={technicianFilter === "unassigned" ? "unassigned" : statusFilter}
  onFilterChange={(filter) => {
    handleResetPagination();
    if (filter === "unassigned") {
      setStatusFilter("active");
      setTechnicianFilter("unassigned");
    } else {
      setTechnicianFilter("all");
      setStatusFilter(filter);
    }
  }}
/>
```

## Parte 2: Teste de Push Notifications

Após implementar os cards, testarei as push notifications verificando:
- Se o botão "Ativar Push" aparece na página de perfil (não trava mais em loading)
- Se o fluxo de inscrição funciona

## Arquivos alterados
- `src/components/tickets/TicketStatsBar.tsx`
- `src/pages/tickets/TicketsPage.tsx`

