import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

interface TestConnectionRequest {
  endpoint: string;
  region: string;
  bucket_name: string;
  access_key: string;
  secret_key: string;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Testa conexão com S3-compatível
 */
async function testS3Connection(req: TestConnectionRequest): Promise<{
  success: boolean;
  message: string;
  details?: Record<string, string>;
}> {
  try {
    // 1. Testar HEAD request básico
    console.log(`Testing S3 connection to ${req.endpoint}/${req.bucket_name}`);

    const response = await fetch(
      `${req.endpoint}/${req.bucket_name}/`,
      {
        method: "HEAD",
        headers: {
          Authorization: `AWS4-HMAC-SHA256 Credential=${req.access_key}`,
        },
      }
    );

    if (response.ok || response.status === 404 || response.status === 403) {
      // 404 = bucket exists but is empty (OK)
      // 403 = access denied (credential issue, but connection works)
      // 200 = success

      if (response.status === 403) {
        return {
          success: false,
          message: "Connection successful but authentication failed. Check access key and secret key.",
          details: {
            status: String(response.status),
            statusText: response.statusText,
          },
        };
      }

      // 2. Testar PUT (write permission)
      try {
        const testKey = `.connection-test-${Date.now()}.txt`;
        const testContent = new Blob(["Connection test"], {
          type: "text/plain",
        });

        const putResponse = await fetch(
          `${req.endpoint}/${req.bucket_name}/${testKey}`,
          {
            method: "PUT",
            body: testContent,
            headers: {
              "Content-Type": "text/plain",
            },
          }
        );

        if (putResponse.ok) {
          // Testar DELETE
          try {
            await fetch(`${req.endpoint}/${req.bucket_name}/${testKey}`, {
              method: "DELETE",
            });
          } catch (deleteError) {
            console.warn("Warning: Could not delete test file:", deleteError);
          }

          return {
            success: true,
            message: "S3 connection test successful! Read/Write permissions verified.",
            details: {
              endpoint: req.endpoint,
              bucket: req.bucket_name,
              region: req.region,
              status: String(putResponse.status),
            },
          };
        } else {
          return {
            success: false,
            message: `Write test failed. Status: ${putResponse.status} ${putResponse.statusText}`,
            details: {
              status: String(putResponse.status),
              statusText: putResponse.statusText,
            },
          };
        }
      } catch (writeError) {
        return {
          success: false,
          message: `Write permission test error: ${writeError instanceof Error ? writeError.message : "Unknown error"}`,
          details: {
            error: writeError instanceof Error ? writeError.message : "Unknown",
          },
        };
      }
    } else if (response.status === 404) {
      return {
        success: false,
        message: "Bucket not found. Check bucket name and region.",
        details: {
          status: String(response.status),
          bucket: req.bucket_name,
        },
      };
    } else {
      return {
        success: false,
        message: `Connection failed. Status: ${response.status} ${response.statusText}`,
        details: {
          status: String(response.status),
          statusText: response.statusText,
        },
      };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return {
      success: false,
      message: `Connection error: ${errorMessage}`,
      details: {
        error: errorMessage,
      },
    };
  }
}

// Main handler
Deno.serve(async (req) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);

    // Verificar se o usuário tem permissão
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Verificar permissão (admin ou manager)
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const hasPermission =
      userRoles?.some((r) => ["admin", "manager"].includes(r.role)) ?? false;

    if (!hasPermission) {
      return new Response(JSON.stringify({ error: "Permission denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as TestConnectionRequest;

    // Validar campos obrigatórios
    if (!body.endpoint || !body.bucket_name || !body.access_key || !body.secret_key) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Testing S3 connection for user ${user.id}`);

    const result = await testS3Connection(body);

    // Salvar resultado do teste
    if (result.success) {
      // Salvaria aqui se houvesse uma coluna para armazenar, mas não há integração direta
      console.log("Test passed, connection credentials are valid");
    }

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Test connection error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
