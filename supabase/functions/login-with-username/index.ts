import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting por IP — endpoint de autenticacao, mais apertado que consultas.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 10 tentativas/min por IP

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const rec = rateLimitMap.get(key);
  if (!rec || now > rec.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (rec.count >= RATE_LIMIT_MAX) return false;
  rec.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap) if (now > v.resetTime) rateLimitMap.delete(k);
}, 60_000);

interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Login por username SEM expor o e-mail ao cliente.
 * Resolve username -> e-mail e autentica no servidor; devolve apenas os tokens
 * de sessao. Respostas de erro sao genericas (`invalid_credentials`) para nao
 * permitir enumeracao de usuarios.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const GENERIC = { error: "invalid_credentials" };

  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
    if (!checkRateLimit(`login-username:${ip}`)) {
      return json({ error: "rate_limited" }, 429);
    }

    const { username, password } = (await req.json()) as LoginRequest;
    if (!username || !password) return json(GENERIC, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Resolve username -> e-mail (fonte: client_contacts)
    const { data: contact } = await admin
      .from("client_contacts")
      .select("user_id, email, is_active")
      .eq("username", username.toLowerCase())
      .maybeSingle();

    if (!contact || !contact.is_active || !contact.user_id) return json(GENERIC, 401);

    let email: string | null =
      contact.email && !contact.email.endsWith(".internal") ? contact.email : null;
    if (!email) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("user_id", contact.user_id)
        .maybeSingle();
      email = profile?.email && !profile.email.endsWith(".internal") ? profile.email : null;
    }
    if (!email) return json(GENERIC, 401);

    // Autentica no servidor (client anon) — o e-mail nunca volta ao cliente.
    const authClient = createClient(supabaseUrl, anonKey);
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message === "Email not confirmed") return json({ error: "email_not_confirmed" }, 403);
      return json(GENERIC, 401);
    }
    if (!data.session) return json(GENERIC, 401);

    return json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (_e) {
    return json(GENERIC, 401);
  }
});
