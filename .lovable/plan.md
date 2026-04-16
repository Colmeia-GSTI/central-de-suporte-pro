

# Plan: Extract Filters + Type Filter + Stats Counters + Details Badge

## Summary

5 corrections: (1) extract inline filters to `TicketFilters.tsx`, (2) add type filter with query integration, (3) add internal/task counters to `TicketStatsBar`, (4) add `typeFilter` to queryKey, (5) add `TicketTypeBadge` to `TicketDetails` and `TicketsKanbanView`.

## Changes

### 1. New file: `src/components/tickets/TicketFilters.tsx`

Extract lines 510-597 (expandable filter bar) from `TicketsPage.tsx` into a standalone component. Props:

```ts
interface TicketFiltersProps {
  statusFilter: string;
  priorityFilter: string;
  technicianFilter: string;
  clientFilter: string;
  typeFilter: string;
  onStatusChange: (v: string) => void;
  onPriorityChange: (v: string) => void;
  onTechnicianChange: (v: string) => void;
  onClientChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onSearchChange: (v: string) => void;
  clients: { id: string; name: string }[];
  onClearAll: () => void;
  onSaveView: () => void;
  activeFilterCount: number;
}
```

- Use `useTechnicianList()` internally instead of receiving technicians as prop (consolidation with existing hook).
- Add a type filter Select: Todos os tipos / Externos / Internos / Tarefas.
- Move the mobile status Select, priority, technician, client, clear button, and save view button here.

### 2. `src/pages/tickets/TicketsPage.tsx`

- Add `typeFilter` state: `useState("all")`.
- Replace inline filter block (lines 510-597) with `<TicketFilters ... />`.
- Remove `staffMembers` query (lines 164-177) — now internal to `TicketFilters` via `useTechnicianList()`.
- Add `typeFilter` to the queryKey (line 203).
- Add type filter logic in the query function after `clientFilter` (line 238):
  ```ts
  if (typeFilter === "external") query = query.eq("is_internal", false);
  else if (typeFilter === "internal") query = query.eq("is_internal", true).eq("origin", "internal");
  else if (typeFilter === "task") query = query.eq("is_internal", true).eq("origin", "task");
  ```
- Add `typeFilter` to the `useEffect` dependency that resets pagination (line 362).
- Update `clearAllFilters` to also reset `typeFilter`.
- Update `activeFilterCount` to include `typeFilter !== "all"`.
- Keep `staffMembers` for bulk assign dropdown — but switch it to `useTechnicianList()` to consolidate the duplicate query.

### 3. `src/components/tickets/TicketStatsBar.tsx`

- Add 2 new head queries for internal and task counts (parallel with existing):
  ```ts
  supabase.from("tickets").select("id", { count: "exact", head: true })
    .eq("is_internal", true).eq("origin", "internal")
    .not("status", "in", '("resolved","closed")'),
  supabase.from("tickets").select("id", { count: "exact", head: true })
    .eq("is_internal", true).eq("origin", "task")
    .not("status", "in", '("resolved","closed")'),
  ```
- Add `onTypeFilterChange?: (type: string) => void` prop.
- Render a secondary row below existing cards (only if internal + task > 0) with two clickable badges using `TicketTypeBadge` styling.

### 4. `src/components/tickets/TicketDetails.tsx`

- Import `TicketTypeBadge`.
- Add badge next to `#{ticket.ticket_number}` (line 72):
  ```tsx
  <TicketTypeBadge isInternal={ticket.is_internal} origin={ticket.origin} />
  ```

### 5. `src/components/tickets/TicketsKanbanView.tsx`

- Import `TicketTypeBadge`.
- Add badge next to ticket number in the card (line 127):
  ```tsx
  <TicketTypeBadge isInternal={ticket.is_internal} origin={ticket.origin} />
  ```

## Files

| File | Action |
|------|--------|
| `src/components/tickets/TicketFilters.tsx` | Create |
| `src/pages/tickets/TicketsPage.tsx` | Edit: add typeFilter, replace inline filters, consolidate staffMembers |
| `src/components/tickets/TicketStatsBar.tsx` | Edit: add internal/task counters |
| `src/components/tickets/TicketDetails.tsx` | Edit: add TicketTypeBadge |
| `src/components/tickets/TicketsKanbanView.tsx` | Edit: add TicketTypeBadge |

No migrations. No new hooks. 1 new file, 4 edited.

