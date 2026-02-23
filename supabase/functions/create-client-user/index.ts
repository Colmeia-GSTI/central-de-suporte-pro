import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateClientUserRequest {
  clientId: string;
  contactId?: string; // Se fornecido, atualiza contato existente
  name: string;
  username: string;
  password: string;
  email?: string;
  phone?: string;
  role?: string;
  isPrimary?: boolean;
  isClientMaster?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autorização não fornecido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verificar se o usuário que está criando é staff
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: requestingUser }, error: userError } = await userClient.auth.getUser();
    if (userError || !requestingUser) {
      console.error("Error getting requesting user:", userError);
      return new Response(
        JSON.stringify({ error: "Usuário não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se é staff (admin, manager, technician, financial)
    const { data: roles, error: rolesError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", requestingUser.id);

    if (rolesError) {
      console.error("Error fetching roles:", rolesError);
      return new Response(
        JSON.stringify({ error: "Erro ao verificar permissões" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staffRoles = ["admin", "manager", "technician", "financial"];
    const isStaff = roles?.some((r) => staffRoles.includes(r.role));

    if (!isStaff) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para criar usuários de cliente" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: CreateClientUserRequest = await req.json();
    const { clientId, contactId, name, username, password, email, phone, role, isPrimary, isClientMaster } = body;

    if (!clientId || !name || !username || !password) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios: clientId, name, username, password" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Senha deve ter no mínimo 6 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client para operações privilegiadas
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar dados do cliente para gerar email sintético
    const { data: clientData, error: clientError } = await adminClient
      .from("clients")
      .select("name, document")
      .eq("id", clientId)
      .single();

    if (clientError || !clientData) {
      console.error("Error fetching client:", clientError);
      return new Response(
        JSON.stringify({ error: "Cliente não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verificar se username já existe
    const { data: existingUsername } = await adminClient
      .from("client_contacts")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (existingUsername && existingUsername.id !== contactId) {
      return new Response(
        JSON.stringify({ error: "Username já está em uso" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Gerar email sintético se não fornecido
    // Formato: username@slug-cliente.internal
    const clientSlug = clientData.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 30)
      .replace(/-$/g, "") || "client";
    
    const syntheticEmail = email || `${username}@${clientSlug}.internal`;

    console.log(`Creating client user: ${name} (${username}) for client ${clientData.name}`);
    console.log(`Synthetic email: ${syntheticEmail}`);

    // Criar usuário no Supabase Auth
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        is_client_user: true,
        client_id: clientId,
      },
    });

    if (createError) {
      console.error("Error creating auth user:", createError);
      
      // Traduzir mensagens de erro comuns
      let errorMessage = createError.message;
      if (createError.message.includes("already been registered")) {
        errorMessage = "Este email já está cadastrado no sistema";
      }
      
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = newUser.user.id;
    console.log(`Auth user created: ${userId}`);

    // Criar profile
    const { error: profileError } = await adminClient.from("profiles").upsert({
      user_id: userId,
      email: syntheticEmail,
      full_name: name,
      phone: phone || null,
    });

    if (profileError) {
      console.error("Error creating profile:", profileError);
      // Continuar mesmo com erro no profile
    }

    // Atribuir role "client" ou "client_master"
    const userRole = isClientMaster ? "client_master" : "client";
    const { error: roleError } = await adminClient.from("user_roles").insert({
      user_id: userId,
      role: userRole,
    });

    if (roleError) {
      console.error("Error assigning role:", roleError);
      // Continuar mesmo com erro na role
    }

    console.log(`Role assigned: ${userRole}`);

    // Criar ou atualizar client_contacts
    let finalContactId = contactId;

    if (contactId) {
      // Atualizar contato existente
      const { error: updateError } = await adminClient
        .from("client_contacts")
        .update({
          user_id: userId,
          username,
          is_active: true,
          name,
          email: email || null,
          phone: phone || null,
          role: role || null,
          is_primary: isPrimary || false,
        })
        .eq("id", contactId);

      if (updateError) {
        console.error("Error updating contact:", updateError);
        return new Response(
          JSON.stringify({ error: "Erro ao atualizar contato" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      // Criar novo contato
      const { data: newContact, error: insertError } = await adminClient
        .from("client_contacts")
        .insert({
          client_id: clientId,
          user_id: userId,
          username,
          is_active: true,
          name,
          email: email || null,
          phone: phone || null,
          role: role || null,
          is_primary: isPrimary || false,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error("Error creating contact:", insertError);
        return new Response(
          JSON.stringify({ error: "Erro ao criar contato" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      finalContactId = newContact.id;
    }

    console.log(`Client user created successfully: ${finalContactId}`);

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        contactId: finalContactId,
        message: "Usuário criado com sucesso",
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
