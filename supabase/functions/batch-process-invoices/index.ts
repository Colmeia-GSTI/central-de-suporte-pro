import { createClient } from "npm:@supabase/supabase-js@2";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const totalInvoices = req.invoice_ids.length;

  console.log(`[batch-process] Starting batch processing of ${totalInvoices} invoices`);
  console.log(`[batch-process] Options: boleto=${req.generate_boleto}, pix=${req.generate_pix}, nfse=${req.emit_nfse}, email=${req.send_email}, whatsapp=${req.send_whatsapp}`);
  console.log(`[batch-process] Provider: ${req.billing_provider || "banco_inter"}`);

  for (let i = 0; i < req.invoice_ids.length; i++) {
    const invoiceId = req.invoice_ids[i];
    console.log(`[batch-process] Processing invoice ${i + 1}/${totalInvoices}: ${invoiceId}`);
    
    const result: ProcessingResult = {
      invoice_id: invoiceId,
      success: true,
      processed_at: new Date().toISOString(),
    };

    try {
      // Buscar dados atuais da fatura para incrementar attempts
      const { data: currentInvoice } = await supabase
        .from("invoices")
        .select("processing_attempts")
        .eq("id", invoiceId)
        .single();

      const currentAttempts = currentInvoice?.processing_attempts || 0;

      // 1. GERAR BOLETO
      if (req.generate_boleto) {
        try {
          console.log(`[batch-process] Generating boleto for ${invoiceId}`);
          const functionName = req.billing_provider === "asaas" ? "asaas-nfse" : "banco-inter";
          const body = req.billing_provider === "asaas" 
            ? { action: "create_payment", invoice_id: invoiceId, billing_type: "BOLETO" }
            : { invoice_id: invoiceId, payment_type: "boleto" };

          const { data, error: boletoError } = await supabase.functions.invoke(functionName, { body });

          if (boletoError) {
            result.boleto_status = "error";
            result.boleto_error = boletoError.message;
            console.error(`[batch-process] Error generating boleto for ${invoiceId}:`, boletoError);
          } else if (data?.error) {
            result.boleto_status = "error";
            result.boleto_error = data.error;
            console.error(`[batch-process] Boleto API error for ${invoiceId}:`, data.error);
          } else {
            result.boleto_status = "success";
            console.log(`[batch-process] Boleto generated successfully for ${invoiceId}`);

            // CORREÇÃO: NÃO sobrescrever boleto_status aqui.
            // A edge function (banco-inter ou asaas-nfse) já cuida do status internamente.
            // Apenas incrementar processing_attempts.
            await supabase
              .from("invoices")
              .update({
                processing_attempts: currentAttempts + 1,
              })
              .eq("id", invoiceId);
          }
        } catch (error) {
          result.boleto_status = "error";
          result.boleto_error = error instanceof Error ? error.message : "Unknown error";
          console.error(`[batch-process] Boleto generation exception for ${invoiceId}:`, error);
        }
      } else {
        result.boleto_status = "skipped";
      }

      // 2. GERAR PIX
      if (req.generate_pix) {
        try {
          console.log(`[batch-process] Generating PIX for ${invoiceId}`);
          const functionName = req.billing_provider === "asaas" ? "asaas-nfse" : "banco-inter";
          const body = req.billing_provider === "asaas" 
            ? { action: "create_payment", invoice_id: invoiceId, billing_type: "PIX" }
            : { invoice_id: invoiceId, payment_type: "pix" };

          const { data, error: pixError } = await supabase.functions.invoke(functionName, { body });

          if (pixError) {
            console.error(`[batch-process] Error generating PIX for ${invoiceId}:`, pixError);
          } else if (data?.error) {
            console.error(`[batch-process] PIX API error for ${invoiceId}:`, data.error);
          } else {
            console.log(`[batch-process] PIX generated successfully for ${invoiceId}`);
          }
        } catch (error) {
          console.error(`[batch-process] PIX generation exception for ${invoiceId}:`, error);
        }
      }

      // 3. GERAR NFS-e
      if (req.emit_nfse) {
        try {
          // Buscar dados da fatura COM nfse_service_code do contrato
          const { data: invoice } = await supabase
            .from("invoices")
            .select("*, contracts(name, description, nfse_descricao_customizada, nfse_service_code, nfse_cnae)")
            .eq("id", invoiceId)
            .single();

          if (!invoice?.contract_id) {
            result.nfse_status = "skipped";
            console.log(`[batch-process] Invoice ${invoiceId} has no associated contract, skipping NFS-e`);
          } else if (!invoice.contracts?.nfse_service_code) {
            // NOVA VALIDAÇÃO: Contrato deve ter código de serviço configurado
            result.nfse_status = "error";
            result.nfse_error = "Contrato não possui código de serviço NFS-e configurado. Configure o código LC 116 no contrato.";
            console.error(`[batch-process] Contract ${invoice.contract_id} missing nfse_service_code, cannot emit NFS-e`);
          } else {
            console.log(`[batch-process] Emitting NFS-e for ${invoiceId} with service_code=${invoice.contracts.nfse_service_code}`);
            const { data, error: nfseError } = await supabase.functions.invoke(
              "asaas-nfse",
              {
                body: {
                  action: "emit",
                  client_id: invoice.client_id,
                  invoice_id: invoiceId,
                  contract_id: invoice.contract_id,
                  value: invoice.amount,
                  service_description: invoice.contracts?.nfse_descricao_customizada || 
                    invoice.contracts?.description || 
                    `Prestação de serviços - ${invoice.contracts?.name}`,
                  // CORREÇÃO CRÍTICA: Passar código de serviço do contrato
                  municipal_service_code: invoice.contracts.nfse_service_code,
                  cnae: invoice.contracts.nfse_cnae,
                },
              }
            );

            if (nfseError) {
              result.nfse_status = "error";
              result.nfse_error = nfseError.message;
              console.error(`[batch-process] Error emitting NFS-e for ${invoiceId}:`, nfseError);
            } else if (data?.error) {
              result.nfse_status = "error";
              result.nfse_error = data.error;
              console.error(`[batch-process] NFS-e API error for ${invoiceId}:`, data.error);
            } else {
              result.nfse_status = "success";
              console.log(`[batch-process] NFS-e emitted successfully for ${invoiceId}`);

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
          console.error(`[batch-process] NFS-e generation exception for ${invoiceId}:`, error);
        }
      } else {
        result.nfse_status = "skipped";
      }

      // 4. ENVIAR NOTIFICAÇÕES (com validação de artefatos)
      if (req.send_email || req.send_whatsapp) {
        try {
          // Recarregar dados atualizados da fatura
          const { data: freshInvoice } = await supabase
            .from("invoices")
            .select("boleto_url, boleto_barcode, pix_code, boleto_status")
            .eq("id", invoiceId)
            .single();

          // Verificar NFS-e vinculada
          const { data: linkedNfse } = await supabase
            .from("nfse_history")
            .select("id, status, pdf_url, xml_url")
            .eq("invoice_id", invoiceId)
            .eq("status", "autorizada")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const blockedArtifacts: string[] = [];
          if (linkedNfse && (!linkedNfse.pdf_url || !linkedNfse.xml_url)) {
            if (!linkedNfse.pdf_url) blockedArtifacts.push("nfse_pdf");
            if (!linkedNfse.xml_url) blockedArtifacts.push("nfse_xml");
          }
          const hasBoleto = !!freshInvoice?.boleto_url || !!freshInvoice?.boleto_barcode;
          const hasPix = !!freshInvoice?.pix_code;
          const boletoProcessando = freshInvoice?.boleto_status === "pendente" || freshInvoice?.boleto_status === "processando";
          if (boletoProcessando && !hasBoleto && !hasPix) {
            blockedArtifacts.push("boleto_pendente");
          }

          if (blockedArtifacts.length > 0) {
            result.email_status = "error";
            result.email_error = `Envio bloqueado: ${blockedArtifacts.join(", ")}`;
            console.warn(`[batch-process] Notification blocked for ${invoiceId}: ${blockedArtifacts.join(", ")}`);

            // Registrar bloqueio
            await supabase.from("application_logs").insert({
              module: "billing_notification",
              level: "warn",
              message: `Envio bloqueado em lote: ${blockedArtifacts.join(", ")}`,
              context: { invoice_id: invoiceId, blocked_artifacts: blockedArtifacts },
            });

            // Marcar email como bloqueado
            await supabase.from("invoices").update({ email_status: "erro", email_error_msg: `Bloqueado: ${blockedArtifacts.join(", ")}` }).eq("id", invoiceId);
          } else {
            const channels = [];
            if (req.send_email) channels.push("email");
            if (req.send_whatsapp) channels.push("whatsapp");

            console.log(`[batch-process] Sending notifications (${channels.join(", ")}) for ${invoiceId}`);
            const { data, error: notificationError } = await supabase.functions.invoke(
              "resend-payment-notification",
              { body: { invoice_id: invoiceId, channels } }
            );

            if (notificationError) {
              result.email_status = "error";
              result.email_error = notificationError.message;
              console.error(`[batch-process] Error sending notifications for ${invoiceId}:`, notificationError);
            } else if (!data?.success) {
              result.email_status = "error";
              result.email_error = data?.error || "Notification failed";
              console.error(`[batch-process] Notification API error for ${invoiceId}:`, data?.error);
            } else {
              result.email_status = "success";
              console.log(`[batch-process] Notifications sent successfully for ${invoiceId}`);
              await supabase.from("invoices").update({ email_status: "enviado", email_sent_at: new Date().toISOString() }).eq("id", invoiceId);
            }
          }
        } catch (error) {
          result.email_status = "error";
          result.email_error = error instanceof Error ? error.message : "Unknown error";
          console.error(`[batch-process] Notification sending exception for ${invoiceId}:`, error);
        }
      } else {
        result.email_status = "skipped";
      }

      // Marcar fatura como processada se pelo menos uma ação foi bem-sucedida
      const hasSuccess = 
        result.boleto_status === "success" ||
        result.nfse_status === "success" ||
        result.email_status === "success";

      if (hasSuccess) {
        await supabase
          .from("invoices")
          .update({
            processed_at: new Date().toISOString(),
            processing_metadata: {
              batch_processed: true,
              processed_at: new Date().toISOString(),
              boleto_status: result.boleto_status,
              nfse_status: result.nfse_status,
              email_status: result.email_status,
              provider: req.billing_provider || "banco_inter",
            },
          })
          .eq("id", invoiceId);
      }

      result.success = 
        result.boleto_status !== "error" &&
        result.nfse_status !== "error" &&
        result.email_status !== "error";

    } catch (error) {
      result.success = false;
      console.error(`[batch-process] Unexpected error processing invoice ${invoiceId}:`, error);
    }

    results.push(result);

    // Pequeno delay entre processamentos para não sobrecarregar
    if (i < req.invoice_ids.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`[batch-process] Completed. Processed ${results.length} invoices. Success: ${results.filter(r => r.success).length}`);
  return results;
}

// Main handler
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.substring(7);

    // Verificar se o usuário tem permissão para executar ação
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[batch-process] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      console.error("[batch-process] Permission denied for user:", user.id);
      return new Response(JSON.stringify({ error: "Permission denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as ProcessInvoiceRequest;

    if (!body.invoice_ids || body.invoice_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "No invoices specified" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[batch-process] User ${user.id} processing ${body.invoice_ids.length} invoices`);

    const results = await processInvoices(body);

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[batch-process] Batch processing error:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
