

# Plan: Ticket Creation Notification + Push Integration + Error Boundary

## Summary

Three corrections: (1) fire-and-forget notification on ticket creation, (2) push notification integration in the ticket notification Edge Function, (3) ErrorBoundary wrapper on NewTicketPage.

## Audit Findings

- **Zod schema**: Already includes `"internal"` and `"task"` — no fix needed.
- **VAPID keys**: Frontend and backend both use `BDQ4g_RaLdz1m7aQEEezyJ8OGEdpBMXqY9q3iKE0gHr3Q9mIPhNQ3NqzV8xzuPfRDKxT_G8kHy9sXB7CvKP_RvU`. Match confirmed.
- **push_subscriptions**: 2 records exist (2 users).
- **application_logs**: Zero push-related log entries — push has never been triggered from ticket flow.
- **sw-push.js**: Has `push`, `notificationclick`, and `notificationclose` handlers. The `notificationclick` handler already navigates to `event.notification.data?.url`. No fix needed.
- **usePushNotifications**: Used in `NotificationSettings.tsx` (profile page) — not auto-registered at root. This is by design (opt-in).
- **ErrorBoundary**: Already exists at `src/components/ErrorBoundary.tsx`.
- **send-push-notification**: Accepts `{ type, user_ids, role_filter, data: { title, body, url, tag } }`. Has built-in `role_filter` support — no need to manually query `user_roles`.

## Changes

### 1. `src/components/tickets/TicketForm.tsx` — Add fire-and-forget notification

After tag assignments (line 252), add:

```ts
// Fire-and-forget — não bloquear criação do chamado
supabase.functions.invoke("send-ticket-notification", {
  body: { ticket_id: newTicket.id, event_type: "created" }
}).catch(err =>
  logger.warn("Failed to send creation notification", "Tickets", { error: err?.message })
);
```

No `await`. No try/catch propagation. Internal tickets already guarded in the Edge Function.

### 2. `supabase/functions/send-ticket-notification/index.ts` — Add push to staff

After the Telegram block (around line 228), before the `return` response, add push notification dispatch:

```ts
// Push notification to staff
try {
  await supabase.functions.invoke("send-push-notification", {
    body: {
      type: "ticket",
      role_filter: ["admin", "manager", "technician"],
      data: {
        title: `Chamado #${ticket.ticket_number}`,
        body: eventMessages[event_type],
        url: `/tickets?open=${ticket_id}`,
        tag: `ticket-${ticket_id}`,
      }
    }
  });
} catch (pushErr) {
  console.error("[ticket-notification] Push error:", pushErr);
}
```

Uses `role_filter` (already supported by `send-push-notification`) instead of manually querying `user_roles`. URL uses deep-linking pattern (`?open=id`).

### 3. `src/pages/tickets/NewTicketPage.tsx` — Wrap with ErrorBoundary

Import existing `ErrorBoundary` and wrap `TicketForm` with a fallback:

```tsx
<ErrorBoundary fallback={
  <div className="text-center py-12 space-y-4">
    <p className="text-muted-foreground">Erro ao carregar o formulário.</p>
    <Button variant="outline" onClick={() => window.location.reload()}>Recarregar</Button>
  </div>
}>
  <TicketForm ... />
</ErrorBoundary>
```

## Files Modified

| File | Action |
|------|--------|
| `src/components/tickets/TicketForm.tsx` | Add fire-and-forget notification call |
| `supabase/functions/send-ticket-notification/index.ts` | Add push notification to staff |
| `src/pages/tickets/NewTicketPage.tsx` | Wrap TicketForm with ErrorBoundary |

No migrations. No new files. 3 files touched.

## Diagnostic Report (to be included in final message)

1. Push infra is fully wired (SW, hook, Edge Function, VAPID keys match, DB table populated)
2. Push was never triggered from ticket flow — this plan adds that integration
3. push_subscriptions has 2 records (2 distinct users)

