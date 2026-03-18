

# Refatoração Completa: Sistema de Tempo do Chamado

## Problemas Identificados (End-to-End)

### 1. Triggers Duplicados — Histórico Duplicado
Existem **2 triggers** na tabela `tickets` chamando a mesma função `log_ticket_status_change()`:
- `trg_log_ticket_status_change` (com cláusula WHEN — correto)
- `trigger_log_ticket_status_change` (sem cláusula WHEN — dispara em QUALQUER update)

Resultado: cada mudança de status gera **2 registros** no histórico via trigger. Além disso, o código frontend (`useTicketAttendance`) faz um INSERT manual no histórico, gerando um **3o registro**. O ticket #5 tem 3 entradas de histórico para uma única ação.

### 2. Sessões Nunca Fechadas — Timer Inflacionado
O ticket #5 tem **2 sessões abertas** (ambas com `ended_at = null`). Isso acontece porque `startAttendance` no hook cria uma nova sessão sem fechar a anterior. O `calcWorkedTimeMs` soma todas as sessões abertas até `now`, então o tempo trabalhado é contado em dobro.

### 3. Colunas Erradas na Inserção de Pausa
Em `TicketDetailsTab.handleStatusChange` (linha 410-417), a inserção em `ticket_pauses` usa `reason` em vez de `pause_reason` e omite os campos obrigatórios `paused_by` e `pause_type`. Esse INSERT falha silenciosamente, e pausas nunca são registradas por essa via.

### 4. Timer Ticking Desnecessário
O hook `useTicketAttendance` faz tick a cada segundo quando `status === "paused"`. Mas sessões pausadas têm `ended_at` preenchido, então `workedMs` não muda — apenas `elapsedMs` cresce. Tick desnecessário.

### 5. TicketTimeTracker Desconectado
O componente `TicketTimeTracker` (cronômetro manual + entradas manuais em `ticket_time_entries`) não é usado em nenhuma página. Funcionalidade órfã.

### 6. UI Fragmentada
`TicketAttendancePanel` mostra timer automático + métricas, mas o cronômetro manual e entradas de tempo são componentes separados e desconectados.

## Plano de Correção

### Migração SQL
1. Dropar o trigger duplicado `trigger_log_ticket_status_change`
2. Fechar sessões órfãs existentes (data fix)

```sql
DROP TRIGGER IF EXISTS trigger_log_ticket_status_change ON public.tickets;

-- Fix orphan sessions: close all but the latest open session per ticket
WITH ranked AS (
  SELECT id, ticket_id,
    ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY started_at DESC) as rn
  FROM ticket_attendance_sessions
  WHERE ended_at IS NULL
)
UPDATE ticket_attendance_sessions s
SET ended_at = s.started_at
FROM ranked r
WHERE s.id = r.id AND r.rn > 1;
```

### useTicketAttendance.ts — Corrigir Lógica
1. **startMutation**: Fechar qualquer sessão aberta antes de abrir nova (prevenir duplicatas)
2. **Remover inserts manuais** em `ticket_history` — o trigger `trg_log_ticket_status_change` já cuida disso
3. **Timer tick**: Só tickar quando `status === "in_progress"` (não em paused)

### TicketDetailsTab.tsx — Corrigir Insert de Pausa
Corrigir o `handleStatusChange` para usar os campos corretos:
- `pause_reason` em vez de `reason`
- Adicionar `paused_by: user!.id`
- Adicionar `pause_type: 'manual'`
- Remover insert manual em `ticket_history` (trigger cuida)

### TicketAttendancePanel.tsx — Interface Unificada
Consolidar em uma única interface:
1. **Seção superior**: Status badge + timer principal (mantém)
2. **Seção de ações**: Botões de controle (mantém)
3. **Métricas compactas**: Grid 2x2 com Trabalhado, Pausado, Espera, Decorrido — remover contadores de Sessões/Pausas que não agregam valor ao usuário
4. **Integrar TicketTimeTracker**: Adicionar seção colapsável com cronômetro manual e lista de entradas de tempo (`ticket_time_entries`), consolidando tudo em um único painel
5. Adicionar tempo de espera (abertura → primeiro atendimento) no grid de métricas

### TicketDetails.tsx — Limpar
Importar e usar apenas o `TicketAttendancePanel` unificado (já é assim, mas garantir que `TicketTimeTracker` não seja referenciado).

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| Migração SQL | Drop trigger duplicado + fix sessões órfãs |
| `src/hooks/useTicketAttendance.ts` | Fechar sessão anterior, remover history manual, fix timer tick |
| `src/components/tickets/TicketDetailsTab.tsx` | Fix campos de pausa, remover history manual |
| `src/components/tickets/TicketAttendancePanel.tsx` | Integrar TicketTimeTracker, reorganizar métricas |
| `src/components/tickets/TicketTimeTracker.tsx` | Remover (funcionalidade migrada) |

