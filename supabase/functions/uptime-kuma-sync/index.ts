import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncRequest {
  action: "test" | "sync" | "list_clients";
}

interface UptimeKumaSettings {
  url: string;
  api_key: string;
  sync_interval_minutes: number;
}

const TIMEOUT_MS = 8000; // Timeout para APIs externas

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
      .eq("integration_type", "uptime_kuma")
      .maybeSingle();

    // For cron jobs, return success with skip message if not configured
    if (settingsError || !settingsData) {
      console.log("Uptime Kuma integration not configured, skipping sync");
      return new Response(
        JSON.stringify({ 
          success: true,
          skipped: true,
          message: "Integração Uptime Kuma não configurada",
          configured: false 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settingsData.is_active) {
      console.log("Uptime Kuma integration disabled, skipping sync");
      return new Response(
        JSON.stringify({ 
          success: true,
          skipped: true,
          message: "Integração Uptime Kuma desativada",
          configured: false 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = settingsData.settings as UptimeKumaSettings;

    if (!settings.url || !settings.api_key) {
      console.log("Uptime Kuma configuration incomplete, skipping sync");
      return new Response(
        JSON.stringify({ 
          success: true,
          skipped: true,
          message: "Configuração Uptime Kuma incompleta",
          configured: false 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action }: SyncRequest = await req.json();

    if (action === "test") {
      // Test connection by getting monitors list
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const response = await fetch(`${settings.url}/api/getMonitors`, {
        headers: {
          "Authorization": `Bearer ${settings.api_key}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: "Falha ao conectar com Uptime Kuma" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Conexão válida" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list_clients") {
      // For Uptime Kuma, we list "tags" as a way to group monitors by client
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const response = await fetch(`${settings.url}/api/getTags`, {
        headers: {
          "Authorization": `Bearer ${settings.api_key}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        // If tags API doesn't exist, return empty list
        return new Response(
          JSON.stringify({ success: true, clients: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tags = await response.json();
      const formattedClients = Object.entries(tags).map(([id, tag]: [string, any]) => ({
        id: id,
        name: tag.name || id,
      }));

      return new Response(
        JSON.stringify({ success: true, clients: formattedClients }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "sync") {
      // Fetch monitors from Uptime Kuma
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const monitorsResponse = await fetch(`${settings.url}/api/getMonitors`, {
        headers: {
          "Authorization": `Bearer ${settings.api_key}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (!monitorsResponse.ok) {
        throw new Error("Erro ao buscar monitores do Uptime Kuma");
      }

      const monitors = await monitorsResponse.json();

      // Get all client mappings for uptime_kuma
      const { data: mappings } = await supabase
        .from("client_external_mappings")
        .select("client_id, external_id")
        .eq("external_source", "uptime_kuma");

      const clientMappingByExternalId = new Map(
        (mappings || []).map((m: any) => [m.external_id.toString(), m.client_id])
      );

      let synced = 0;
      let created = 0;
      let alerts = 0;
      let unmapped = 0;

      // Process each monitor and update/create in monitored_devices
      for (const [monitorId, monitor] of Object.entries(monitors)) {
        const m = monitor as any;
        
        // Try to find client_id from mapping using monitor tags
        let mappedClientId: string | null = null;
        
        // Check if monitor has tags that match our mappings
        if (m.tags && Array.isArray(m.tags)) {
          for (const tag of m.tags) {
            const tagId = tag.tag_id?.toString() || tag.id?.toString();
            if (tagId && clientMappingByExternalId.has(tagId)) {
              mappedClientId = clientMappingByExternalId.get(tagId) || null;
              break;
            }
          }
        }
        
        // Also check the monitor ID itself as external_id
        if (!mappedClientId && clientMappingByExternalId.has(monitorId)) {
          mappedClientId = clientMappingByExternalId.get(monitorId) || null;
        }

        // Check if device exists
        const { data: existing } = await supabase
          .from("monitored_devices")
          .select("id, client_id")
          .eq("external_id", monitorId)
          .eq("external_source", "uptime_kuma")
          .maybeSingle();

        const deviceData: Record<string, any> = {
          name: m.name,
          hostname: m.hostname || m.url,
          is_online: m.active && m.status === 1,
          device_type: m.type || "service",
          external_id: monitorId,
          external_source: "uptime_kuma",
          uptime_percent: m.uptime || null,
          last_seen_at: m.lastHeartbeat ? new Date(m.lastHeartbeat).toISOString() : null,
          updated_at: new Date().toISOString(),
        };

        if (existing) {
          // Update client_id if mapping available
          if (mappedClientId && existing.client_id !== mappedClientId) {
            deviceData.client_id = mappedClientId;
          }
          
          // Update existing device
          await supabase
            .from("monitored_devices")
            .update(deviceData)
            .eq("id", existing.id);
          synced++;

          // Create alerts for down monitors
          if (m.status !== 1) {
            // Check if there's already an active alert
            const { data: existingAlert } = await supabase
              .from("monitoring_alerts")
              .select("id")
              .eq("device_id", existing.id)
              .eq("status", "active")
              .maybeSingle();

            if (!existingAlert) {
              await supabase
                .from("monitoring_alerts")
                .insert({
                  device_id: existing.id,
                  title: `${m.name} está offline`,
                  message: `O monitor ${m.name} foi detectado como offline pelo Uptime Kuma.`,
                  level: "critical",
                  status: "active",
                });
              alerts++;
            }
          } else {
            // Resolve active alerts if monitor is back online
            await supabase
              .from("monitoring_alerts")
              .update({ status: "resolved", resolved_at: new Date().toISOString() })
              .eq("device_id", existing.id)
              .eq("status", "active");
          }
        } else {
          // Create new device - only if we have a client mapping
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

      return new Response(
        JSON.stringify({ 
          success: true, 
          synced, 
          created,
          unmapped,
          alerts_created: alerts,
          message: unmapped > 0 
            ? `${unmapped} monitores sem mapeamento de cliente. Configure os mapeamentos em Configurações > Mapeamentos.`
            : undefined
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Ação inválida");
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});