import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Calcula e atualiza multa (2%) e juros (1% a.m.) para faturas vencidas.
 * Pode ser chamado via CRON ou manualmente.
 * 
 * Body:
 *   invoice_id?: string  - processar fatura específica
 *   fine_pct?: number     - percentual de multa (default 2%)
 *   interest_pct?: number - percentual de juros mensal (default 1%)
 *   dry_run?: boolean     - apenas calcular sem atualizar
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

    const body = await req.json().catch(() => ({}));
    const { invoice_id, fine_pct = 2.0, interest_pct = 1.0, dry_run = false } = body;

    console.log(`[CALC-PENALTIES] Iniciando. invoice_id=${invoice_id || "all"}, fine=${fine_pct}%, interest=${interest_pct}%, dry_run=${dry_run}`);

    // Find overdue invoices
    let query = supabase
      .from("invoices")
      .select("id, amount, due_date, fine_amount, interest_amount, client_id, invoice_number, clients(name)")
      .eq("status", "overdue");

    if (invoice_id) {
      query = query.eq("id", invoice_id);
    }

    const { data: invoices, error } = await query;
    if (error) throw error;

    if (!invoices || invoices.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhuma fatura vencida encontrada", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CALC-PENALTIES] ${invoices.length} faturas vencidas encontradas`);

    const results: { invoice_id: string; invoice_number: number; days_overdue: number; fine: number; interest: number; total: number }[] = [];
    let updated = 0;

    for (const inv of invoices) {
      const dueDate = new Date(inv.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      
      if (daysOverdue <= 0) continue;

      // Multa fixa (2% sobre o valor original)
      const fine = Math.round(inv.amount * (fine_pct / 100) * 100) / 100;
      
      // Juros pro-rata (1% a.m. = dias/30 * 1%)
      const interest = Math.round(inv.amount * (interest_pct / 100) * (daysOverdue / 30) * 100) / 100;
      
      const total = inv.amount + fine + interest;

      results.push({
        invoice_id: inv.id,
        invoice_number: inv.invoice_number,
        days_overdue: daysOverdue,
        fine,
        interest,
        total,
      });

      if (!dry_run) {
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            fine_amount: fine,
            interest_amount: interest,
          })
          .eq("id", inv.id);

        if (updateError) {
          console.error(`[CALC-PENALTIES] Erro ao atualizar fatura #${inv.invoice_number}:`, updateError);
        } else {
          updated++;
          console.log(`[CALC-PENALTIES] Fatura #${inv.invoice_number}: ${daysOverdue}d atraso, multa=${fine}, juros=${interest}, total=${total}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run,
        total_overdue: invoices.length,
        updated,
        fine_pct,
        interest_pct,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CALC-PENALTIES] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
