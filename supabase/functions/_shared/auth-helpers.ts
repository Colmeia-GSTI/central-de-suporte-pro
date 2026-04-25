// Shared authentication / authorization helpers for Edge Functions.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getEnv() {
  return {
    url: Deno.env.get("SUPABASE_URL") ?? "",
    anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  };
}

export function adminClient(): SupabaseClient {
  const { url, serviceKey } = getEnv();
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function userClientFromAuth(authHeader: string): SupabaseClient {
  const { url, anonKey } = getEnv();
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export interface AuthResult {
  ok: boolean;
  userId?: string;
  email?: string;
  roles?: string[];
  status?: number;
  error?: string;
}

/**
 * Validates the caller and ensures they hold at least one of `allowedRoles`.
 * Returns userId, email and the full role list on success.
 */
export async function requireRole(
  authHeader: string | null,
  allowedRoles: string[],
): Promise<AuthResult> {
  if (!authHeader) {
    return { ok: false, status: 401, error: "Não autorizado" };
  }
  const userClient = userClientFromAuth(authHeader);
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return { ok: false, status: 401, error: "Não autorizado" };
  }
  const admin = adminClient();
  const { data: rolesData, error: rolesErr } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  if (rolesErr) {
    return { ok: false, status: 500, error: "Erro ao verificar permissões" };
  }
  const roles = (rolesData ?? []).map((r) => r.role as string);
  const allowed = roles.some((r) => allowedRoles.includes(r));
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      roles,
      userId: user.id,
    };
  }
  return { ok: true, userId: user.id, email: user.email ?? undefined, roles };
}

/**
 * Lightweight in-memory rate limiter — 5 requests per minute per key by default.
 * Persists only for the lifetime of the function instance — good enough as a
 * brake against scripted abuse from the admin UI.
 */
const rlBuckets = new Map<string, number[]>();
export function rateLimit(
  key: string,
  max = 5,
  windowMs = 60_000,
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const arr = (rlBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    const retryAfter = Math.ceil((windowMs - (now - arr[0])) / 1000);
    return { allowed: false, retryAfter };
  }
  arr.push(now);
  rlBuckets.set(key, arr);
  return { allowed: true };
}

export async function logAudit(
  admin: SupabaseClient,
  params: {
    table_name: string;
    record_id: string | null;
    action: string;
    user_id: string;
    old_data?: unknown;
    new_data?: unknown;
  },
): Promise<void> {
  try {
    await admin.from("audit_logs").insert({
      table_name: params.table_name,
      record_id: params.record_id,
      action: params.action,
      user_id: params.user_id,
      old_data: params.old_data ?? null,
      new_data: params.new_data ?? null,
    });
  } catch (e) {
    console.error("[auth-helpers] audit log failed:", e);
  }
}
