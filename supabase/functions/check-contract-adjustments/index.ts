import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * CRON job to check contracts due for annual adjustment
 * Should be scheduled to run daily (e.g., at 07:00)
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
    console.log(`[CHECK-ADJUSTMENTS] Verificando contratos com reajuste em ${today}`);

    // Find contracts with adjustment_date = today
    const { data: contracts, error: contractsError } = await supabase
      .from("contracts")
      .select(`
        id,
        name,
        monthly_value,
        adjustment_index,
        adjustment_percentage,
        client_id,
        clients (name, email, financial_email)
      `)
      .eq("status", "active")
      .eq("adjustment_date", today);

    if (contractsError) {
      console.error("[CHECK-ADJUSTMENTS] Erro ao buscar contratos:", contractsError);
      return new Response(
        JSON.stringify({ success: false, error: contractsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!contracts || contracts.length === 0) {
      console.log("[CHECK-ADJUSTMENTS] Nenhum contrato para reajuste hoje");
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum contrato para reajuste hoje", checked: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[CHECK-ADJUSTMENTS] ${contracts.length} contratos encontrados para reajuste`);

    const results: { contract: string; status: string; message?: string }[] = [];

    for (const contract of contracts) {
      try {
        // For FIXO index, apply automatically
        // For others (IGPM, IPCA, INPC), create a notification for manual review
        if (contract.adjustment_index === "FIXO" && contract.adjustment_percentage) {
          // Auto-apply fixed percentage
          const response = await supabase.functions.invoke("apply-contract-adjustment", {
            body: {
              contract_id: contract.id,
              index_value: contract.adjustment_percentage,
              index_used: "FIXO",
              notes: "Reajuste automático - percentual fixo configurado",
            },
          });

          if (response.error) {
            throw new Error(response.error.message);
          }

          results.push({
            contract: contract.name,
            status: "applied",
            message: `Reajuste de ${contract.adjustment_percentage}% aplicado automaticamente`,
          });

          console.log(`[CHECK-ADJUSTMENTS] Reajuste aplicado para ${contract.name}`);
        } else {
          // Create notification for manual review
          const { data: staffUsers } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "financial"]);

          if (staffUsers && staffUsers.length > 0) {
            const clientName = (contract as any).clients?.name || contract.name;
            const notifications = staffUsers.map((user) => ({
              user_id: user.user_id,
              type: "warning",
              title: "Reajuste de Contrato Pendente",
              message: `O contrato "${contract.name}" (${clientName}) está devido para reajuste (${contract.adjustment_index}). Valor atual: R$ ${contract.monthly_value.toFixed(2)}`,
              related_type: "contract",
              related_id: contract.id,
            }));

            await supabase.from("notifications").insert(notifications);
          }

          results.push({
            contract: contract.name,
            status: "pending_review",
            message: `Notificação enviada para revisão manual (${contract.adjustment_index})`,
          });

          console.log(`[CHECK-ADJUSTMENTS] Notificação criada para ${contract.name}`);
        }
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
    const pending = results.filter((r) => r.status === "pending_review").length;
    const errors = results.filter((r) => r.status === "error").length;

    console.log(`[CHECK-ADJUSTMENTS] Concluído - Aplicados: ${applied}, Pendentes: ${pending}, Erros: ${errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Verificação de reajustes concluída",
        date: today,
        total_contracts: contracts.length,
        applied,
        pending_review: pending,
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
