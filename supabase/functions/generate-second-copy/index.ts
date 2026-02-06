import "npm:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role validation
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const roles = (userRoles || []).map((r: any) => r.role);
    const allowedRoles = ["admin", "financial", "client_master"];
    if (!roles.some((r: string) => allowedRoles.includes(r))) {
      return new Response(JSON.stringify({ error: "Sem permissão para gerar segunda via" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-second-copy] User: ${user.id}, Invoice: ${invoice_id}`);

    // Fetch invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, clients(name, document, email, address, city, state, zip_code)")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: "Fatura não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["pending", "overdue"].includes(invoice.status)) {
      return new Response(
        JSON.stringify({ error: `Fatura com status "${invoice.status}" não pode gerar segunda via` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate penalties
    const dueDate = new Date(invoice.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);

    let fineAmount = 0;
    let interestAmount = 0;

    if (today > dueDate) {
      const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      fineAmount = Number(invoice.amount) * 0.02; // 2% flat fine
      interestAmount = Number(invoice.amount) * 0.01 * (daysOverdue / 30); // 1% per month pro-rata
      interestAmount = Math.round(interestAmount * 100) / 100;
    }

    const totalAmount = Number(invoice.amount) + fineAmount + interestAmount;

    // Update invoice with penalties
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        fine_amount: fineAmount,
        interest_amount: interestAmount,
      })
      .eq("id", invoice_id);

    if (updateError) {
      console.error("[generate-second-copy] Update error:", updateError);
    }

    // Determine provider and generate new boleto
    const provider = invoice.billing_provider || "banco_inter";
    let boletoUrl = null;
    let boletoBarcode = null;

    // Set new due date (5 days from now)
    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() + 5);
    const formattedDueDate = newDueDate.toISOString().split("T")[0];

    if (provider === "asaas") {
      // Call asaas-nfse to create payment with updated amount
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke("asaas-nfse", {
        body: {
          action: "create_payment",
          invoice_id: invoice_id,
          billing_type: "BOLETO",
          override_value: totalAmount,
          override_due_date: formattedDueDate,
        },
      });

      if (paymentError) {
        console.error("[generate-second-copy] Asaas error:", paymentError);
        return new Response(JSON.stringify({ error: "Erro ao gerar boleto via Asaas" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      boletoUrl = paymentData?.boleto_url || paymentData?.bankSlipUrl;
      boletoBarcode = paymentData?.identificationField;
    } else {
      // Call banco-inter
      const { data: interData, error: interError } = await supabase.functions.invoke("banco-inter", {
        body: {
          invoice_id: invoice_id,
          payment_type: "boleto",
          override_value: totalAmount,
          override_due_date: formattedDueDate,
        },
      });

      if (interError) {
        console.error("[generate-second-copy] Inter error:", interError);
        return new Response(JSON.stringify({ error: "Erro ao gerar boleto via Banco Inter" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (interData?.error) {
        return new Response(JSON.stringify({ error: interData.error }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      boletoUrl = interData?.boleto_url;
      boletoBarcode = interData?.boleto_barcode || interData?.codigoBarras;
    }

    // Update invoice with new boleto data
    const updateData: Record<string, any> = {};
    if (boletoUrl) updateData.boleto_url = boletoUrl;
    if (boletoBarcode) updateData.boleto_barcode = boletoBarcode;

    if (Object.keys(updateData).length > 0) {
      await supabase.from("invoices").update(updateData).eq("id", invoice_id);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "second_copy_generated",
      table_name: "invoices",
      record_id: invoice_id,
      new_data: {
        fine_amount: fineAmount,
        interest_amount: interestAmount,
        total_amount: totalAmount,
        new_due_date: formattedDueDate,
        provider,
      },
    });

    console.log(`[generate-second-copy] Success: total=${totalAmount}, fine=${fineAmount}, interest=${interestAmount}`);

    return new Response(
      JSON.stringify({
        success: true,
        boleto_url: boletoUrl,
        boleto_barcode: boletoBarcode,
        fine_amount: fineAmount,
        interest_amount: interestAmount,
        total_amount: totalAmount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-second-copy] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
