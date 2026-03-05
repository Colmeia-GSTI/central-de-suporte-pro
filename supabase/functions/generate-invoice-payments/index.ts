import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Invoice {
  id: string;
  invoice_number: number;
  client_id: string;
  contract_id: string | null;
  amount: number;
  due_date: string;
  boleto_url: string | null;
  pix_code: string | null;
  auto_payment_generated: boolean;
  clients: {
    name: string;
    email: string | null;
    financial_email: string | null;
  } | null;
  contracts: {
    name: string;
    payment_preference: string | null;
    billing_provider: string | null;
  } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { invoice_id, payment_type } = body;

    // If invoice_id is provided, process single invoice
    // Otherwise, process all pending invoices without payment
    let invoicesToProcess: Invoice[] = [];

    if (invoice_id) {
      console.log(`[GEN-PAYMENTS] Processando fatura específica: ${invoice_id}`);
      
      const { data: invoice, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          client_id,
          contract_id,
          amount,
          due_date,
          boleto_url,
          pix_code,
          auto_payment_generated,
          billing_provider,
          clients (
            name,
            email,
            financial_email
          ),
          contracts (
            name,
            payment_preference,
            billing_provider
          )
        `)
        .eq("id", invoice_id)
        .single();

      if (error || !invoice) {
        return new Response(
          JSON.stringify({ success: false, error: "Fatura não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      invoicesToProcess = [invoice as unknown as Invoice];
    } else {
      console.log("[GEN-PAYMENTS] Processando todas as faturas pendentes sem pagamento");
      
      const { data: invoices, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          client_id,
          contract_id,
          amount,
          due_date,
          boleto_url,
          pix_code,
          auto_payment_generated,
          billing_provider,
          clients (
            name,
            email,
            financial_email
          ),
          contracts (
            name,
            payment_preference,
            billing_provider
          )
        `)
        .eq("status", "pending")
        .eq("auto_payment_generated", false)
        .not("contract_id", "is", null);

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      invoicesToProcess = (invoices || []) as unknown as Invoice[];
    }

    if (invoicesToProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma fatura para processar", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check which billing providers are configured
    const { data: bancoInterSettings } = await supabase
      .from("integration_settings")
      .select("is_active, settings")
      .eq("integration_type", "banco_inter")
      .single();

    const { data: asaasSettings } = await supabase
      .from("integration_settings")
      .select("is_active")
      .eq("integration_type", "asaas")
      .single();

    const bancoInterActive = bancoInterSettings?.is_active || false;
    const asaasActive = asaasSettings?.is_active || false;

    if (!bancoInterActive && !asaasActive) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Nenhum provedor de pagamento configurado (Banco Inter ou Asaas)",
          configured: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[GEN-PAYMENTS] Processando ${invoicesToProcess.length} fatura(s). Banco Inter: ${bancoInterActive}, Asaas: ${asaasActive}`);

    let processed = 0;
    let errors = 0;
    const results: { invoice_id: string; invoice_number: number; status: string; payment_types?: string[]; error?: string }[] = [];

    for (const invoice of invoicesToProcess) {
      try {
        // Determine payment types
        let paymentTypes: string[] = [];
        
        if (payment_type) {
          paymentTypes = payment_type === "both" ? ["boleto", "pix"] : [payment_type];
        } else if (invoice.contracts?.payment_preference) {
          const pref = invoice.contracts.payment_preference;
          paymentTypes = pref === "both" ? ["boleto", "pix"] : [pref];
        } else {
          paymentTypes = ["boleto"]; // Default to boleto
        }

        // Skip if already has the payment type generated
        if (invoice.boleto_url && paymentTypes.includes("boleto")) {
          paymentTypes = paymentTypes.filter(t => t !== "boleto");
        }
        if (invoice.pix_code && paymentTypes.includes("pix")) {
          paymentTypes = paymentTypes.filter(t => t !== "pix");
        }

        if (paymentTypes.length === 0) {
          console.log(`[GEN-PAYMENTS] Fatura #${invoice.invoice_number} já possui pagamentos`);
          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            status: "skipped",
            payment_types: [],
          });
          continue;
        }

        const generatedTypes: string[] = [];

        // Determine billing provider: invoice > contract > default (banco_inter)
        const provider = (invoice as any).billing_provider || invoice.contracts?.billing_provider || "banco_inter";
        const providerActive = provider === "asaas" ? asaasActive : bancoInterActive;

        if (!providerActive) {
          console.log(`[GEN-PAYMENTS] Provedor ${provider} não está ativo, pulando fatura #${invoice.invoice_number}`);
          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            status: "skipped",
            error: `Provedor ${provider} não configurado`,
          });
          continue;
        }

        for (const pType of paymentTypes) {
          console.log(`[GEN-PAYMENTS] Gerando ${pType} via ${provider} para fatura #${invoice.invoice_number}`);
          
          let paymentResult, paymentError;
          
          if (provider === "asaas") {
            const response = await supabase.functions.invoke("asaas-nfse", {
              body: {
                action: "create_payment",
                invoice_id: invoice.id,
                billing_type: pType === "pix" ? "PIX" : "BOLETO",
              },
            });
            paymentResult = response.data;
            paymentError = response.error;
          } else {
            const response = await supabase.functions.invoke("banco-inter", {
              body: {
                invoice_id: invoice.id,
                payment_type: pType,
              },
            });
            paymentResult = response.data;
            paymentError = response.error;
          }

          if (paymentError) {
            console.error(`[GEN-PAYMENTS] Erro ao gerar ${pType}:`, paymentError);
          } else if (paymentResult?.success) {
            generatedTypes.push(pType);
          }
        }

        if (generatedTypes.length > 0) {
          // Mark invoice as payment generated
          await supabase
            .from("invoices")
            .update({ auto_payment_generated: true })
            .eq("id", invoice.id);

          processed++;
          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            status: "success",
            payment_types: generatedTypes,
          });

          // Send email to client with payment info
          const clientEmail = invoice.clients?.financial_email || invoice.clients?.email;
          if (clientEmail) {
            try {
              const { data: smtpSettings } = await supabase
                .from("integration_settings")
                .select("is_active")
                .eq("integration_type", "smtp")
                .single();

              if (smtpSettings?.is_active) {
                // Fetch updated invoice with payment data
                const { data: updatedInvoice } = await supabase
                  .from("invoices")
                  .select("boleto_url, pix_code, boleto_barcode")
                  .eq("id", invoice.id)
                  .single();

                let paymentHtml = "";
                if (updatedInvoice?.boleto_url) {
                  paymentHtml += `
                    <h3>Boleto Bancário</h3>
                    <p><a href="${updatedInvoice.boleto_url}" target="_blank">Clique aqui para visualizar o boleto</a></p>
                    ${updatedInvoice.boleto_barcode ? `<p><strong>Código de barras:</strong> ${updatedInvoice.boleto_barcode}</p>` : ""}
                  `;
                }
                if (updatedInvoice?.pix_code) {
                  paymentHtml += `
                    <h3>PIX</h3>
                    <p><strong>Código PIX (Copia e Cola):</strong></p>
                    <p style="background: #f5f5f5; padding: 10px; font-family: monospace; word-break: break-all;">
                      ${updatedInvoice.pix_code}
                    </p>
                  `;
                }

                await supabase.functions.invoke("send-email-resend", {
                  body: {
                    to: clientEmail,
                    subject: `Dados de Pagamento - Fatura #${invoice.invoice_number}`,
                    html: `
                      <h2>Dados de Pagamento Disponíveis</h2>
                      <p>Olá,</p>
                      <p>Seguem os dados para pagamento da fatura #${invoice.invoice_number}.</p>
                      <table style="border-collapse: collapse; margin: 20px 0;">
                        <tr>
                          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Valor:</strong></td>
                          <td style="padding: 8px; border: 1px solid #ddd;">R$ ${invoice.amount.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px; border: 1px solid #ddd;"><strong>Vencimento:</strong></td>
                          <td style="padding: 8px; border: 1px solid #ddd;">${new Date(invoice.due_date).toLocaleDateString("pt-BR")}</td>
                        </tr>
                      </table>
                      ${paymentHtml}
                      <hr>
                      <p style="color: #666; font-size: 12px;">
                        Este é um email automático. Em caso de dúvidas, entre em contato conosco.
                      </p>
                    `,
                  },
                });
                console.log(`[GEN-PAYMENTS] Email de pagamento enviado para ${clientEmail}`);
              }
            } catch (emailError) {
              console.error(`[GEN-PAYMENTS] Erro ao enviar email:`, emailError);
            }
          }
        } else {
          errors++;
          results.push({
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            status: "error",
            error: "Falha ao gerar pagamentos",
          });
        }
      } catch (invoiceError) {
        console.error(`[GEN-PAYMENTS] Erro ao processar fatura:`, invoiceError);
        errors++;
        results.push({
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          status: "error",
          error: invoiceError instanceof Error ? invoiceError.message : "Erro desconhecido",
        });
      }
    }

    console.log(`[GEN-PAYMENTS] Concluído - Processadas: ${processed}, Erros: ${errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Geração de pagamentos concluída",
        processed,
        errors,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[GEN-PAYMENTS] Erro geral:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
