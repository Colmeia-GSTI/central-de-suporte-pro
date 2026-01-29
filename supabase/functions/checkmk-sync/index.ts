import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncRequest {
  action: "test" | "sync" | "list_folders";
}

interface CheckMkSettings {
  url: string;
  username: string;
  secret: string;
  sync_interval_hours: number;
  import_services: boolean;
  alert_levels: {
    crit: boolean;
    warn: boolean;
    unknown: boolean;
  };
}

const TIMEOUT_MS = 15000;

// Detect device type based on hostname or labels
function detectDeviceType(host: any): string {
  const name = (host.id || host.title || "").toLowerCase();
  const labels = host.extensions?.labels || {};

  // By explicit label (preference)
  if (labels["cmk/device_type"]) return labels["cmk/device_type"];

  // By naming convention
  if (name.startsWith("srv") || name.includes("server")) return "server";
  if (name.includes("print") || name.includes("imp")) return "printer";
  if (name.includes("cam") || name.includes("camera")) return "camera";
  if (name.startsWith("ap-") || name.includes("wifi") || name.includes("access")) return "access_point";
  if (name.startsWith("sw-") || name.includes("switch")) return "switch";
  if (name.includes("router") || name.includes("rtr")) return "router";
  if (name.includes("fw") || name.includes("firewall") || name.includes("pfsense") || name.includes("opnsense")) return "firewall";
  if (name.includes("ups") || name.includes("nobreak")) return "ups";
  if (name.includes("nas") || name.includes("storage")) return "server";

  return "other";
}

// Map CheckMK host state to is_online
function isHostOnline(hostState: number | string): boolean {
  // 0 = UP, 1 = DOWN, 2 = UNREACHABLE, -1 = PENDING
  return hostState === 0 || hostState === "0";
}

