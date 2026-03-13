

# Revisao E2E da Contagem de Tempo de Atendimento

## Problemas Identificados

### 1. CRITICO: `handleStatusChange` bypassa o controle de sessoes
Em `TicketDetailsTab.tsx` (linha 353), quando o status e alterado via dropdown (ex: paused -> in_progress, open -> in_progress), **nenhuma sessao de atendimento e criada/fechada** e **nenhuma pausa e registrada/encerrada**. Isso causa desincronizacao total do timer com a realidade.

### 2. CRITICO: Dois sistemas de tempo independentes e conflitantes
- `TicketAttendancePanel` usa `ticket_attendance_sessions` (automatico)
- `TicketTimeTracker` usa `ticket_time_entries` (manual/cronometro)
- `TicketResolveDialog` mostra tempo de `ticket_time_entries` mas ignora `ticket_attendance_sessions`

O usuario ve tempos diferentes dependendo de onde olha.

### 3. Timer continua contando apos resolucao em edge cases
Quando `resolvedAt` e definido mas a sessao nao foi fechada corretamente (ex: via handleStatusChange), `calcWorkedTimeMs` usa `now` como fallback para sessoes abertas, inflando o tempo.

### 4. Imports nao utilizados
`useState, useEffect` importados em `TicketAttendancePanel` mas nao usados.

---

## Plano de Correcao

### Tarefa 1: Unificar status changes com gestao de sessoes

**Arquivo: `src/components/tickets/TicketDetailsTab.tsx`**

Refatorar `handleStatusChange` para:
- Se transicao para `in_progress`: criar sessao em `ticket_attendance_sessions`, fechar pausa ativa, setar `started_at`/`first_response_at` se primeiro inicio
- Se transicao para `paused`/`waiting_third_party`/`no_contact`: fechar sessao ativa, criar registro de pausa
- Se transicao para `resolved`/`closed`: fechar sessao ativa, setar `resolved_at`

### Tarefa 2: Unificar exibicao de tempo no ResolveDialog

**Arquivo: `src/components/tickets/TicketResolveDialog.tsx`**

Substituir a query de `ticket_time_entries` por `ticket_attendance_sessions` para mostrar o tempo trabalhado real (consistente com o painel). Manter `ticket_time_entries` apenas como "tempo extra manual".

### Tarefa 3: Proteger calculos contra sessoes orfas

**Arquivo: `src/lib/attendance-time.ts`**

Em `calcWorkedTimeMs`, quando `data.resolved_at` existe, usar `resolved_at` como cap maximo para sessoes abertas em vez de `now`. Isso evita inflacao de tempo em tickets ja encerrados.

```typescript
export function calcWorkedTimeMs(data: AttendanceData, now: Date = new Date()): number {
  const cap = data.resolved_at ? new Date(data.resolved_at).getTime() : now.getTime();
  let total = 0;
  for (const s of data.sessions) {
    const start = new Date(s.started_at).getTime();
    const end = s.ended_at ? Math.min(new Date(s.ended_at).getTime(), cap) : cap;
    total += Math.max(0, end - start);
  }
  return total;
}
```

Mesma logica para `calcPausedTimeMs`.

### Tarefa 4: Limpar imports e codigo morto

**Arquivo: `src/components/tickets/TicketAttendancePanel.tsx`**
- Remover `useState, useEffect` dos imports (nao usados)

### Tarefa 5: Garantir invalidacao consistente

Adicionar invalidacao de `ticket-attendance-sessions` e `ticket-attendance-pauses` em `handleStatusChange` apos mutacao.

---

## Resumo das Mudancas

| Arquivo | Mudanca |
|---|---|
| `TicketDetailsTab.tsx` | Integrar gestao de sessoes/pausas no `handleStatusChange` |
| `TicketResolveDialog.tsx` | Mostrar tempo de `attendance_sessions` em vez de `time_entries` |
| `attendance-time.ts` | Cap `resolved_at` em calculos para evitar inflacao |
| `TicketAttendancePanel.tsx` | Limpar imports nao utilizados |

