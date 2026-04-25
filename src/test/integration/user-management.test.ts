import { describe, it, expect } from "vitest";
import { detectAnomalies, totalAnomalies } from "../../../supabase/functions/detect-auth-anomalies/logic";

// Minimal stub of SupabaseClient surface used by detectAnomalies
function makeStub(opts: {
  authUsers: Array<{ id: string; email: string | null; created_at: string; email_confirmed_at: string | null }>;
  profiles: Array<{ user_id: string; full_name: string | null; email: string | null }>;
  roles: Array<{ user_id: string }>;
}) {
  return {
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: opts.authUsers }, error: null }),
      },
    },
    from(table: string) {
      const dataset =
        table === "profiles" ? opts.profiles : table === "user_roles" ? opts.roles : [];
      return { select: async () => ({ data: dataset, error: null }) };
    },
  } as unknown as Parameters<typeof detectAnomalies>[0];
}

describe("detect-auth-anomalies logic", () => {
  it("returns zero anomalies when state is clean", async () => {
    const stub = makeStub({
      authUsers: [{ id: "u1", email: "a@x.com", created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString() }],
      profiles: [{ user_id: "u1", full_name: "A", email: "a@x.com" }],
      roles: [{ user_id: "u1" }],
    });
    const r = await detectAnomalies(stub);
    expect(totalAnomalies(r)).toBe(0);
  });

  it("detects orphans, zombies, unconfirmed and roleless", async () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const stub = makeStub({
      authUsers: [
        { id: "orphan", email: "o@x.com", created_at: old, email_confirmed_at: new Date().toISOString() },
        { id: "unconf", email: "u@x.com", created_at: old, email_confirmed_at: null },
        { id: "noRole", email: "n@x.com", created_at: old, email_confirmed_at: new Date().toISOString() },
      ],
      profiles: [
        { user_id: "unconf", full_name: null, email: "u@x.com" },
        { user_id: "noRole", full_name: null, email: "n@x.com" },
        { user_id: "zombie", full_name: "Z", email: "z@x.com" },
      ],
      roles: [{ user_id: "unconf" }],
    });
    const r = await detectAnomalies(stub);
    expect(r.orphans.map((o) => o.user_id)).toEqual(["orphan"]);
    expect(r.zombies.map((z) => z.user_id)).toEqual(["zombie"]);
    expect(r.unconfirmed_old.map((u) => u.user_id)).toEqual(["unconf"]);
    expect(r.roleless.map((u) => u.user_id)).toEqual(["noRole"]);
    expect(totalAnomalies(r)).toBe(4);
  });
});