// Map CheckMK service state to alert level
function mapServiceStateToLevel(state: number): "critical" | "warning" | "info" {
  switch (state) {
    case 2: return "critical"; // CRIT
    case 1: return "warning";  // WARN
    case 3: return "info";     // UNKNOWN
    default: return "info";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get settings from database
    const { data: settingsData, error: settingsError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "checkmk")
      .maybeSingle();

    if (settingsError || !settingsData) {
      console.log("CheckMK integration not configured, skipping sync");
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: "Integração CheckMK não configurada",
          configured: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = settingsData.settings as CheckMkSettings;
    const { action }: SyncRequest = await req.json();

    // Allow testing even when disabled
    if (action !== "test" && !settingsData.is_active) {
      console.log("CheckMK integration disabled, skipping sync");
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: "Integração CheckMK desativada",
          configured: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.url || !settings.username || !settings.secret) {
      console.log("CheckMK configuration incomplete, skipping sync");
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          message: "Configuração CheckMK incompleta. Preencha URL, usuário e secret.",
          configured: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CheckMK REST API uses Bearer token auth with format: "username secret"
    const headers = {
      Authorization: `Bearer ${settings.username} ${settings.secret}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const baseUrl = settings.url.replace(/\/$/, "");

    if (action === "test") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(`${baseUrl}/api/1.0/domain-types/host_config/collections/all`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("CheckMK test failed:", response.status, errorText);
          return new Response(
            JSON.stringify({ error: `Falha ao conectar: ${response.status} ${response.statusText}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: "Conexão válida" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        clearTimeout(timeout);
        console.error("CheckMK test error:", e);
        return new Response(
          JSON.stringify({ error: e.name === "AbortError" ? "Timeout ao conectar" : e.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "list_folders") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const response = await fetch(`${baseUrl}/api/1.0/domain-types/folder_config/collections/all?recursive=true`, {
          headers,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          return new Response(
            JSON.stringify({ success: true, clients: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const data = await response.json();
        const folders = data.value || [];

        const formattedClients = folders
          .filter((f: any) => f.id !== "~") // Exclude root folder
          .map((f: any) => ({
            id: f.id || f.extensions?.path || f.title,
            name: f.title || f.id,
          }));

        return new Response(
          JSON.stringify({ success: true, clients: formattedClients }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (e: any) {
        clearTimeout(timeout);
        console.error("CheckMK list_folders error:", e);
        return new Response(
          JSON.stringify({ success: true, clients: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (action === "sync") {
      console.log("Starting CheckMK sync...");

      // Fetch all hosts
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let hosts: any[] = [];
      try {
        const hostsResponse = await fetch(
          `${baseUrl}/api/1.0/domain-types/host_config/collections/all?effective_attributes=true`,
          { headers, signal: controller.signal }
        );
        clearTimeout(timeout);

        if (!hostsResponse.ok) {
          throw new Error(`Erro ao buscar hosts: ${hostsResponse.status}`);
        }

        const hostsData = await hostsResponse.json();
        hosts = hostsData.value || [];
        console.log(`Found ${hosts.length} hosts in CheckMK`);
      } catch (e: any) {
        clearTimeout(timeout);
        throw new Error(e.name === "AbortError" ? "Timeout ao buscar hosts" : e.message);
      }

      // Get host states
      let hostStates: Record<string, any> = {};
      try {
        const statesController = new AbortController();
        const statesTimeout = setTimeout(() => statesController.abort(), TIMEOUT_MS);

        const statesResponse = await fetch(
          `${baseUrl}/api/1.0/domain-types/host/collections/all`,
          { headers, signal: statesController.signal }
        );
        clearTimeout(statesTimeout);

        if (statesResponse.ok) {
          const statesData = await statesResponse.json();
          (statesData.value || []).forEach((h: any) => {
            hostStates[h.id] = h.extensions || {};
          });
        }
      } catch (e) {
        console.warn("Could not fetch host states, using defaults");
      }

      // Get service problems for servers (only if import_services is enabled)
      let serviceProblems: Map<string, any[]> = new Map();
      let serviceCounters: Map<string, { ok: number; warn: number; crit: number; unknown: number }> = new Map();

      if (settings.import_services !== false) {
        try {
          const servicesController = new AbortController();
          const servicesTimeout = setTimeout(() => servicesController.abort(), TIMEOUT_MS);

          // Get all services to count OK/WARN/CRIT
          const servicesResponse = await fetch(
            `${baseUrl}/api/1.0/domain-types/service/collections/all`,
            { headers, signal: servicesController.signal }
          );
          clearTimeout(servicesTimeout);

          if (servicesResponse.ok) {
            const servicesData = await servicesResponse.json();
            const services = servicesData.value || [];

            services.forEach((svc: any) => {
              const hostName = svc.extensions?.host_name || svc.id?.split("!")[0];
              const state = svc.extensions?.state ?? 0;

              if (!serviceCounters.has(hostName)) {
                serviceCounters.set(hostName, { ok: 0, warn: 0, crit: 0, unknown: 0 });
              }

              const counter = serviceCounters.get(hostName)!;
              switch (state) {
                case 0: counter.ok++; break;
                case 1: counter.warn++; break;
                case 2: counter.crit++; break;
                case 3: counter.unknown++; break;
              }

              // Track problems for alerts
              if (state !== 0) {
                const shouldImport =
                  (state === 2 && settings.alert_levels?.crit !== false) ||
                  (state === 1 && settings.alert_levels?.warn !== false) ||
                  (state === 3 && settings.alert_levels?.unknown === true);

                if (shouldImport) {
                  if (!serviceProblems.has(hostName)) {
                    serviceProblems.set(hostName, []);
                  }
                  serviceProblems.get(hostName)!.push({
                    service_name: svc.extensions?.description || svc.title || "Unknown",
                    state: state,
                    output: svc.extensions?.plugin_output || "",
                  });
                }
              }
            });
          }
        } catch (e) {
          console.warn("Could not fetch services:", e);
        }
      }

      // Get client mappings
      const { data: mappings } = await supabase
        .from("client_external_mappings")
        .select("client_id, external_id, external_name")
        .eq("external_source", "checkmk");

      const clientMappingByFolder = new Map(
        (mappings || []).map((m: any) => [m.external_id, m.client_id])
      );

      let synced = 0;
      let created = 0;
      let alerts = 0;
      let unmapped = 0;

      for (const host of hosts) {
        const hostName = host.id || host.title;
        const hostState = hostStates[hostName] || {};
        const folder = host.extensions?.folder || "~";
        const deviceType = detectDeviceType(host);
        const isServer = deviceType === "server";

        // Find client mapping by folder
        let mappedClientId = clientMappingByFolder.get(folder) || null;

        // Also try by folder path without leading ~
        if (!mappedClientId) {
          const cleanFolder = folder.replace(/^~\/?/, "");
          mappedClientId = clientMappingByFolder.get(cleanFolder) || null;
        }

        // Check if device exists
        const { data: existingList } = await supabase
          .from("monitored_devices")
          .select("id, client_id")
          .eq("external_id", hostName)
          .eq("external_source", "checkmk")
          .limit(1);

        const existing = existingList && existingList.length > 0 ? existingList[0] : null;

        const counters = serviceCounters.get(hostName);
        const serviceData: Record<string, any> = {};

        if (isServer && counters) {
          serviceData.services = counters;
          serviceData.last_check_at = new Date().toISOString();
        }

        const deviceData: Record<string, any> = {
          name: host.title || hostName,
          hostname: hostName,
          ip_address: host.extensions?.ipaddress || host.extensions?.attributes?.ipaddress || null,
          is_online: isHostOnline(hostState.state ?? 0),
          device_type: deviceType,
          external_id: hostName,
          external_source: "checkmk",
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          service_data: Object.keys(serviceData).length > 0 ? serviceData : {},
        };

        if (existing) {
          if (mappedClientId && existing.client_id !== mappedClientId) {
            deviceData.client_id = mappedClientId;
          }

          await supabase
            .from("monitored_devices")
            .update(deviceData)
            .eq("id", existing.id);
          synced++;

          // Handle alerts for this device
          const problems = serviceProblems.get(hostName) || [];

          if (!deviceData.is_online) {
            // Host down alert
            const { data: existingAlert } = await supabase
              .from("monitoring_alerts")
              .select("id")
              .eq("device_id", existing.id)
              .eq("status", "active")
              .eq("title", `${hostName} está offline`)
              .maybeSingle();

            if (!existingAlert) {
              await supabase.from("monitoring_alerts").insert({
                device_id: existing.id,
                title: `${hostName} está offline`,
                message: `O host ${hostName} não está respondendo no CheckMK.`,
                level: "critical",
                status: "active",
              });
              alerts++;
            }
          } else {
            // Resolve host down alerts
            await supabase
              .from("monitoring_alerts")
              .update({ status: "resolved", resolved_at: new Date().toISOString() })
              .eq("device_id", existing.id)
              .eq("status", "active")
              .like("title", `%está offline`);

            // Create service problem alerts
            for (const problem of problems) {
              const alertTitle = `${hostName}: ${problem.service_name}`;

              const { data: existingServiceAlert } = await supabase
                .from("monitoring_alerts")
                .select("id")
                .eq("device_id", existing.id)
                .eq("status", "active")
                .eq("title", alertTitle)
                .maybeSingle();

              if (!existingServiceAlert) {
                await supabase.from("monitoring_alerts").insert({
                  device_id: existing.id,
                  title: alertTitle,
                  message: problem.output.substring(0, 500),
                  level: mapServiceStateToLevel(problem.state),
                  status: "active",
                  service_name: problem.service_name,
                  check_output: problem.output.substring(0, 1000),
                });
                alerts++;
              }
            }
          }
        } else {
          if (mappedClientId) {
            deviceData.client_id = mappedClientId;
            const { error: insertError } = await supabase
              .from("monitored_devices")
              .insert(deviceData);

            if (!insertError) {
              created++;
            }
          } else {
            unmapped++;
          }
        }
      }

      console.log(`CheckMK sync complete: ${synced} updated, ${created} created, ${unmapped} unmapped, ${alerts} alerts`);

      return new Response(
        JSON.stringify({
          success: true,
          synced,
          created,
          unmapped,
          alerts_created: alerts,
          message: unmapped > 0
            ? `${unmapped} hosts sem mapeamento de cliente. Configure os mapeamentos em Configurações > Mapeamentos.`
            : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Ação inválida");
  } catch (error: any) {
    console.error("CheckMK sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
