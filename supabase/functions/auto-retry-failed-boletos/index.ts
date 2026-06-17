// Auto-retry de boletos com falha (boleto_status='erro', sem asaas_payment_id)
// Causa raiz: emissor (asaas/inter) pode retornar 5xx esporádico durante a geração
// mensal e o sistema não tinha rotina de retentativa — boleto ficava parado.
//
// Estratégia:
//  - busca faturas com boleto_status='erro' e asaas_payment_id IS NULL
//  - filtra por created_at > 30 min atrás (evita pegar erros "frescos" sendo tratados)
//  - filtra processing_attempts < 3 (limite duro de retentativas)
//  - se due_date < hoje (Asaas rejeita), reagenda para hoje + 3 dias úteis
//  - re-invoca asaas-nfse (action=create_payment) ou banco-inter conforme provider
//  - incrementa processing_attempts e loga em audit_logs
//
// Execução: pg_cron 4x/dia (08, 12, 16, 20 America/Sao_Paulo) ou invocação manual.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceRow {
  id: string;
  invoice_number: number;
  client_id: string;
  contract_id: string | null;
  due_date: string;
  amount: number;
  asaas_payment_id: string | null;
  billing_provider: string | null;
  payment_method: string | null;
  processing_attempts: number | null;
  boleto_error_msg: string | null;
  clients?: { name: string } | null;
  contracts?: { billing_provider: string | null } | null;
}

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const startedAt = new Date();
  const cutoffAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: pending, error: fetchErr } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, client_id, contract_id, due_date, amount,
      asaas_payment_id, billing_provider, payment_method,
      processing_attempts, boleto_error_msg,
      clients(name),
      contracts(billing_provider)
    `)
    .eq("boleto_status", "erro")
    .is("asaas_payment_id", null)
    .lt("created_at", cutoffAt)
    .or("processing_attempts.is.null,processing_attempts.lt.3")
    .in("status", ["pending", "overdue"])
    .order("created_at", { ascending: true })
    .limit(20);

  if (fetchErr) {
    console.error("[retry-boletos] fetch error", fetchErr);
    return new Response(JSON.stringify({ success: false, error: fetchErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const invoices = (pending ?? []) as InvoiceRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const inv of invoices) {
    const provider = inv.contracts?.billing_provider || inv.billing_provider || "asaas";
    const attemptNumber = (inv.processing_attempts ?? 0) + 1;
    const clientName = inv.clients?.name ?? "?";

    try {
      // Reagenda due_date se já passou (Asaas/Inter rejeitam datas no passado)
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const dueDate = new Date(inv.due_date + "T00:00:00Z");
      let newDueDate: string | null = null;
      if (dueDate < today) {
        newDueDate = addBusinessDays(today, 3).toISOString().slice(0, 10);
        await supabase
          .from("invoices")
          .update({ due_date: newDueDate, status: "pending" })
          .eq("id", inv.id);
      }

      // Re-invoca o provedor correto
      const invokeResult = provider === "inter"
        ? await supabase.functions.invoke("banco-inter", {
            body: { invoice_id: inv.id, payment_type: "boleto" },
          })
        : await supabase.functions.invoke("asaas-nfse", {
            body: { action: "create_payment", invoice_id: inv.id, billing_type: "BOLETO" },
          });

      if (invokeResult.error) {
        throw new Error(invokeResult.error.message || JSON.stringify(invokeResult.error));
      }
      const data = invokeResult.data as Record<string, unknown> | null;
      if (data?.error) {
        throw new Error(String(data.error));
      }

      // Sucesso: incrementa attempts e audita
      await supabase
        .from("invoices")
        .update({ processing_attempts: attemptNumber })
        .eq("id", inv.id);

      await supabase.from("audit_logs").insert({
        action: "boleto_auto_recovered",
        table_name: "invoices",
        record_id: inv.id,
        new_data: {
          invoice_number: inv.invoice_number,
          client_name: clientName,
          provider,
          attempt: attemptNumber,
          rescheduled_due_date: newDueDate,
          previous_error: inv.boleto_error_msg,
        },
      });

      results.push({ id: inv.id, invoice_number: inv.invoice_number, status: "recovered", attempt: attemptNumber });
      console.log(`[retry-boletos] OK #${inv.invoice_number} (${clientName}) attempt ${attemptNumber}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[retry-boletos] FAIL #${inv.invoice_number} (${clientName}) attempt ${attemptNumber}:`, errMsg);

      await supabase
        .from("invoices")
        .update({
          processing_attempts: attemptNumber,
          boleto_error_msg: `[retry ${attemptNumber}/3] ${errMsg}`,
        })
        .eq("id", inv.id);

      await supabase.from("application_logs").insert({
        module: "billing",
        level: "error",
        message: `Retry automático de boleto falhou (#${inv.invoice_number})`,
        context: {
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          client_name: clientName,
          provider,
          attempt: attemptNumber,
          error: errMsg,
        },
      });

      // 3ª falha consecutiva: alerta financeiro para ação manual
      if (attemptNumber >= 3) {
        await supabase.from("notifications").insert({
          title: "Boleto travado — ação manual necessária",
          message: `Fatura #${inv.invoice_number} (${clientName}) falhou 3 tentativas automáticas. Verifique no Painel de Saúde.`,
          type: "error",
          category: "billing",
          link: "/billing?tab=health",
        });
      }

      results.push({ id: inv.id, invoice_number: inv.invoice_number, status: "failed", attempt: attemptNumber, error: errMsg });
    }
  }

  const summary = {
    success: true,
    checked: invoices.length,
    recovered: results.filter((r) => r.status === "recovered").length,
    failed: results.filter((r) => r.status === "failed").length,
    duration_ms: Date.now() - startedAt.getTime(),
    results,
  };

  console.log("[retry-boletos] summary", summary);

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
