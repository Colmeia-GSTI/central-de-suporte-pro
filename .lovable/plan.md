

# Causa Raiz e Correções do Contador de Tempo

## Causa Raiz Identificada

O ticket #4 está `in_progress` com `started_at` definido, mas a tabela `ticket_attendance_sessions` está **completamente vazia** (0 registros). Isso significa que o insert na linha 384-386 do `handleStatusChange` falhou silenciosamente — o retorno `{ error }` do Supabase não é verificado, então o erro foi ignorado enquanto o ticket mudou de status normalmente.

Consequências visíveis no screenshot:
- Timer principal: **00:00:00** (sem sessões para calcular)
- Sessões: **0**
- Trabalhado: **< 1min** (formatTimeFriendly(0) retorna "< 1min" — enganoso)
- Pausado: **< 1min** (mesmo problema — mostra "< 1min" quando deveria ser "0")

## Correções

### 1. Fallback resiliente em `calcWorkedTimeMs` (`attendance-time.ts`)
Quando não há sessões mas `started_at` existe (dados legados ou insert falho), usar `started_at` como sessão virtual. Isso garante que o timer nunca fique zerado em ticket ativo.

### 2. Corrigir `formatTimeFriendly` para 0ms
Retornar `"0min"` em vez de `"< 1min"` quando o valor é exatamente 0. Só mostrar "< 1min" quando há tempo > 0 mas < 60s.

### 3. Verificar erros nos inserts de sessão (`TicketDetailsTab.tsx`)
Adicionar `{ error }` check nos awaits de insert/update de sessões e pausas no `handleStatusChange`. Throw em caso de erro para que o catch reverta o status.

### 4. Mesmo fix no `useTicketAttendance.ts`
Já tem error checking, está ok. Mas o insert na mutation de start não faz `select()` — sem impacto, mas vou manter.

## Arquivos Alterados

| Arquivo | Mudança |
|---|---|
| `src/lib/attendance-time.ts` | Fallback `started_at` em `calcWorkedTimeMs`; fix `formatTimeFriendly(0)` |
| `src/components/tickets/TicketDetailsTab.tsx` | Error checking nos inserts de sessão/pausa |

