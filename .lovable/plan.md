

# Fix: Ticket não atualiza ao vivo após "Iniciar Atendimento"

## Diagnóstico Completo

O problema raiz é que `selectedTicket` em `TicketsPage.tsx` é um **snapshot estático** (`useState`). Quando `startAttendance` ou qualquer ação muda o status no banco, `invalidateQueries(["tickets"])` atualiza a lista, mas o `selectedTicket` no Sheet permanece congelado com os dados antigos.

### Componentes afetados e como serão impactados pela correção

| Componente | Dado afetado | Situação atual | Após correção |
|---|---|---|---|
| **TicketDetails** (header) | `ticket.status` → Badge de status | Fica "Aberto" mesmo após iniciar | Atualiza para "Em Andamento" em tempo real |
| **TicketAttendancePanel** | `status` prop → Timer + Botões | Timer não inicia, botão "Iniciar" persiste | Timer inicia, botões mudam para Pausar/Resolver |
| **useTicketAttendance** (hook) | `status` → `isRunning` (tick a cada 1s) | `isRunning = false` (status ainda "open") | `isRunning = true`, cronômetro começa |
| **SLAIndicator** | `first_response_at` | Continua mostrando "sem resposta" | Reflete a primeira resposta |
| **TicketDetailsTab** | `ticket.assigned_to`, `status` | Campos desatualizados | Dados frescos |
| **TicketHistoryTab** | Query própria por `ticketId` | Já funciona (query independente) | Mantém funcionando |
| **TicketCommentsTab** | Query própria por `ticketId` | Já funciona | Mantém funcionando |
| **TicketPauseDialog** | `ticketId` (apenas ID) | OK — usa apenas ID | Sem impacto |
| **TicketResolveDialog** | Props estáticos (`ticketNumber`, `currentStatus`, `ticketStartedAt`) | `currentStatus` fica desatualizado | Atualiza com dados frescos |
| **TicketTransferDialog** | `ticketId`, `currentAssignedTo` | `currentAssignedTo` desatualizado | Atualiza |
| **TicketRatingDialog** | `ticketId`, `ticketNumber`, `ticketTitle` | OK — dados que não mudam | Sem impacto |
| **startTicketMutation** (TicketsPage) | Cria sessão + atualiza ticket | Duplica sessão (não fecha anteriores) | Fechar sessões antes de abrir nova |

## Plano de Correção

### 1. `TicketsPage.tsx` — selectedTicket reativo

Substituir o estado estático por derivação reativa:

```typescript
// Antes
const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null);

// Depois
const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

// Query individual como fallback
const { data: freshTicket } = useQuery({
  queryKey: ["ticket-detail", selectedTicketId],
  queryFn: /* fetch ticket by ID with relations */,
  enabled: !!selectedTicketId,
});

// Derivar de dados frescos
const selectedTicket = useMemo(() => {
  if (!selectedTicketId) return null;
  return tickets.find(t => t.id === selectedTicketId) ?? freshTicket ?? null;
}, [selectedTicketId, tickets, freshTicket]);
```

Atualizar **todas as 8 referências** a `setSelectedTicket`:
- `handleViewTicket` → `setSelectedTicketId(ticket.id)`
- `startTicketMutation.onSuccess` → remover o spread manual, apenas `setSelectedTicketId(ticketId)` (dados virão da query)
- `Sheet onOpenChange` → `setSelectedTicketId(null)`
- `TicketDetails onClose` → `setSelectedTicketId(null)`
- `TicketRatingDialog onSuccess` → `setSelectedTicketId(null)`

### 2. `TicketsPage.tsx` — startTicketMutation: fechar sessões órfãs

Adicionar fechamento de sessões abertas antes de criar nova (mesmo padrão que `useTicketAttendance.ts`):

```typescript
// Antes de inserir nova sessão:
await supabase
  .from("ticket_attendance_sessions")
  .update({ ended_at: nowIso })
  .eq("ticket_id", ticketId)
  .is("ended_at", null);
```

### 3. `useTicketAttendance.ts` — invalidar `ticket-detail`

Adicionar na função `invalidateAll`:
```typescript
queryClient.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
```

### 4. Dialogs que usam props do selectedTicket

Como `selectedTicket` agora será derivado reativamente, os props passados para `TicketResolveDialog` (`currentStatus`, `ticketStartedAt`) e `TicketTransferDialog` (`currentAssignedTo`) serão automaticamente atualizados.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/pages/tickets/TicketsPage.tsx` | Substituir `selectedTicket` state por `selectedTicketId` + query reativa; fechar sessões órfãs no `startTicketMutation` |
| `src/hooks/useTicketAttendance.ts` | Adicionar invalidação de `ticket-detail` |

