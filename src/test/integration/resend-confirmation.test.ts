import { describe, it, expect } from "vitest";
import {
  resendConfirmationHandler,
  validateEmailInput,
} from "../../../supabase/functions/resend-confirmation/logic";
import { createSupabaseMock } from "@/test/mocks/supabase";
import { makeUser } from "@/test/helpers/factories";

describe("resend-confirmation logic", () => {
  it("happy path: generates link and sends email for unconfirmed user", async () => {
    const { client, spies } = createSupabaseMock({
      listUsersResponse: {
        data: { users: [makeUser({ email: "new@test.com", email_confirmed_at: null })] },
        error: null,
      },
      generateLinkResponse: {
        data: { properties: { action_link: "https://x/confirm" } },
        error: null,
      },
      tables: {
        // message_logs head:true count
        message_logs: { data: null, error: null },
      },
      functions: {
        "send-email-resend": { data: { success: true }, error: null },
      },
    });

    // Patch the count branch — our generic mock returns { data, error }, but
    // the handler reads `.count`. Augment by spying on the from() return.
    (client as unknown as { from: (t: string) => unknown }).from = ((table: string) => {
      const base = {
        select: () => base,
        eq: () => base,
        gte: () => base,
        then: (fn: (v: { count: number; error: null }) => unknown) =>
          Promise.resolve({ count: 0, error: null }).then(fn),
      };
      return base;
    }) as never;

    const res = await resendConfirmationHandler(client, "new@test.com");
    expect(res).toMatchObject({ ok: true, success: true });
    expect(spies.invokeCalls.find((c) => c.name === "send-email-resend")).toBeTruthy();
  });

  it("input error: rejects malformed email", () => {
    expect(validateEmailInput({ email: "not-an-email" })).toMatchObject({ ok: false });
    expect(validateEmailInput({})).toMatchObject({ ok: false });
    expect(validateEmailInput(null)).toMatchObject({ ok: false });
    expect(validateEmailInput({ email: "ok@test.com" })).toMatchObject({ ok: true });
  });

  it("edge case: returns already_confirmed when user is already verified", async () => {
    const { client } = createSupabaseMock({
      listUsersResponse: {
        data: {
          users: [
            makeUser({
              email: "done@test.com",
              email_confirmed_at: "2026-01-01T00:00:00Z",
            }),
          ],
        },
        error: null,
      },
    });

    const res = await resendConfirmationHandler(client, "done@test.com");
    expect(res).toMatchObject({
      ok: true,
      success: false,
      already_confirmed: true,
    });
  });
});
