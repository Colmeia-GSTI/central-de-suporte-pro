import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Contract {
  id: string;
  client_id: string;
  name: string;
  monthly_value: number;
  billing_day: number | null;
  days_before_due: number | null;
  payment_preference: string | null;
  billing_provider: string | null;
  nfse_enabled: boolean | null;
  notification_message: string | null;
  description: string | null;
  nfse_descricao_customizada: string | null;
  nfse_service_code: string | null;
  clients: {
    name: string;
    email: string | null;
    financial_email: string | null;
  } | null;
}

interface AdditionalCharge {
  id: string;
  description: string;
  amount: number;
}

interface ContractResult {
  contract_id: string;
  contract_name: string;
  status: "created" | "skipped" | "error";
  invoice_id: string | null;
  invoice_number: number | null;
  error: string | null;
  duration_ms: number;
}

interface ExecutionError {
  contract_id: string;
  contract_name: string;
  code: string;
  message: string;
  timestamp: string;
}

interface GenerationResponse {
  success: boolean;
  message: string;
  timestamp: string;
  execution_id: string;
  reference_month: string;
  stats: {
    total_contracts: number;
    generated: number;
    skipped: number;
    failed: number;
  };
  results: ContractResult[];
  errors: ExecutionError[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logToDatabase(
  supabase: any,
  level: "info" | "warn" | "error",
  module: string,
  action: string,
  message: string,
  context?: Record<string, unknown>,
  errorDetails?: Record<string, unknown>,
  executionId?: string,
  durationMs?: number
) {
  try {
    await supabase.from("application_logs").insert({
      level,
      module,
      action,
      message,
      context,
      error_details: errorDetails,
      execution_id: executionId,
      duration_ms: durationMs,
    });
  } catch (e) {
    console.error("[LOG-DB] Failed to persist log:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const executionId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Allow manual trigger with specific month/year or use current
    const body = await req.json().catch(() => ({}));
    const targetMonth = body.month || new Date().getMonth() + 1;
    const targetYear = body.year || new Date().getFullYear();
    const referenceMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
    const manualContractId = body.contract_id || null;

    console.log(`[GEN-INVOICES] Execution ID: ${executionId}`);
    console.log(`[GEN-INVOICES] Gerando faturas para competência ${referenceMonth}${manualContractId ? ` (manual: ${manualContractId})` : ""}`);

    await logToDatabase(
      supabase,
      "info",
      "Billing",
      "generate-monthly-invoices",
      `Iniciando geração de faturas para ${referenceMonth}${manualContractId ? " (manual)" : ""}`,
      { reference_month: referenceMonth, contract_id: manualContractId },
      undefined,
      executionId
    );

    // Fetch active contracts with client info
    let contractsQuery = supabase
      .from("contracts")
      .select(`
        id,
        client_id,
        name,
        monthly_value,
        billing_day,
        days_before_due,
        payment_preference,
        billing_provider,
        nfse_enabled,
        notification_message,
        description,
        nfse_descricao_customizada,
        nfse_service_code,
        clients (
          name,
          email,
          financial_email
        )
      `)
      .eq("status", "active")
      .gt("monthly_value", 0);

    // When contract_id is provided, filter to that specific contract
    if (manualContractId) {
      contractsQuery = contractsQuery.eq("id", manualContractId);
    }

    const { data: contracts, error: contractsError } = await contractsQuery;

    if (contractsError) {
      console.error("[GEN-INVOICES] Erro ao buscar contratos:", contractsError);
      
      await logToDatabase(
        supabase,
        "error",
        "Billing",
        "generate-monthly-invoices",
        "Erro ao buscar contratos ativos",
        { reference_month: referenceMonth },
        { message: contractsError.message, code: contractsError.code },
        executionId,
        Date.now() - startTime
      );

      const response: GenerationResponse = {
        success: false,
        message: `Erro ao buscar contratos: ${contractsError.message}`,
        timestamp: new Date().toISOString(),
        execution_id: executionId,
        reference_month: referenceMonth,
        stats: { total_contracts: 0, generated: 0, skipped: 0, failed: 0 },
        results: [],
        errors: [{
          contract_id: "",
          contract_name: "",
          code: contractsError.code || "DB_ERROR",
          message: contractsError.message,
          timestamp: new Date().toISOString(),
        }],
      };

      return new Response(JSON.stringify(response), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contracts || contracts.length === 0) {
      console.log("[GEN-INVOICES] Nenhum contrato ativo encontrado");
      
      await logToDatabase(
        supabase,
        "info",
        "Billing",
        "generate-monthly-invoices",
        "Nenhum contrato ativo encontrado",
        { reference_month: referenceMonth },
        undefined,
        executionId,
        Date.now() - startTime
      );

      const response: GenerationResponse = {
        success: true,
        message: "Nenhum contrato ativo encontrado",
        timestamp: new Date().toISOString(),
        execution_id: executionId,
        reference_month: referenceMonth,
        stats: { total_contracts: 0, generated: 0, skipped: 0, failed: 0 },
        results: [],
        errors: [],
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GEN-INVOICES] ${contracts.length} contratos ativos encontrados`);

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const results: ContractResult[] = [];
    const errors: ExecutionError[] = [];

    // Check if billing providers are configured
    const { data: bancoInterSettings } = await supabase
      .from("integration_settings")
      .select("is_active")
      .eq("integration_type", "banco_inter")
      .single();

    const { data: asaasSettings } = await supabase
      .from("integration_settings")
      .select("is_active")
      .eq("integration_type", "asaas")
      .single();

    const bancoInterActive = bancoInterSettings?.is_active || false;
    const asaasActive = asaasSettings?.is_active || false;

    for (const contract of contracts as unknown as Contract[]) {
      const contractStartTime = Date.now();

      try {
        // Check if invoice already exists for this contract and month
        const { data: existingInvoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("contract_id", contract.id)
          .eq("reference_month", referenceMonth)
          .not("status", "in", '("cancelled","voided")')
          .limit(1);

        if (existingInvoice && existingInvoice.length > 0) {
          console.log(`[GEN-INVOICES] Fatura já existe para contrato ${contract.name} (${referenceMonth})`);
          skipped++;
          results.push({
            contract_id: contract.id,
            contract_name: contract.name,
            status: "skipped",
            invoice_id: existingInvoice[0].id,
            invoice_number: null,
            error: null,
            duration_ms: Date.now() - contractStartTime,
          });
          continue;
        }

        // Calculate due date based on billing_day
        const billingDay = contract.billing_day || 10;
        const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
        const actualBillingDay = Math.min(billingDay, lastDayOfMonth);
        const dueDate = `${referenceMonth}-${String(actualBillingDay).padStart(2, "0")}`;

        // Fetch additional charges for this contract and month
        const { data: additionalCharges } = await supabase
          .from("contract_additional_charges")
          .select("id, description, amount")
          .eq("contract_id", contract.id)
          .eq("reference_month", referenceMonth)
          .eq("applied", false);

        const charges = (additionalCharges || []) as AdditionalCharge[];
        const additionalTotal = charges.reduce((sum, c) => sum + c.amount, 0);
        const totalAmount = contract.monthly_value + additionalTotal;

        // Build invoice notes with contract info and additional charges
        let invoiceNotes = `Fatura mensal - Contrato: ${contract.name} - Competência: ${referenceMonth}`;
        if (charges.length > 0) {
          invoiceNotes += `\n\nValores adicionais:`;
          for (const charge of charges) {
            invoiceNotes += `\n- ${charge.description}: R$ ${charge.amount.toFixed(2)}`;
          }
        }

        // Create the invoice with reference_month and billing_provider
        const { data: newInvoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            client_id: contract.client_id,
            contract_id: contract.id,
            amount: totalAmount,
            due_date: dueDate,
            reference_month: referenceMonth,
            status: "pending",
            payment_method: contract.payment_preference || "boleto",
            notes: invoiceNotes,
            auto_payment_generated: false,
            billing_provider: contract.billing_provider || null,
          })
          .select("id, invoice_number")
          .single();

        if (invoiceError) {
          console.error(`[GEN-INVOICES] Erro ao criar fatura para ${contract.name}:`, invoiceError);
          failed++;
          results.push({
            contract_id: contract.id,
            contract_name: contract.name,
            status: "error",
            invoice_id: null,
            invoice_number: null,
            error: invoiceError.message,
            duration_ms: Date.now() - contractStartTime,
          });
          errors.push({
            contract_id: contract.id,
            contract_name: contract.name,
            code: invoiceError.code || "INSERT_ERROR",
            message: invoiceError.message,
            timestamp: new Date().toISOString(),
          });

          // Log the failure
          await supabase.from("invoice_generation_log").insert({
            contract_id: contract.id,
            reference_month: referenceMonth,
            status: "error",
            error_message: invoiceError.message,
          });

          continue;
        }

        console.log(`[GEN-INVOICES] Fatura #${newInvoice.invoice_number} criada para ${contract.name} - R$ ${totalAmount.toFixed(2)}`);
        generated++;
        results.push({
          contract_id: contract.id,
          contract_name: contract.name,
          status: "created",
          invoice_id: newInvoice.id,
          invoice_number: newInvoice.invoice_number,
          error: null,
          duration_ms: Date.now() - contractStartTime,
        });

        // Mark additional charges as applied
        if (charges.length > 0) {
          await supabase
            .from("contract_additional_charges")
            .update({
              applied: true,
              applied_invoice_id: newInvoice.id,
            })
            .in("id", charges.map((c) => c.id));

          console.log(`[GEN-INVOICES] ${charges.length} cobranças adicionais vinculadas à fatura`);
        }

        // Generate invoice_items from contract_services (Review 1.2)
        try {
          const { data: services } = await supabase
            .from("contract_services")
            .select("name, description, quantity, unit_value, value")
            .eq("contract_id", contract.id);

          if (services && services.length > 0) {
            const items = services.map((s: Record<string, unknown>) => ({
              invoice_id: newInvoice.id,
              description: (s.description as string) || (s.name as string) || "Serviço",
              quantity: (s.quantity as number) || 1,
              unit_value: (s.unit_value as number) || (s.value as number) || 0,
              total_value: (s.value as number) || 0,
            }));
            await supabase.from("invoice_items").insert(items);
            console.log(`[GEN-INVOICES] ${items.length} invoice_items criados a partir de contract_services`);
          }
        } catch (itemsError) {
          console.error(`[GEN-INVOICES] Erro ao criar invoice_items para ${contract.name}:`, itemsError);
        }

        // Log success
        await supabase.from("invoice_generation_log").insert({
          contract_id: contract.id,
          invoice_id: newInvoice.id,
          reference_month: referenceMonth,
          status: "success",
        });

        // Auto-generate payment based on billing_provider
        const provider = contract.billing_provider || "banco_inter";
        const providerActive = provider === "asaas" ? asaasActive : bancoInterActive;

        if (providerActive && contract.payment_preference) {
          try {
            const paymentTypes = contract.payment_preference === "both" 
              ? ["boleto", "pix"] 
              : [contract.payment_preference];

            for (const paymentType of paymentTypes) {
              console.log(`[GEN-INVOICES] Gerando ${paymentType} via ${provider} para fatura #${newInvoice.invoice_number}`);

              const invokeResult = provider === "asaas"
                ? await supabase.functions.invoke("asaas-nfse", {
                    body: {
                      action: "create_payment",
                      invoice_id: newInvoice.id,
                      billing_type: paymentType === "pix" ? "PIX" : "BOLETO",
                    },
                  })
                : await supabase.functions.invoke("banco-inter", {
                    body: {
                      invoice_id: newInvoice.id,
                      payment_type: paymentType,
                    },
                  });

              if (invokeResult.error) {
                throw new Error(
                  `Erro ao gerar ${paymentType} via ${provider}: ${invokeResult.error.message || JSON.stringify(invokeResult.error)}`
                );
              }

              const responseData = invokeResult.data as unknown as Record<string, unknown> | null;
              if (responseData?.error) {
                throw new Error(
                  `Provedor ${provider} retornou erro: ${String(responseData.error)}`
                );
              }
            }

            // Update invoice to mark payment as generated - NÃO sobrescrever boleto_status
            // O status correto é definido pela função banco-inter/asaas baseado no resultado real
            await supabase
              .from("invoices")
              .update({
                auto_payment_generated: true,
              })
              .eq("id", newInvoice.id);

            console.log(`[GEN-INVOICES] Pagamento gerado para fatura #${newInvoice.invoice_number} (status definido pelo provedor)`);
          } catch (paymentError) {
            console.error(`[GEN-INVOICES] Erro ao gerar pagamento para ${contract.name}:`, paymentError);

            // Record payment error in invoice status
            await supabase
              .from("invoices")
              .update({
                boleto_status: "erro",
                boleto_error_msg: paymentError instanceof Error ? paymentError.message : "Erro ao gerar pagamento",
              })
              .eq("id", newInvoice.id);
          }
        }

        // Auto-emit NFS-e if contract has nfse_enabled
        if (contract.nfse_enabled) {
          try {
            const serviceDescription = contract.nfse_descricao_customizada
              || contract.description
              || `Prestação de serviços - ${contract.name}`;

            const { data: nfseResult, error: nfseError } = await supabase.functions.invoke("asaas-nfse", {
              body: {
                action: "emit",
                client_id: contract.client_id,
                invoice_id: newInvoice.id,
                contract_id: contract.id,
                value: totalAmount,
                service_description: serviceDescription,
                municipal_service_code: contract.nfse_service_code || undefined,
              },
            });

            if (nfseError) {
              console.error(`[GEN-INVOICES] Erro ao emitir NFS-e para ${contract.name}:`, nfseError);

              // Record NFS-e error in invoice status
              await supabase
                .from("invoices")
                .update({
                  nfse_status: "erro",
                  nfse_error_msg: nfseError.message || "Erro ao emitir NFS-e",
                })
                .eq("id", newInvoice.id);
            } else {
              const nfseSuccess = nfseResult?.success === true;
              console.log(`[GEN-INVOICES] NFS-e emitida para fatura #${newInvoice.invoice_number}:`, nfseSuccess ? "OK" : nfseResult?.error || "sem resposta");

              // Record NFS-e status based on result
              await supabase
                .from("invoices")
                .update({
                  nfse_status: nfseSuccess ? "processando" : "erro",
                  nfse_error_msg: nfseSuccess ? null : (nfseResult?.error || "Resposta inesperada da API NFS-e"),
                })
                .eq("id", newInvoice.id);
            }
          } catch (nfseErr) {
            console.error(`[GEN-INVOICES] Exceção ao emitir NFS-e para ${contract.name}:`, nfseErr);

            // Record NFS-e exception in invoice status
            await supabase
              .from("invoices")
              .update({
                nfse_status: "erro",
                nfse_error_msg: nfseErr instanceof Error ? nfseErr.message : "Exceção ao emitir NFS-e",
              })
              .eq("id", newInvoice.id);
          }
        }

        // Send notification to client if email is available
        const clientEmail = contract.clients?.financial_email || contract.clients?.email;
        if (clientEmail) {
          try {
            const { data: smtpSettings } = await supabase
              .from("integration_settings")
              .select("is_active")
              .eq("integration_type", "smtp")
              .single();

            if (smtpSettings?.is_active) {
              // Re-fetch invoice to get boleto data (may have been set by banco-inter/asaas)
              const { data: updatedInvoice } = await supabase
                .from("invoices")
                .select("boleto_url, boleto_barcode, pix_code")
                .eq("id", newInvoice.id)
                .single();

              // Generate signed URL for boleto PDF if available
              let boletoSignedUrl = "";
              if (updatedInvoice?.boleto_url) {
                const storedPath = updatedInvoice.boleto_url;
                if (!storedPath.startsWith("http")) {
                  const bucketName = storedPath.startsWith("invoice-documents/") ? "invoice-documents" : "nfse-files";
                  const objectPath = storedPath.startsWith("invoice-documents/") 
                    ? storedPath.replace("invoice-documents/", "") 
                    : storedPath;
                  const { data: signedData } = await supabase.storage
                    .from(bucketName)
                    .createSignedUrl(objectPath, 604800); // 7 dias
                  boletoSignedUrl = signedData?.signedUrl || "";
                } else {
                  boletoSignedUrl = storedPath;
                }
              }

              // Build custom message if available
              let customSection = "";
              if (contract.notification_message) {
                customSection = contract.notification_message
                  .replace(/{cliente}/g, contract.clients?.name || "Cliente")
                  .replace(/{valor}/g, `R$ ${totalAmount.toFixed(2)}`)
                  .replace(/{vencimento}/g, new Date(dueDate).toLocaleDateString("pt-BR"))
                  .replace(/{fatura}/g, `#${newInvoice.invoice_number}`)
                  .replace(/{competencia}/g, referenceMonth);

                customSection = `<div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 20px 0;">${customSection}</div>`;
              }

              // Build payment section for email
              let paymentSection = "";
              if (boletoSignedUrl || updatedInvoice?.boleto_barcode) {
                paymentSection += `
                  <div style="margin: 20px 0;">
                    <h3>📋 Boleto Bancário</h3>
                    ${boletoSignedUrl ? `<p><a href="${boletoSignedUrl}" style="display: inline-block; padding: 12px 24px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px;">📄 Visualizar Boleto PDF</a></p>` : ""}
                    ${updatedInvoice?.boleto_barcode ? `
                      <p style="margin-top: 15px;"><strong>Linha Digitável:</strong></p>
                      <code style="display: block; background: #f3f4f6; padding: 12px; font-family: monospace; font-size: 12px; word-break: break-all; border-radius: 4px;">${updatedInvoice.boleto_barcode}</code>
                    ` : ""}
                  </div>`;
              }
              if (updatedInvoice?.pix_code) {
                paymentSection += `
                  <div style="margin: 20px 0;">
                    <h3>📱 PIX Copia e Cola</h3>
                    <code style="display: block; background: #f3f4f6; padding: 12px; font-family: monospace; font-size: 11px; word-break: break-all; border-radius: 4px;">${updatedInvoice.pix_code}</code>
                    <p style="font-size: 12px; color: #6b7280; margin-top: 10px;">Copie o código acima e cole no app do seu banco na opção "PIX Copia e Cola".</p>
                  </div>`;
              }

              await supabase.functions.invoke("send-email-smtp", {
                body: {
                  to: clientEmail,
                  subject: `Nova Fatura #${newInvoice.invoice_number} - ${referenceMonth}`,
                  html: `
                    <h2>Nova Fatura Disponível</h2>
                    <p>Olá,</p>
                    <p>Uma nova fatura foi gerada para o contrato <strong>${contract.name}</strong>.</p>
                    <table style="border-collapse: collapse; margin: 20px 0;">
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Número:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">#${newInvoice.invoice_number}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Competência:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${referenceMonth}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Valor:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">R$ ${totalAmount.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Vencimento:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(dueDate).toLocaleDateString("pt-BR")}</td>
                      </tr>
                    </table>
                    ${customSection}
                    ${paymentSection || "<p>Em breve você receberá os dados para pagamento.</p>"}
                    <hr>
                    <p style="color: #666; font-size: 12px;">
                      Este é um email automático. Em caso de dúvidas, entre em contato conosco.
                    </p>
                  `,
                },
              });
              console.log(`[GEN-INVOICES] Email enviado para ${clientEmail}`);

              // Record email success in invoice status
              await supabase
                .from("invoices")
                .update({
                  email_status: "enviado",
                  email_sent_at: new Date().toISOString(),
                })
                .eq("id", newInvoice.id);
            }
          } catch (emailError) {
            console.error(`[GEN-INVOICES] Erro ao enviar email para ${clientEmail}:`, emailError);

            // Record email error in invoice status
            await supabase
              .from("invoices")
              .update({
                email_status: "erro",
                email_error_msg: emailError instanceof Error ? emailError.message : "Erro ao enviar email",
              })
              .eq("id", newInvoice.id);
          }
        }

        // Create notification for staff
        const { data: staffUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "financial"]);

        if (staffUsers && staffUsers.length > 0) {
          const notifications = staffUsers.map((user) => ({
            user_id: user.user_id,
            type: "info",
            title: "Fatura Gerada Automaticamente",
            message: `Fatura #${newInvoice.invoice_number} gerada para ${contract.clients?.name || contract.name} - R$ ${totalAmount.toFixed(2)}${charges.length > 0 ? ` (inclui ${charges.length} adicional(is))` : ""}`,
            related_type: "invoice",
            related_id: newInvoice.id,
          }));

          await supabase.from("notifications").insert(notifications);
        }
      } catch (contractError) {
        console.error(`[GEN-INVOICES] Erro ao processar contrato ${contract.name}:`, contractError);
        failed++;
        results.push({
          contract_id: contract.id,
          contract_name: contract.name,
          status: "error",
          invoice_id: null,
          invoice_number: null,
          error: contractError instanceof Error ? contractError.message : "Erro desconhecido",
          duration_ms: Date.now() - contractStartTime,
        });
        errors.push({
          contract_id: contract.id,
          contract_name: contract.name,
          code: "PROCESSING_ERROR",
          message: contractError instanceof Error ? contractError.message : "Erro desconhecido",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // ============ RETRY: Re-emitir NFS-e para faturas com erro no mês corrente ============
    let nfseRetried = 0;
    try {
      // Incluir TODAS as faturas com NFS-e em erro (contratos E avulsas)
      const { data: failedNfseInvoices } = await supabase
        .from("invoices")
        .select("id, client_id, contract_id, amount, invoice_number")
        .eq("reference_month", referenceMonth)
        .eq("nfse_status", "erro");

      if (failedNfseInvoices && failedNfseInvoices.length > 0) {
        console.log(`[GEN-INVOICES] RETRY: ${failedNfseInvoices.length} fatura(s) com NFS-e em erro para reprocessar`);

        for (const inv of failedNfseInvoices) {
          try {
            let serviceDescription: string | undefined;
            let serviceCode: string | undefined;

            if (inv.contract_id) {
              // Faturas de contrato: buscar código de serviço do contrato
              const { data: retryContract } = await supabase
                .from("contracts")
                .select("nfse_service_code, nfse_descricao_customizada, description, name, nfse_enabled")
                .eq("id", inv.contract_id)
                .single();

              if (!retryContract?.nfse_enabled) {
                console.log(`[GEN-INVOICES] RETRY: Contrato ${inv.contract_id} não tem NFS-e habilitada, pulando`);
                continue;
              }

              serviceDescription = retryContract.nfse_descricao_customizada
                || retryContract.description
                || `Prestação de serviços - ${retryContract.name}`;
              serviceCode = retryContract.nfse_service_code || undefined;
            } else {
              // Faturas avulsas: buscar código do nfse_history (codigo_tributacao)
              const { data: lastHistory } = await supabase
                .from("nfse_history")
                .select("codigo_tributacao, descricao_servico")
                .eq("invoice_id", inv.id)
                .eq("status", "erro")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              serviceCode = lastHistory?.codigo_tributacao || undefined;
              serviceDescription = lastHistory?.descricao_servico || "Serviços de TI";
            }

            // Marcar nfse_history antigos sem asaas_invoice_id como 'substituida'
            await supabase
              .from("nfse_history")
              .update({ status: "substituida", updated_at: new Date().toISOString() })
              .eq("invoice_id", inv.id)
              .is("asaas_invoice_id", null)
              .eq("status", "erro");

            // Reemitir (o auto-resolve da asaas-nfse cuida do código caso não tenha)
            const { error: retryError } = await supabase.functions.invoke("asaas-nfse", {
              body: {
                action: inv.contract_id ? "emit" : "emit_standalone",
                client_id: inv.client_id,
                invoice_id: inv.id,
                contract_id: inv.contract_id || undefined,
                value: inv.amount,
                service_description: serviceDescription,
                municipal_service_code: serviceCode,
                service_code: serviceCode,
              },
            });

            if (!retryError) {
              await supabase
                .from("invoices")
                .update({ nfse_status: "processando", nfse_error_msg: null })
                .eq("id", inv.id);
              nfseRetried++;
              console.log(`[GEN-INVOICES] RETRY: NFS-e reemitida para fatura #${inv.invoice_number}${inv.contract_id ? '' : ' (avulsa)'}`);
            } else {
              console.error(`[GEN-INVOICES] RETRY: Erro ao reemitir NFS-e para fatura #${inv.invoice_number}:`, retryError);
            }
          } catch (retryErr) {
            console.error(`[GEN-INVOICES] RETRY: Exceção ao reprocessar fatura ${inv.id}:`, retryErr);
          }
        }

        console.log(`[GEN-INVOICES] RETRY: ${nfseRetried} NFS-e(s) reemitida(s) com sucesso`);
      }
    } catch (retryBlockError) {
      console.error("[GEN-INVOICES] RETRY: Erro no bloco de retry:", retryBlockError);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[GEN-INVOICES] Concluído - Geradas: ${generated}, Ignoradas: ${skipped}, Falhas: ${failed}, NFS-e Retry: ${nfseRetried}`);

    // Log final result
    await logToDatabase(
      supabase,
      failed > 0 ? "warn" : "info",
      "Billing",
      "generate-monthly-invoices",
      `Geração concluída: ${generated} criadas, ${skipped} ignoradas, ${failed} falhas`,
      {
        reference_month: referenceMonth,
        total_contracts: contracts.length,
        generated,
        skipped,
        failed,
      },
      failed > 0 ? { errors } : undefined,
      executionId,
      totalDuration
    );

    const response: GenerationResponse = {
      success: failed === 0,
      message: `Geração de faturas concluída para ${referenceMonth}`,
      timestamp: new Date().toISOString(),
      execution_id: executionId,
      reference_month: referenceMonth,
      stats: {
        total_contracts: contracts.length,
        generated,
        skipped,
        failed,
      },
      results,
      errors,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[GEN-INVOICES] Erro geral:", error);
    
    const response: GenerationResponse = {
      success: false,
      message: error instanceof Error ? error.message : "Erro interno",
      timestamp: new Date().toISOString(),
      execution_id: executionId,
      reference_month: "",
      stats: { total_contracts: 0, generated: 0, skipped: 0, failed: 0 },
      results: [],
      errors: [{
        contract_id: "",
        contract_name: "",
        code: "GENERAL_ERROR",
        message: error instanceof Error ? error.message : "Erro interno",
        timestamp: new Date().toISOString(),
      }],
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
