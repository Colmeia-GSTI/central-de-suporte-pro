import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Security: Input validation patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10,15}$/;
const NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 8;

// Valid roles that can be assigned
const VALID_ROLES = ["admin", "manager", "technician", "financial", "client", "client_master"];

interface CreateUserRequest {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  roles: string[];
}

// Sanitize string input
function sanitizeString(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control characters
    .trim()
    .slice(0, 500); // Limit length
}

// Validate request body
function validateRequest(body: unknown): { valid: boolean; error?: string; data?: CreateUserRequest } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Invalid request body" };
  }

  const { email, password, full_name, phone, roles } = body as Record<string, unknown>;

  // Validate email
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return { valid: false, error: "Invalid email format" };
  }

  // Validate password
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }

  // Validate full_name
  const sanitizedName = sanitizeString(full_name);
  if (!sanitizedName || sanitizedName.length < 2 || sanitizedName.length > NAME_MAX_LENGTH) {
    return { valid: false, error: "Name must be between 2 and 100 characters" };
  }

  // Validate phone (optional)
  let sanitizedPhone: string | undefined;
  if (phone !== undefined && phone !== null && phone !== "") {
    const phoneDigits = String(phone).replace(/\D/g, "");
    if (!PHONE_REGEX.test(phoneDigits)) {
      return { valid: false, error: "Invalid phone format" };
    }
    sanitizedPhone = phoneDigits;
  }

  // Validate roles
  if (!Array.isArray(roles) || roles.length === 0) {
    return { valid: false, error: "At least one role is required" };
  }

  const invalidRoles = roles.filter((r) => !VALID_ROLES.includes(r));
  if (invalidRoles.length > 0) {
    return { valid: false, error: `Invalid roles: ${invalidRoles.join(", ")}` };
  }

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with the user's token to verify permissions
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the requesting user is authenticated
    const { data: { user: requestingUser }, error: authError } = await userClient.auth.getUser();
    if (authError || !requestingUser) {
      console.warn("[create-user] Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if requesting user has admin role (using service client to bypass RLS)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: adminRoles, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id)
      .eq("role", "admin");

    if (roleError || !adminRoles || adminRoles.length === 0) {
      console.warn(`[create-user] Unauthorized attempt by user ${requestingUser.id}`);
      return new Response(
        JSON.stringify({ error: "Only admins can create users" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse and validate request body
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
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

    const { email, password, full_name, phone, roles } = validation.data;

    // Create the user
    // email_confirm: true — admin-created users bypass email confirmation flow intentionally.
    // Welcome email is sent separately via send-welcome-email when applicable.
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createError) {
      console.error("[create-user] Error creating user:", createError.message);
      // Don't expose internal error details
      const safeMessage = createError.message.includes("already registered")
        ? "Este email já está cadastrado"
        : "Erro ao criar usuário";
      return new Response(
        JSON.stringify({ error: safeMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = newUser.user.id;
    console.log(`[create-user] User created successfully: ${userId}`);

    // Update profile (trigger handle_new_user already creates it)
    const { error: profileError } = await adminClient.from("profiles").upsert({
      user_id: userId,
      email,
      full_name,
      phone: phone || null,
    }, { onConflict: 'user_id' });

    if (profileError) {
      console.warn("[create-user] Profile update failed:", profileError.message);
    }

    // Assign roles
    const roleInserts = roles.map((role) => ({
      user_id: userId,
      role,
    }));

    const { error: rolesError } = await adminClient.from("user_roles").insert(roleInserts);

    if (rolesError) {
      console.error("[create-user] Error assigning roles:", rolesError.message);
      return new Response(
        JSON.stringify({ 
          success: true, 
          userId,
          warning: "Usuário criado, mas houve erro ao atribuir perfis" 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[create-user] Roles assigned to user ${userId}: ${roles.join(", ")}`);

    return new Response(
      JSON.stringify({ success: true, userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[create-user] Unexpected error:", error);
    // Never expose stack traces or internal error details
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
