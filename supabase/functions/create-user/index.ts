import { adminClient, corsHeaders, jsonResponse, logAudit, rateLimit, requireRole } from "../_shared/auth-helpers.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10,15}$/;
const NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 8;

const VALID_ROLES = ["admin", "manager", "technician", "financial", "client", "client_master"];

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  roles: string[];
}

function sanitizeString(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, 500);
}

function validateRequest(body: unknown): { valid: boolean; error?: string; data?: CreateUserRequest } {
  if (!body || typeof body !== "object") return { valid: false, error: "Invalid request body" };
  const { email, password, full_name, phone, roles } = body as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) return { valid: false, error: "Invalid email format" };
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  const sanitizedName = sanitizeString(full_name);
  if (!sanitizedName || sanitizedName.length < 2 || sanitizedName.length > NAME_MAX_LENGTH) return { valid: false, error: "Name must be between 2 and 100 characters" };
  let sanitizedPhone: string | undefined;
  if (phone !== undefined && phone !== null && phone !== "") {
    const phoneDigits = String(phone).replace(/\D/g, "");
    if (!PHONE_REGEX.test(phoneDigits)) return { valid: false, error: "Invalid phone format" };
    sanitizedPhone = phoneDigits;
  }
  if (!Array.isArray(roles) || roles.length === 0) return { valid: false, error: "At least one role is required" };
  const invalidRoles = roles.filter((r) => !VALID_ROLES.includes(r));
  if (invalidRoles.length > 0) return { valid: false, error: `Invalid roles: ${invalidRoles.join(", ")}` };
  return {
    valid: true,
    data: {
      email: email.trim().toLowerCase(),
      password,
      full_name: sanitizedName,
      phone: sanitizedPhone,
      roles: roles as string[],
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireRole(req.headers.get("Authorization"), ["admin"]);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error, required_roles: ["admin"] }, auth.status ?? 401);
    }

    const rl = rateLimit(`create-user:${auth.userId}`, 5, 60_000);
    if (!rl.allowed) {
      return jsonResponse({ error: "rate_limited", retry_after_seconds: rl.retryAfter }, 429);
    }

    let rawBody: unknown;
    try { rawBody = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    const validation = validateRequest(rawBody);
    if (!validation.valid || !validation.data) return jsonResponse({ error: validation.error }, 400);

    const { email, password, full_name, phone, roles } = validation.data;
    const admin = adminClient();

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name },
    });

    if (createError) {
      console.error("[create-user] Error:", createError.message);
      const safeMessage = createError.message.includes("already registered")
        ? "Este email já está cadastrado"
        : "Erro ao criar usuário";
      return jsonResponse({ error: safeMessage }, 400);
    }

    const userId = newUser.user.id;

    await admin.from("profiles").upsert(
      { user_id: userId, email, full_name, phone: phone || null },
      { onConflict: "user_id" },
    );

    const { error: rolesError } = await admin
      .from("user_roles")
      .insert(roles.map((role) => ({ user_id: userId, role })));

    if (rolesError) {
      console.error("[create-user] roles error:", rolesError.message);
    }

    await logAudit(admin, {
      table_name: "auth.users",
      record_id: userId,
      action: "USER_CREATED",
      user_id: auth.userId!,
      new_data: { email, full_name, roles },
    });

    return jsonResponse({ success: true, userId });
  } catch (error) {
    console.error("[create-user] Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
