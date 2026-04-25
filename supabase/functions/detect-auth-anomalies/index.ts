import { adminClient, corsHeaders, jsonResponse, requireRole } from "../_shared/auth-helpers.ts";
import { detectAnomalies, totalAnomalies } from "./logic.ts";

const ADMIN_ROLES = ["admin"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Allow internal cron call via service-role key
  const isInternalCron = authHeader === `Bearer ${serviceKey}`;

  let callerId: string | null = null;
  if (!isInternalCron) {
    const auth = await requireRole(authHeader, ADMIN_ROLES);
    if (!auth.ok) {
      return jsonResponse({ error: auth.error, required_roles: ADMIN_ROLES }, auth.status ?? 401);
    }
    callerId = auth.userId ?? null;
  }

  const admin = adminClient();
  try {
    const report = await detectAnomalies(admin);
    const total = totalAnomalies(report);

    await admin.from("application_logs").insert({
      level: total > 0 ? "warning" : "info",
      module: "auth",
      action: "detect_anomalies",
      message: total > 0 ? `${total} anomalia(s) detectada(s)` : "Nenhuma anomalia",
      context: {
        orphans: report.orphans.length,
        zombies: report.zombies.length,
        unconfirmed_old: report.unconfirmed_old.length,
        roleless: report.roleless.length,
        triggered_by: isInternalCron ? "cron" : callerId,
      },
    });

    if (total > 0) {
      const { data: admins } = await admin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const notifications = (admins ?? []).map((a) => ({
        user_id: a.user_id,
        title: "Anomalias detectadas no cadastro de usuários",
        message: `${total} pendência(s) encontrada(s). Revise em /settings/users.`,
        type: "auth_anomaly",
        related_type: "auth_anomaly",
      }));
      if (notifications.length > 0) {
        await admin.from("notifications").insert(notifications);
      }
    }

    return jsonResponse({ success: true, total, report });
  } catch (e) {
    console.error("[detect-auth-anomalies] error:", e);
    return jsonResponse({ error: "Erro ao detectar anomalias" }, 500);
  }
});
