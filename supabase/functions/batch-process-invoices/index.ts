import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

interface ProcessInvoiceRequest {
  invoice_ids: string[];
  generate_boleto?: boolean;
  generate_pix?: boolean;
  emit_nfse?: boolean;
  send_email?: boolean;
  send_whatsapp?: boolean;
  billing_provider?: "banco_inter" | "asaas";
}

interface ProcessingResult {
  invoice_id: string;
  success: boolean;
  boleto_status?: "success" | "error" | "skipped";
  boleto_error?: string;
  nfse_status?: "success" | "error" | "skipped";
  nfse_error?: string;
  email_status?: "success" | "error" | "skipped";
  email_error?: string;
  processed_at: string;
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Processa lista de faturas de forma sequencial
 */
async function processInvoices(
  req: ProcessInvoiceRequest
): Promise<ProcessingResult[]> {
  const results: ProcessingResult[] = [];

  for (const invoiceId of req.invoice_ids) {
    const result: ProcessingResult = {
      invoice_id: invoiceId,
      success: true,
      processed_at: new Date().toISOString(),
    };

    try {
      // 1. GERAR BOLETO
      if (req.generate_boleto) {
        try {
          const { error: boletoError } = await supabase.functions.invoke(
            req.billing_provider === "asaas" ? "asaas-nfse" : "banco-inter",
            {
              body: {
                action: "generate_boleto",
                invoice_id: invoiceId,
                provider: req.billing_provider || "banco_inter",
              },
            }
          );

          if (boletoError) {
            result.boleto_status = "error";
            result.boleto_error = boletoError.message;
            console.error(`Error generating boleto for ${invoiceId}:`, boletoError);
          } else {
            result.boleto_status = "success";

            // Atualizar status no banco
            await supabase
              .from("invoices")
              .update({
                boleto_status: "enviado",
                boleto_sent_at: new Date().toISOString(),
                processing_attempts: (old_attempts: number) => old_attempts + 1,
              })
              .eq("id", invoiceId);
          }
        } catch (error) {
          result.boleto_status = "error";
          result.boleto_error = error instanceof Error ? error.message : "Unknown error";
          console.error("Boleto generation exception:", error);
        }
      } else {
        result.boleto_status = "skipped";
      }

      // 2. GERAR NFS-e
      if (req.emit_nfse) {
        try {
          // Buscar dados da fatura
          const { data: invoice } = await supabase
            .from("invoices")
            .select("*, nfse_history_id, contracts(name)")
            .eq("id", invoiceId)
            .single();

          if (!invoice?.contracts) {
            result.nfse_status = "skipped";
            console.log(`Invoice ${invoiceId} has no associated contract, skipping NFS-e`);
          } else {
            const { error: nfseError } = await supabase.functions.invoke(
              "asaas-nfse",
              {
                body: {
                  action: "emit",
                  invoice_id: invoiceId,
                },
              }
            );

            if (nfseError) {
              result.nfse_status = "error";
              result.nfse_error = nfseError.message;
              console.error(`Error emitting NFS-e for ${invoiceId}:`, nfseError);
            } else {
              result.nfse_status = "success";

              // Atualizar status no banco
              await supabase
                .from("invoices")
                .update({
                  nfse_status: "gerada",
                  nfse_generated_at: new Date().toISOString(),
                })
                .eq("id", invoiceId);
            }
          }
        } catch (error) {
          result.nfse_status = "error";
          result.nfse_error = error instanceof Error ? error.message : "Unknown error";
          console.error("NFS-e generation exception:", error);
        }
      } else {
        result.nfse_status = "skipped";
      }

      // 3. ENVIAR NOTIFICAÇÕES
      if (req.send_email || req.send_whatsapp) {
        try {
          const channels = [];
          if (req.send_email) channels.push("email");
          if (req.send_whatsapp) channels.push("whatsapp");

          const { error: notificationError } = await supabase.functions.invoke(
            "resend-payment-notification",
            {
              body: {
                invoice_id: invoiceId,
                channels,
              },
            }
          );

          if (notificationError) {
            result.email_status = "error";
            result.email_error = notificationError.message;
            console.error(`Error sending notifications for ${invoiceId}:`, notificationError);
          } else {
            result.email_status = "success";

            // Atualizar status no banco
            await supabase
              .from("invoices")
              .update({
                email_status: "enviado",
                email_sent_at: new Date().toISOString(),
              })
              .eq("id", invoiceId);
          }
        } catch (error) {
          result.email_status = "error";
          result.email_error = error instanceof Error ? error.message : "Unknown error";
          console.error("Notification sending exception:", error);
        }
      } else {
        result.email_status = "skipped";
      }

      // Marcar fatura como processada se todos os passos foram bem-sucedidos
      if (
        result.boleto_status !== "error" &&
        result.nfse_status !== "error" &&
        result.email_status !== "error"
      ) {
        await supabase
          .from("invoices")
          .update({
            processed_at: new Date().toISOString(),
            processing_metadata: {
              batch_processed: true,
              processed_at: new Date().toISOString(),
            },
          })
          .eq("id", invoiceId);
      }

      result.success = true;
    } catch (error) {
      result.success = false;
      console.error(`Unexpected error processing invoice ${invoiceId}:`, error);
    }

    results.push(result);

    // Pequeno delay entre processamentos para não sobrecarregar
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
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

    // Verificar se o usuário tem permissão para executar ação
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

    // Verificar permissão (financial ou admin)
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const hasPermission =
      userRoles?.some((r) => ["admin", "manager", "financial"].includes(r.role)) ??
      false;

    if (!hasPermission) {
      return new Response(JSON.stringify({ error: "Permission denied" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ProcessInvoiceRequest;

    if (!body.invoice_ids || body.invoice_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "No invoices specified" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(
      `Processing ${body.invoice_ids.length} invoices for user ${user.id}`
    );

    const results = await processInvoices(body);

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Batch processing error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
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
