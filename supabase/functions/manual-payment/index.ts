import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Registra baixa manual de pagamento de uma fatura.
 * 
 * Body:
 *   invoice_id: string (required)
 *   paid_amount: number (required)
 *   paid_date: string (YYYY-MM-DD, default: today)
 *   payment_method: string (e.g. "deposito", "dinheiro", "transferencia", "cheque")
 *   payment_notes: string
 *   emit_nfse: boolean (default: false) - emitir NFS-e automaticamente
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { invoice_id, paid_amount, paid_date, payment_method, payment_notes, emit_nfse } = body;

    if (!invoice_id || !paid_amount) {
      return new Response(
        JSON.stringify({ error: "invoice_id e paid_amount são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[MANUAL-PAYMENT] User ${user.id} registrando pagamento manual para fatura ${invoice_id}`);

    // Fetch invoice
    const { data: invoice, error: fetchError } = await supabase
      .from("invoices")
      .select("id, invoice_number, amount, status, client_id, contract_id, fine_amount, interest_amount")
      .eq("id", invoice_id)
      .single();

    if (fetchError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Fatura não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.status === "paid") {
      return new Response(
        JSON.stringify({ error: "Fatura já está paga" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.status === "cancelled") {
      return new Response(
        JSON.stringify({ error: "Fatura cancelada não pode receber pagamento" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const effectiveDate = paid_date || new Date().toISOString().split("T")[0];

    // Update invoice
    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_date: effectiveDate,
        paid_amount: paid_amount,
        payment_method: payment_method || "manual",
        manual_payment: true,
        payment_notes: payment_notes || null,
      })
      .eq("id", invoice_id);

    if (updateError) {
      console.error("[MANUAL-PAYMENT] Erro ao atualizar fatura:", updateError);
      throw updateError;
    }

    // Create financial entry
    await supabase.from("financial_entries").insert({
      client_id: invoice.client_id,
      invoice_id: invoice.id,
      type: "receita",
      amount: paid_amount,
      description: `Pagamento manual - Fatura #${invoice.invoice_number}`,
      entry_date: effectiveDate,
      is_paid: true,
      paid_date: effectiveDate,
      payment_method: payment_method || "manual",
      notes: payment_notes || null,
    });

    // Create audit log
    await supabase.from("audit_logs").insert({
      table_name: "invoices",
      record_id: invoice_id,
      action: "MANUAL_PAYMENT",
      user_id: user.id,
      new_data: {
        paid_amount,
        paid_date: effectiveDate,
        payment_method,
        payment_notes,
      },
    });

    console.log(`[MANUAL-PAYMENT] Fatura #${invoice.invoice_number} marcada como paga (manual). Valor: R$ ${paid_amount}`);

    // Optionally emit NFS-e
    if (emit_nfse && invoice.contract_id) {
      try {
        console.log(`[MANUAL-PAYMENT] Emitindo NFS-e para fatura #${invoice.invoice_number}`);
        
        const { data: contract } = await supabase
          .from("contracts")
          .select("name, description, nfse_descricao_customizada")
          .eq("id", invoice.contract_id)
          .single();

        await supabase.functions.invoke("asaas-nfse", {
          body: {
            action: "emit",
            client_id: invoice.client_id,
            invoice_id: invoice.id,
            contract_id: invoice.contract_id,
            value: paid_amount,
            service_description: contract?.nfse_descricao_customizada || contract?.description || `Prestação de serviços - ${contract?.name}`,
          },
        });

        await supabase
          .from("invoices")
          .update({ auto_nfse_emitted: true })
          .eq("id", invoice_id);

        console.log(`[MANUAL-PAYMENT] NFS-e emitida com sucesso`);
      } catch (nfseError) {
        console.error(`[MANUAL-PAYMENT] Erro ao emitir NFS-e:`, nfseError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Pagamento de R$ ${paid_amount.toFixed(2)} registrado para fatura #${invoice.invoice_number}`,
        invoice_id,
        paid_amount,
        paid_date: effectiveDate,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[MANUAL-PAYMENT] Erro:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
