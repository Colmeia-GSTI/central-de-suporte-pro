/**
 * Pure builder for the ticket insert payload.
 *
 * Extracted from `src/components/tickets/TicketForm.tsx` to make
 * the payload-shape logic unit-testable without rendering the form.
 *
 * All branching about `ticketType` (external | internal | task)
 * lives here so tests can lock down the matrix of overrides.
 */

import type { Enums } from "@/integrations/supabase/types";

export type TicketType = "external" | "internal" | "task";

export interface BuildTicketPayloadInput {
  data: {
    title: string;
    description: string;
    client_id?: string;
    requester_contact_id?: string;
    category_id?: string;
    subcategory_id?: string;
    priority: "low" | "medium" | "high" | "critical";
    origin: "portal" | "phone" | "email" | "chat" | "whatsapp" | "internal" | "task";
    assigned_to?: string;
  };
  ticketType: TicketType;
  userId: string | undefined;
}

export interface TicketInsertPayload {
  title: string;
  description: string;
  client_id: string | null;
  requester_contact_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  priority: Enums<"ticket_priority">;
  origin: Enums<"ticket_origin">;
  assigned_to: string | null;
  created_by: string | undefined;
  status: Enums<"ticket_status">;
  first_response_at: string | null;
  is_internal: boolean;
  sla_deadline: null | undefined;
}

export function buildTicketPayload({
  data,
  ticketType,
  userId,
}: BuildTicketPayloadInput): TicketInsertPayload {
  const isInternal = ticketType !== "external";

  const origin = (
    ticketType === "internal"
      ? "internal"
      : ticketType === "task"
      ? "task"
      : data.origin
  ) as Enums<"ticket_origin">;

  return {
    title: data.title,
    description: data.description,
    client_id: ticketType === "task" ? null : data.client_id || null,
    requester_contact_id:
      ticketType === "task" ? null : data.requester_contact_id || null,
    category_id: data.category_id || null,
    subcategory_id: data.subcategory_id || null,
    priority: data.priority as Enums<"ticket_priority">,
    origin,
    assigned_to: data.assigned_to || null,
    created_by: userId,
    status: (data.assigned_to ? "in_progress" : "open") as Enums<"ticket_status">,
    first_response_at: data.assigned_to ? new Date().toISOString() : null,
    is_internal: isInternal,
    sla_deadline: isInternal ? null : undefined,
  };
}
