

# Correção: Contagem de Tempo e Timezone do Sistema

## Problemas Identificados

### 1. SLA Calculator ignora timezone
O `sla-calculator.ts` recebe `businessHours.timezone` mas **nunca o utiliza**. Todas as operações usam `date-fns` com `Date` local do navegador. Se o navegador estiver em timezone diferente de "America/Sao_Paulo", os cálculos de turnos ficam incorretos.

### 2. Tempo de Atendimento não conta desde a abertura
No `TicketResolveDialog`, linha 121: `const startRef = firstResponseAt || ticketCreatedAt`. Se `firstResponseAt` existir, conta a partir da primeira resposta e não da abertura. Se o técnico clicou "Iniciar" e isso preencheu `first_response_at`, o tempo ignora o período entre a criação e o início do atendimento. O correto é **sempre contar desde `ticketCreatedAt`** para tempo total de atendimento.

### 3. "Tempo Faturável" desnecessário
O usuário disse que tempo faturável não é necessário. Os seguintes elementos precisam ser removidos:
- `TicketTimeTracker`: remover exibição de "Faturável" no header, o Switch "Faturável" no dialog manual, e o ícone `$` na tabela
- `TicketResolveDialog`: remover linha "Faturável" do card de resumo e o Switch "Faturável" do tempo extra

### 4. Cronômetro não persiste entre navegações
O stopwatch usa `useState` local — se o técnico sai da página e volta, perde o tempo. Isso não será corrigido agora (escopo futuro), mas é relevante.

## Plano de Correção

### 1. Corrigir `sla-calculator.ts` para respeitar timezone
- Usar `date-fns` com conversão explícita para "America/Sao_Paulo"
- Como `date-fns` não suporta timezones nativamente, usar uma abordagem de offset manual ou instalar `date-fns-tz` (já que o projeto não tem)
- Alternativa pragmática: como o sistema opera exclusivamente em "America/Sao_Paulo", normalizar as datas para esse fuso antes de calcular turnos

### 2. Corrigir `TicketResolveDialog` — contar desde abertura
- Alterar `startRef` para sempre usar `ticketCreatedAt` (não `firstResponseAt`)
- Renomear label de "Tempo de Atendimento" para "Tempo Total (abertura → agora)"

### 3. Remover elementos de "Faturável"
**`TicketTimeTracker.tsx`:**
- Remover exibição `billableMinutes` no header
- Remover Switch "Faturável" do dialog manual (manter `is_billable: true` como default silencioso)
- Remover ícone `DollarSign` da tabela de entries

**`TicketResolveDialog.tsx`:**
- Remover linha "Faturável" do card de resumo de tempo
- Remover Switch "Faturável" do campo de tempo extra

### 4. Ajustar timezone padrão do sistema
- Garantir que `company_settings.business_hours.timezone` seja "America/Sao_Paulo"
- No `sla-calculator.ts`, usar o timezone configurado para calcular corretamente os limites de turnos

## Arquivos modificados

| Arquivo | Ação |
|---|---|
| `src/lib/sla-calculator.ts` | Respeitar timezone "America/Sao_Paulo" nos cálculos |
| `src/components/tickets/TicketResolveDialog.tsx` | Contar desde abertura, remover "faturável" |
| `src/components/tickets/TicketTimeTracker.tsx` | Remover UI de "faturável" |

