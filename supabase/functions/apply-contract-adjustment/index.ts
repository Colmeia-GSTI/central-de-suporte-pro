import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdjustmentRequest {
  contract_id: string;
  index_value: number;
  index_used?: string;
  notes?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: AdjustmentRequest = await req.json();
    const { contract_id, index_value, index_used, notes } = body;

    if (!contract_id || typeof index_value !== "number" || index_value <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "contract_id e index_value são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[APPLY-ADJUSTMENT] Aplicando reajuste de ${index_value}% ao contrato ${contract_id}`);

    // 1. Fetch current contract
    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select(`
        id,
        name,
        monthly_value,
        adjustment_index,
        client_id,
        clients (name)
      `)
      .eq("id", contract_id)
      .single();

    if (contractError || !contract) {
      return new Response(
        JSON.stringify({ success: false, error: "Contrato não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const multiplier = 1 + index_value / 100;
    const newMonthlyValue = contract.monthly_value * multiplier;
    const usedIndex = index_used || contract.adjustment_index || "IGPM";

    // 2. Record adjustment in history
    const { error: adjustmentError } = await supabase
      .from("contract_adjustments")
      .insert({
        contract_id,
        adjustment_date: new Date().toISOString().split("T")[0],
        index_used: usedIndex,
        index_value,
        old_monthly_value: contract.monthly_value,
        new_monthly_value: newMonthlyValue,
        notes: notes || null,
      });

    if (adjustmentError) {
      console.error("[APPLY-ADJUSTMENT] Erro ao registrar histórico:", adjustmentError);
      throw adjustmentError;
    }

    // 3. Update contract value and next adjustment date (1 year from now)
    const nextAdjustmentDate = new Date();
    nextAdjustmentDate.setFullYear(nextAdjustmentDate.getFullYear() + 1);

    const { error: updateError } = await supabase
      .from("contracts")
      .update({
        monthly_value: newMonthlyValue,
        adjustment_date: nextAdjustmentDate.toISOString().split("T")[0],
        adjustment_index: usedIndex,
      })
      .eq("id", contract_id);

    if (updateError) {
      console.error("[APPLY-ADJUSTMENT] Erro ao atualizar contrato:", updateError);
      throw updateError;
    }

    // 4. Update contract_services proportionally
    const { data: services, error: servicesError } = await supabase
      .from("contract_services")
      .select("id, unit_value, quantity")
      .eq("contract_id", contract_id);

    if (servicesError) {
      console.error("[APPLY-ADJUSTMENT] Erro ao buscar serviços:", servicesError);
    } else if (services && services.length > 0) {
      for (const service of services) {
        const newUnitValue = (service.unit_value || 0) * multiplier;
        await supabase
          .from("contract_services")
          .update({
            unit_value: newUnitValue,
            value: newUnitValue * (service.quantity || 1),
          })
          .eq("id", service.id);
      }
      console.log(`[APPLY-ADJUSTMENT] ${services.length} serviços atualizados`);
    }

    // 5. Register in contract_history
    await supabase.from("contract_history").insert({
      contract_id,
      action: "adjustment",
      changes: {
        type: "adjustment",
        index: usedIndex,
        percentage: index_value,
        old_value: contract.monthly_value,
        new_value: newMonthlyValue,
      },
      comment: `Reajuste anual de ${index_value.toFixed(2)}% (${usedIndex})`,
    });

    // 6. Create notification for staff
    const { data: staffUsers } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "financial"]);

    if (staffUsers && staffUsers.length > 0) {
      const clientName = (contract as any).clients?.name || contract.name;
      const notifications = staffUsers.map((user) => ({
        user_id: user.user_id,
        type: "info",
        title: "Reajuste de Contrato Aplicado",
        message: `Contrato "${contract.name}" (${clientName}) reajustado em ${index_value.toFixed(2)}%. Novo valor: R$ ${newMonthlyValue.toFixed(2)}`,
        related_type: "contract",
        related_id: contract_id,
      }));

      await supabase.from("notifications").insert(notifications);
    }

    console.log(`[APPLY-ADJUSTMENT] Reajuste aplicado com sucesso. Novo valor: R$ ${newMonthlyValue.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Reajuste aplicado com sucesso",
        old_value: contract.monthly_value,
        new_value: newMonthlyValue,
        percentage: index_value,
        next_adjustment_date: nextAdjustmentDate.toISOString().split("T")[0],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[APPLY-ADJUSTMENT] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
