import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * CRON job to check contracts due for annual adjustment
 * Runs daily at 10h UTC. Sends progressive reminders:
 *  - D-30: info  ("Reajuste em 30 dias")
 *  - D-7:  warning ("Reajuste em 7 dias")
 *  - D-0:  apply (FIXO) or warning for manual review
 *  - D+1..D+30: daily warning ("Reajuste vencido")
 *
 * Idempotency: writes a row in contract_history (action='adjustment_reminder')
 * with the bucket name in changes.bucket so we never duplicate the same bucket
 * on the same day.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split("T")[0];
    console.log(`[CHECK-ADJUSTMENTS] Verificando contratos para ${today}`);

    // Fetch ALL active contracts with an adjustment_date set.
    // We compute the time bucket in code for flexibility.
    const { data: contracts, error: contractsError } = await supabase
      .from("contracts")
      .select(`
        id,
        name,
        monthly_value,
        adjustment_index,
        adjustment_percentage,
        adjustment_date,
        client_id,
        clients (name, email, financial_email)
      `)
      .eq("status", "active")
      .not("adjustment_date", "is", null);

    if (contractsError) {
      console.error("[CHECK-ADJUSTMENTS] Erro ao buscar contratos:", contractsError);
      return new Response(
        JSON.stringify({ success: false, error: contractsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contracts || contracts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum contrato ativo com data de reajuste", checked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pre-load staff users once
    const { data: staffUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "financial"]);

    const staffIds = (staffUsers || []).map((u) => u.user_id);

    const todayMs = new Date(today + "T00:00:00Z").getTime();
    const results: { contract: string; status: string; bucket?: string; message?: string }[] = [];

    for (const contract of contracts) {
      try {
        const adjMs = new Date(contract.adjustment_date + "T00:00:00Z").getTime();
        const diffDays = Math.round((adjMs - todayMs) / 86400000);

        // Determine bucket
        let bucket: "d-30" | "d-7" | "d-0" | "overdue" | null = null;
        if (diffDays === 30) bucket = "d-30";
        else if (diffDays === 7) bucket = "d-7";
        else if (diffDays === 0) bucket = "d-0";
        else if (diffDays < 0 && diffDays >= -30) bucket = "overdue";

        if (!bucket) continue;

        // Idempotency check: already notified this bucket today?
        const { data: existing } = await supabase
          .from("contract_history")
          .select("id")
          .eq("contract_id", contract.id)
          .eq("action", "adjustment_reminder")
          .gte("created_at", today + "T00:00:00Z")
          .lte("created_at", today + "T23:59:59Z")
          .contains("changes", { bucket })
          .limit(1);

        if (existing && existing.length > 0) {
          console.log(`[CHECK-ADJUSTMENTS] Já notificado hoje (${bucket}) para ${contract.name}`);
          continue;
        }

        // D-0 with FIXO: auto-apply
        if (bucket === "d-0" && contract.adjustment_index === "FIXO" && contract.adjustment_percentage) {
          const response = await supabase.functions.invoke("apply-contract-adjustment", {
            body: {
              contract_id: contract.id,
              index_value: contract.adjustment_percentage,
              index_used: "FIXO",
              notes: "Reajuste automático - percentual fixo configurado",
            },
          });
          if (response.error) throw new Error(response.error.message);

          // Idempotency: grava o mesmo marcador de bucket dos lembretes para o
          // d-0 aplicado hoje. Sem isso, o gate acima (action='adjustment_reminder'
          // + changes.bucket) nunca encontra registro para o FIXO e uma segunda
          // execução no mesmo dia reaplicaria o reajuste.
          await supabase.from("contract_history").insert({
            contract_id: contract.id,
            action: "adjustment_reminder",
            changes: { bucket, diff_days: diffDays, applied: true, adjustment_date: contract.adjustment_date },
            comment: "Reajuste FIXO aplicado automaticamente",
          });

          results.push({ contract: contract.name, status: "applied", bucket });
          continue;
        }

        // Build notification per bucket
        const clientName = (contract as any).clients?.name || contract.name;
        const valueStr = `R$ ${Number(contract.monthly_value).toFixed(2)}`;
        let type: "info" | "warning" = "info";
        let title = "";
        let message = "";

        if (bucket === "d-30") {
          type = "info";
          title = "Reajuste anual em 30 dias";
          message = `Contrato "${contract.name}" (${clientName}) será reajustado em 30 dias (${contract.adjustment_index}). Valor atual: ${valueStr}. Apure o índice acumulado.`;
        } else if (bucket === "d-7") {
          type = "warning";
          title = "Reajuste anual em 7 dias";
          message = `Contrato "${contract.name}" (${clientName}) precisa de reajuste em 7 dias (${contract.adjustment_index}). Valor atual: ${valueStr}.`;
        } else if (bucket === "d-0") {
          type = "warning";
          title = "Reajuste de contrato pendente";
          message = `O contrato "${contract.name}" (${clientName}) está devido para reajuste hoje (${contract.adjustment_index}). Valor atual: ${valueStr}.`;
        } else if (bucket === "overdue") {
          type = "warning";
          title = "Reajuste vencido";
          message = `Contrato "${contract.name}" (${clientName}) está com reajuste vencido há ${Math.abs(diffDays)} dia(s). Valor atual: ${valueStr}.`;
        }

        if (staffIds.length > 0) {
          const notifications = staffIds.map((user_id) => ({
            user_id,
            type,
            title,
            message,
            related_type: "contract",
            related_id: contract.id,
          }));
          await supabase.from("notifications").insert(notifications);
        }

        // Idempotency record
        await supabase.from("contract_history").insert({
          contract_id: contract.id,
          action: "adjustment_reminder",
          changes: { bucket, diff_days: diffDays, adjustment_date: contract.adjustment_date },
          comment: title,
        });

        results.push({ contract: contract.name, status: "notified", bucket, message: title });
        console.log(`[CHECK-ADJUSTMENTS] ${bucket} → ${contract.name}`);
      } catch (contractError) {
        console.error(`[CHECK-ADJUSTMENTS] Erro ao processar ${contract.name}:`, contractError);
        results.push({
          contract: contract.name,
          status: "error",
          message: contractError instanceof Error ? contractError.message : "Erro desconhecido",
        });
      }
    }

    const applied = results.filter((r) => r.status === "applied").length;
    const notified = results.filter((r) => r.status === "notified").length;
    const errors = results.filter((r) => r.status === "error").length;

    console.log(`[CHECK-ADJUSTMENTS] Concluído - Aplicados: ${applied}, Notificados: ${notified}, Erros: ${errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        scanned: contracts.length,
        applied,
        notified,
        errors,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CHECK-ADJUSTMENTS] Erro geral:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
