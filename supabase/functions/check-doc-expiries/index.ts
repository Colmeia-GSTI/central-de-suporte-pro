import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.49.4/cors";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ExpirySource {
  table: string;
  alertType: string;
  dateField: string;
  alertDaysField: string | null;
  defaultAlertDays: number;
  titleFn: (row: Record<string, unknown>) => string;
}

const SOURCES: ExpirySource[] = [
  {
    table: "doc_licenses",
    alertType: "license",
    dateField: "expiry_date",
    alertDaysField: "alert_days",
    defaultAlertDays: 30,
    titleFn: (r) => `Licença ${r.product_name || "sem nome"} vencendo`,
  },
  {
    table: "doc_domains",
    alertType: "domain",
    dateField: "expiry_date",
    alertDaysField: "alert_days",
    defaultAlertDays: 30,
    titleFn: (r) => `Domínio ${r.domain || "sem nome"} vencendo`,
  },
  {
    table: "doc_internet_links",
    alertType: "link",
    dateField: "contract_expiry",
    alertDaysField: "alert_days",
    defaultAlertDays: 30,
    titleFn: (r) => `Contrato de internet ${r.provider || "sem nome"} vencendo`,
  },
  {
    table: "doc_software_erp",
    alertType: "software",
    dateField: "support_expiry",
    alertDaysField: null,
    defaultAlertDays: 30,
    titleFn: (r) => `Contrato de suporte ${r.name || ""}${r.vendor ? ` (${r.vendor})` : ""} vencendo`,
  },
  {
    table: "doc_external_providers",
    alertType: "provider",
    dateField: "contract_expiry",
    alertDaysField: null,
    defaultAlertDays: 30,
    titleFn: (r) => `Contrato ${r.service_type || ""}${r.company_name ? ` — ${r.company_name}` : ""} vencendo`,
  },
];

function getSeverity(daysRemaining: number): string {
  if (daysRemaining < 0) return "critical";
  if (daysRemaining <= 7) return "critical";
  if (daysRemaining <= 30) return "warning";
  return "info";
}

function getDescription(daysRemaining: number, expiryDate: string): string {
  if (daysRemaining < 0) return `Vencido há ${Math.abs(daysRemaining)} dias (${expiryDate})`;
  if (daysRemaining === 0) return `Vence hoje (${expiryDate})`;
  return `Vence em ${daysRemaining} dias (${expiryDate})`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalResolved = 0;

    for (const source of SOURCES) {
      // Fetch items with expiry dates
      const selectFields = `id, client_id, ${source.dateField}${source.alertDaysField ? `, ${source.alertDaysField}` : ""}`;
      // Add name fields based on table
      let extraFields = "";
      if (source.table === "doc_licenses") extraFields = ", product_name";
      else if (source.table === "doc_domains") extraFields = ", domain";
      else if (source.table === "doc_internet_links") extraFields = ", provider";
      else if (source.table === "doc_software_erp") extraFields = ", name, vendor";
      else if (source.table === "doc_external_providers") extraFields = ", company_name, service_type";

      const { data: items, error: fetchError } = await supabase
        .from(source.table)
        .select(selectFields + extraFields);

      if (fetchError) {
        console.error(`[check-doc-expiries] Error fetching ${source.table}:`, fetchError.message);
        continue;
      }

      if (!items || items.length === 0) continue;

      for (const item of items) {
        const expiryDateStr = item[source.dateField];
        if (!expiryDateStr) continue;

        const expiryDate = new Date(expiryDateStr + "T00:00:00Z");
        const diffMs = expiryDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        const alertDays = source.alertDaysField
          ? (item[source.alertDaysField] ?? source.defaultAlertDays)
          : source.defaultAlertDays;

        // Check existing active alert
        const { data: existingAlerts } = await supabase
          .from("doc_alerts")
          .select("id, status")
          .eq("reference_table", source.table)
          .eq("reference_id", item.id)
          .eq("status", "active")
          .limit(1);

        const existingAlert = existingAlerts?.[0];

        if (daysRemaining <= alertDays) {
          const severity = getSeverity(daysRemaining);
          const title = source.titleFn(item);
          const description = getDescription(daysRemaining, expiryDateStr);

          if (existingAlert) {
            // Update existing alert
            await supabase
              .from("doc_alerts")
              .update({ days_remaining: daysRemaining, severity, description, title })
              .eq("id", existingAlert.id);
            totalUpdated++;
          } else {
            // Create new alert
            const { error: insertError } = await supabase
              .from("doc_alerts")
              .insert({
                client_id: item.client_id,
                alert_type: source.alertType,
                reference_table: source.table,
                reference_id: item.id,
                title,
                description,
                expiry_date: expiryDateStr,
                days_remaining: daysRemaining,
                severity,
                status: "active",
              });

            if (!insertError) {
              totalCreated++;

              // Create notification for client technicians
              const { data: technicians } = await supabase
                .from("client_technicians")
                .select("user_id")
                .eq("client_id", item.client_id);

              if (technicians && technicians.length > 0) {
                const { data: client } = await supabase
                  .from("clients")
                  .select("name")
                  .eq("id", item.client_id)
                  .single();

                const notifications = technicians.map((t: { user_id: string }) => ({
                  user_id: t.user_id,
                  title,
                  message: `${client?.name || "Cliente"}: ${description}`,
                  type: "warning" as const,
                  related_type: "client",
                  related_id: item.client_id,
                }));

                // Check for existing notification to avoid duplicates
                for (const notif of notifications) {
                  const { data: existing } = await supabase
                    .from("notifications")
                    .select("id")
                    .eq("user_id", notif.user_id)
                    .eq("related_type", "client")
                    .eq("related_id", notif.related_id)
                    .eq("title", notif.title)
                    .eq("read", false)
                    .limit(1);

                  if (!existing || existing.length === 0) {
                    await supabase.from("notifications").insert(notif);
                  }
                }
              }
            }
          }
        } else {
          // Item no longer within alert threshold — resolve if active
          if (existingAlert) {
            await supabase
              .from("doc_alerts")
              .update({ status: "resolved" })
              .eq("id", existingAlert.id);
            totalResolved++;
          }
        }
      }
    }

    // Also resolve acknowledged alerts that are no longer relevant
    const { data: acknowledgedAlerts } = await supabase
      .from("doc_alerts")
      .select("id, reference_table, reference_id, expiry_date")
      .eq("status", "acknowledged");

    if (acknowledgedAlerts) {
      for (const alert of acknowledgedAlerts) {
        const expiryDate = new Date(alert.expiry_date + "T00:00:00Z");
        const diffMs = expiryDate.getTime() - today.getTime();
        const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // Resolve acknowledged alerts for items no longer expiring soon
        const sourceConfig = SOURCES.find((s) => s.table === alert.reference_table);
        if (sourceConfig && daysRemaining > sourceConfig.defaultAlertDays) {
          await supabase
            .from("doc_alerts")
            .update({ status: "resolved" })
            .eq("id", alert.id);
          totalResolved++;
        }
      }
    }

    const result = { created: totalCreated, updated: totalUpdated, resolved: totalResolved };
    console.log("[check-doc-expiries] Result:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[check-doc-expiries] Fatal error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
