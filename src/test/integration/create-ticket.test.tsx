import { describe, it, expect } from "vitest";
import { buildTicketPayload } from "@/lib/ticket-payload";
import { makeTicketFormData } from "@/test/helpers/factories";

describe("Create ticket flow (buildTicketPayload)", () => {
  it("happy path: external ticket maps form data to insert payload", () => {
    const payload = buildTicketPayload({
      data: makeTicketFormData(),
      ticketType: "external",
      userId: "user-1",
    });

    expect(payload).toMatchObject({
      title: "Impressora não imprime",
      client_id: "client-1",
      requester_contact_id: "contact-1",
      priority: "medium",
      origin: "portal",
      created_by: "user-1",
      status: "open",
      is_internal: false,
      first_response_at: null,
    });
    expect(payload.sla_deadline).toBeUndefined();
  });

  it("input error: empty assigned_to keeps status as open and no first_response_at", () => {
    const payload = buildTicketPayload({
      data: makeTicketFormData({ assigned_to: "" }),
      ticketType: "external",
      userId: "user-1",
    });
    expect(payload.status).toBe("open");
    expect(payload.assigned_to).toBeNull();
    expect(payload.first_response_at).toBeNull();
  });

  it("edge case: task ticket nullifies client/contact and forces origin/internal flags", () => {
    const payload = buildTicketPayload({
      data: makeTicketFormData({
        client_id: "client-1",
        requester_contact_id: "contact-1",
        assigned_to: "tech-1",
      }),
      ticketType: "task",
      userId: "user-7",
    });

    expect(payload.client_id).toBeNull();
    expect(payload.requester_contact_id).toBeNull();
    expect(payload.origin).toBe("task");
    expect(payload.is_internal).toBe(true);
    expect(payload.sla_deadline).toBeNull();
    expect(payload.status).toBe("in_progress");
    expect(payload.first_response_at).not.toBeNull();
  });
});
