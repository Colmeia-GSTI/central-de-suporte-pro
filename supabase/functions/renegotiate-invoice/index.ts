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

    // Check role (admin or financial only)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (roles || []).map((r: any) => r.role);
    if (!userRoles.includes("admin") && !userRoles.includes("financial")) {
      return new Response(JSON.stringify({ error: "Permissão negada. Requer admin ou financeiro." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { invoice_id, number_of_installments, include_penalties } = await req.json();

    if (!invoice_id || !number_of_installments) {
      return new Response(JSON.stringify({ error: "invoice_id e number_of_installments são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (number_of_installments < 2 || number_of_installments > 12) {
      return new Response(JSON.stringify({ error: "Parcelas devem ser entre 2 e 12" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[renegotiate-invoice] User: ${user.id}, Invoice: ${invoice_id}, Installments: ${number_of_installments}`);

    // Fetch original invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: "Fatura não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (invoice.status !== "overdue") {
      return new Response(
        JSON.stringify({ error: `Apenas faturas vencidas podem ser renegociadas. Status atual: ${invoice.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate total
    const baseAmount = Number(invoice.amount);
    const penalties = include_penalties
      ? Number(invoice.fine_amount || 0) + Number(invoice.interest_amount || 0)
      : 0;
    const totalAmount = baseAmount + penalties;

    // Calculate installment values
    const installmentValue = Math.floor((totalAmount / number_of_installments) * 100) / 100;
    const lastInstallmentValue = Math.max(0.01, Math.round((totalAmount - installmentValue * (number_of_installments - 1)) * 100) / 100);

    // Generate new invoices
    const today = new Date();
    const newInvoices = [];

    // Get next invoice number
    const { data: lastInvoice } = await supabase
      .from("invoices")
      .select("invoice_number")
      .order("invoice_number", { ascending: false })
      .limit(1)
      .single();

    let nextNumber = (lastInvoice?.invoice_number || 0) + 1;

    for (let i = 0; i < number_of_installments; i++) {
      const dueDate = new Date(today);
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      // Keep same day or last day of month
      const dueDateStr = dueDate.toISOString().split("T")[0];

      newInvoices.push({
        client_id: invoice.client_id,
        contract_id: invoice.contract_id,
        invoice_number: nextNumber + i,
        amount: i === number_of_installments - 1 ? lastInstallmentValue : installmentValue,
        due_date: dueDateStr,
        status: "pending",
        payment_method: invoice.payment_method || "boleto",
        reference_month: invoice.reference_month,
        parent_invoice_id: invoice.id,
        installment_number: i + 1,
        total_installments: number_of_installments,
        billing_provider: invoice.billing_provider,
        notes: `Renegociação da fatura #${invoice.invoice_number} - Parcela ${i + 1}/${number_of_installments}`,
      });
    }

    // Insert new invoices
    const { data: createdInvoices, error: insertError } = await supabase
      .from("invoices")
      .insert(newInvoices)
      .select("id, invoice_number, amount, due_date, installment_number");

    if (insertError) {
      console.error("[renegotiate-invoice] Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Erro ao criar parcelas: " + insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark original invoice as renegotiated  
    const { error: cancelError } = await supabase
      .from("invoices")
      .update({ status: "renegotiated" })
      .eq("id", invoice_id);

    if (cancelError) {
      console.error("[renegotiate-invoice] Cancel error:", cancelError);
      // Rollback - delete created invoices
      if (createdInvoices && createdInvoices.length > 0) {
        await supabase
          .from("invoices")
          .delete()
          .in("id", createdInvoices.map((i: any) => i.id));
      }
      return new Response(JSON.stringify({ error: "Erro ao cancelar fatura original" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "invoice_renegotiated",
      table_name: "invoices",
      record_id: invoice_id,
      old_data: {
        original_amount: baseAmount,
        original_status: invoice.status,
      },
      new_data: {
        total_amount: totalAmount,
        include_penalties,
        penalties_amount: penalties,
        number_of_installments,
        installment_value: installmentValue,
        created_invoices: createdInvoices?.map((i: any) => i.id),
      },
    });

    console.log(`[renegotiate-invoice] Success: ${number_of_installments} parcelas criadas, fatura #${invoice.invoice_number} cancelada`);

    return new Response(
      JSON.stringify({
        success: true,
        original_invoice_id: invoice_id,
        original_invoice_number: invoice.invoice_number,
        total_amount: totalAmount,
        installments: createdInvoices,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[renegotiate-invoice] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
