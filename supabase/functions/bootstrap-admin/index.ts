import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Security: Input validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 8;

interface BootstrapAdminRequest {
  email: string;
  password: string;
  full_name: string;
}

// Sanitize string input
function sanitizeString(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, 500);
}

// Validate request body
function validateRequest(body: unknown): { valid: boolean; error?: string; data?: BootstrapAdminRequest } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body" };
  }

  const { email, password, full_name } = body as Record<string, unknown>;

  // Validate email
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return { valid: false, error: "Formato de email inválido" };
  }

  // Validate password
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres` };
  }

  // Validate full_name
  const sanitizedName = sanitizeString(full_name);
  if (!sanitizedName || sanitizedName.length < 2 || sanitizedName.length > NAME_MAX_LENGTH) {
    return { valid: false, error: "Nome deve ter entre 2 e 100 caracteres" };
  }

  return {
    valid: true,
    data: {
      email: email.trim().toLowerCase(),
      password,
      full_name: sanitizedName,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client to bypass RLS
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // CRITICAL SECURITY CHECK: Verify no admins exist
    const { data: existingAdmins, error: checkError } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    if (checkError) {
      console.error("[bootstrap-admin] Error checking existing admins:", checkError.message);
      return new Response(
        JSON.stringify({ error: "Erro ao verificar sistema" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If admins already exist, deny access
    if (existingAdmins && existingAdmins.length > 0) {
      console.warn("[bootstrap-admin] Attempt to use bootstrap when admin already exists");
      return new Response(
        JSON.stringify({ error: "Sistema já configurado. Use o login normal." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Corpo da requisição inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validation = validateRequest(rawBody);
    if (!validation.valid || !validation.data) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, full_name } = validation.data;

    // Create the admin user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("[bootstrap-admin] Error creating user:", createError.message);
      const safeMessage = createError.message.includes("already registered")
        ? "Este email já está cadastrado"
        : "Erro ao criar usuário";
      return new Response(
        JSON.stringify({ error: safeMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = newUser.user.id;
    console.log(`[bootstrap-admin] Admin user created: ${userId}`);

    // Update profile
    const { error: profileError } = await adminClient.from("profiles").upsert({
      user_id: userId,
      email,
      full_name,
    }, { onConflict: 'user_id' });

    if (profileError) {
      console.warn("[bootstrap-admin] Profile update failed:", profileError.message);
    }

    // Delete default technician role (created by trigger)
    await adminClient
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "technician");

    // Assign admin role
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });

    if (roleError) {
      console.error("[bootstrap-admin] Error assigning admin role:", roleError.message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Usuário criado, mas houve erro ao atribuir perfil de administrador" 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[bootstrap-admin] Admin role assigned to user ${userId}`);

    // Log this important action
    await adminClient.from("audit_logs").insert({
      table_name: "user_roles",
      action: "BOOTSTRAP_ADMIN",
      record_id: userId,
      new_data: { email, full_name, role: "admin" },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Administrador criado com sucesso!" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[bootstrap-admin] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
