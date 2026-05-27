// FUNÇÃO TEMPORÁRIA — REMOVER APÓS SETUP DO HERMES BOT
import { adminClient, corsHeaders, jsonResponse, requireRole } from "../_shared/auth-helpers.ts";

const HERMES_EMAIL = "hermes@colmeiagsti.com.br";
const VAULT_SECRET_NAME = "HERMES_BOT_PASSWORD";

function generateStrongPassword(length = 40): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}<>?";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

async function resolveUserIdByEmail(admin: ReturnType<typeof adminClient>, email: string): Promise<string | null> {
  // Paginate through users until we find the one with matching email
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) return null;
    page++;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireRole(req.headers.get("Authorization"), ["admin"]);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error, required_roles: ["admin"] }, auth.status ?? 401);
    }

    const admin = adminClient();
    const password = generateStrongPassword(40);

    // 0) Insert a temporary pending invite to bypass the enforce_invite_on_signup trigger.
    //    The trigger raises "Cadastro público desabilitado" for any new auth user without a valid invite.
    const { error: inviteErr } = await admin.from("pending_invites").insert({
      email: HERMES_EMAIL,
      role: "technician",
      full_name: "Hermes Bot",
      invited_by: auth.userId,
    });
    if (inviteErr && !(inviteErr.message || "").toLowerCase().includes("duplicate")) {
      console.error("[setup-hermes-bot] pending_invite insert error:", inviteErr.message);
    }

    // 1) Create or update Hermes auth user
    let hermesId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: HERMES_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Hermes Bot" },
    });

    if (createErr) {
      const msg = (createErr.message || "").toLowerCase();
      const isDuplicate =
        msg.includes("already") || msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate");
      if (!isDuplicate) {
        console.error("[setup-hermes-bot] createUser error:", createErr.message);
        return jsonResponse({ error: `Failed to create Hermes user: ${createErr.message}` }, 500);
      }

      hermesId = await resolveUserIdByEmail(admin, HERMES_EMAIL);
      if (!hermesId) {
        return jsonResponse({ error: "Hermes user exists but could not be resolved" }, 500);
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(hermesId, {
        password,
        email_confirm: true,
        user_metadata: { full_name: "Hermes Bot" },
      });
      if (updErr) {
        console.error("[setup-hermes-bot] updateUserById error:", updErr.message);
        return jsonResponse({ error: "Failed to update Hermes password" }, 500);
      }
    } else {
      hermesId = created.user.id;
    }

    // 2) Upsert profile
    const { error: profErr } = await admin.from("profiles").upsert(
      { user_id: hermesId, email: HERMES_EMAIL, full_name: "Hermes Bot" },
      { onConflict: "user_id" },
    );
    if (profErr) console.error("[setup-hermes-bot] profile upsert error:", profErr.message);

    // 3) Ensure single 'technician' role
    const { error: delErr } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", hermesId)
      .neq("role", "technician");
    if (delErr) console.error("[setup-hermes-bot] delete roles error:", delErr.message);

    const { error: insErr } = await admin
      .from("user_roles")
      .upsert({ user_id: hermesId, role: "technician" }, { onConflict: "user_id,role" });
    if (insErr) console.error("[setup-hermes-bot] insert role error:", insErr.message);

    // 4) Store password in Vault (never returned/logged)
    const { error: vaultErr } = await admin.rpc("vault_upsert_secret", {
      p_name: VAULT_SECRET_NAME,
      p_secret: password,
    });
    if (vaultErr) {
      console.error("[setup-hermes-bot] vault_upsert_secret error:", vaultErr.message);
      return jsonResponse({ error: "Failed to store password in Vault" }, 500);
    }

    return jsonResponse({
      success: true,
      user_id: hermesId,
      role: "technician",
      password_stored_in_vault: true,
    });
  } catch (e) {
    console.error("[setup-hermes-bot] Unexpected error:", (e as Error).message);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
