import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  payment_preference: string | null;
  nfse_enabled: boolean | null;
  clients: {
    name: string;
    email: string | null;
    financial_email: string | null;
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

    // Allow manual trigger with specific month/year or use current
    const body = await req.json().catch(() => ({}));
    const targetMonth = body.month || new Date().getMonth() + 1;
    const targetYear = body.year || new Date().getFullYear();
    const referenceMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;

    console.log(`[GEN-INVOICES] Gerando faturas para competência ${referenceMonth}`);

    // Fetch active contracts with client info
    const { data: contracts, error: contractsError } = await supabase
      .from("contracts")
      .select(`
        id,
        client_id,
        name,
        monthly_value,
        billing_day,
        payment_preference,
        nfse_enabled,
        clients (
          name,
          email,
          financial_email
        )
      `)
      .eq("status", "active")
      .gt("monthly_value", 0);

    if (contractsError) {
      console.error("[GEN-INVOICES] Erro ao buscar contratos:", contractsError);
      return new Response(
        JSON.stringify({ success: false, error: contractsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contracts || contracts.length === 0) {
      console.log("[GEN-INVOICES] Nenhum contrato ativo encontrado");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum contrato ativo", generated: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[GEN-INVOICES] ${contracts.length} contratos ativos encontrados`);

    let generated = 0;
    let skipped = 0;
    const results: { contract: string; status: string; invoice_id?: string; error?: string }[] = [];

    // Check if Banco Inter is configured
    const { data: bancoInterSettings } = await supabase
      .from("integration_settings")
      .select("is_active")
      .eq("integration_type", "banco_inter")
      .single();

    const bancoInterActive = bancoInterSettings?.is_active || false;

    for (const contract of contracts as unknown as Contract[]) {
      try {
        // Check if invoice already exists for this contract and month
        const { data: existingInvoice } = await supabase
          .from("invoices")
          .select("id")
          .eq("contract_id", contract.id)
          .gte("due_date", `${referenceMonth}-01`)
          .lt("due_date", `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-01`)
          .limit(1);

        if (existingInvoice && existingInvoice.length > 0) {
          console.log(`[GEN-INVOICES] Fatura já existe para contrato ${contract.name}`);
          skipped++;
          results.push({
            contract: contract.name,
            status: "skipped",
            invoice_id: existingInvoice[0].id,
          });
          continue;
        }

        // Calculate due date based on billing_day
        const billingDay = contract.billing_day || 10;
        const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
        const actualBillingDay = Math.min(billingDay, lastDayOfMonth);
        const dueDate = `${referenceMonth}-${String(actualBillingDay).padStart(2, "0")}`;

        // Create the invoice
        const { data: newInvoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            client_id: contract.client_id,
            contract_id: contract.id,
            amount: contract.monthly_value,
            due_date: dueDate,
            status: "pending",
            notes: `Fatura mensal - Contrato: ${contract.name} - Competência: ${referenceMonth}`,
            auto_payment_generated: false,
          })
          .select("id, invoice_number")
          .single();

        if (invoiceError) {
          console.error(`[GEN-INVOICES] Erro ao criar fatura para ${contract.name}:`, invoiceError);
          results.push({
            contract: contract.name,
            status: "error",
            error: invoiceError.message,
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

        console.log(`[GEN-INVOICES] Fatura #${newInvoice.invoice_number} criada para ${contract.name}`);
        generated++;

        // Log success
        await supabase.from("invoice_generation_log").insert({
          contract_id: contract.id,
          invoice_id: newInvoice.id,
          reference_month: referenceMonth,
          status: "success",
        });

        results.push({
          contract: contract.name,
          status: "created",
          invoice_id: newInvoice.id,
        });

        // Auto-generate payment if Banco Inter is active and preference is set
        if (bancoInterActive && contract.payment_preference) {
          try {
            const paymentTypes = contract.payment_preference === "both" 
              ? ["boleto", "pix"] 
              : [contract.payment_preference];

            for (const paymentType of paymentTypes) {
              console.log(`[GEN-INVOICES] Gerando ${paymentType} para fatura #${newInvoice.invoice_number}`);
              
              await supabase.functions.invoke("banco-inter", {
                body: {
                  invoice_id: newInvoice.id,
                  payment_type: paymentType,
                },
              });
            }

            // Update invoice to mark payment as generated
            await supabase
              .from("invoices")
              .update({ auto_payment_generated: true })
              .eq("id", newInvoice.id);
          } catch (paymentError) {
            console.error(`[GEN-INVOICES] Erro ao gerar pagamento para ${contract.name}:`, paymentError);
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
                        <td style="padding: 8px; border: 1px solid #ddd;">R$ ${contract.monthly_value.toFixed(2)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Vencimento:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(dueDate).toLocaleDateString("pt-BR")}</td>
                      </tr>
                    </table>
                    <p>Em breve você receberá os dados para pagamento.</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">
                      Este é um email automático. Em caso de dúvidas, entre em contato conosco.
                    </p>
                  `,
                },
              });
              console.log(`[GEN-INVOICES] Email enviado para ${clientEmail}`);
            }
          } catch (emailError) {
            console.error(`[GEN-INVOICES] Erro ao enviar email para ${clientEmail}:`, emailError);
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
            message: `Fatura #${newInvoice.invoice_number} gerada para ${contract.clients?.name || contract.name} - R$ ${contract.monthly_value.toFixed(2)}`,
            related_type: "invoice",
            related_id: newInvoice.id,
          }));

          await supabase.from("notifications").insert(notifications);
        }
      } catch (contractError) {
        console.error(`[GEN-INVOICES] Erro ao processar contrato ${contract.name}:`, contractError);
        results.push({
          contract: contract.name,
          status: "error",
          error: contractError instanceof Error ? contractError.message : "Erro desconhecido",
        });
      }
    }

    console.log(`[GEN-INVOICES] Concluído - Geradas: ${generated}, Ignoradas: ${skipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Geração de faturas concluída para ${referenceMonth}`,
        reference_month: referenceMonth,
        total_contracts: contracts.length,
        generated,
        skipped,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[GEN-INVOICES] Erro geral:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
