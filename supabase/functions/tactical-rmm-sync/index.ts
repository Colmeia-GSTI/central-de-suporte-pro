import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SyncRequest {
  action: "test" | "sync" | "list_clients";
  client_id?: string;
}

interface TacticalRmmSettings {
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
      .eq("integration_type", "tactical_rmm")
      .maybeSingle();

    if (settingsError || !settingsData) {
      console.log("Tactical RMM integration not configured, skipping sync");
      return new Response(
        JSON.stringify({ 
          success: true,
          skipped: true,
          message: "Integração Tactical RMM não configurada",
          configured: false 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = settingsData.settings as TacticalRmmSettings;
    const { action, client_id }: SyncRequest = await req.json();

    // Allow testing even when disabled
    if (action !== "test" && !settingsData.is_active) {
      console.log("Tactical RMM integration disabled, skipping sync");
      return new Response(
        JSON.stringify({ 
          success: true,
          skipped: true,
          message: "Integração Tactical RMM desativada",
          configured: false 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.url || !settings.api_key) {
      console.log("Tactical RMM configuration incomplete, skipping sync");
      return new Response(
        JSON.stringify({ 
          success: true,
          skipped: true,
          message: "Configuração Tactical RMM incompleta. Preencha URL e API Key.",
          configured: false 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers = {
      "X-API-KEY": settings.api_key,
      "Content-Type": "application/json",
    };

    if (action === "test") {
      // Test connection by getting clients list
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const response = await fetch(`${settings.url}/clients/`, {
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: "Falha ao conectar com Tactical RMM" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Conexão válida" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "list_clients") {
      // Get clients list from Tactical RMM
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const response = await fetch(`${settings.url}/clients/`, {
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error("Erro ao buscar clientes do Tactical RMM");
      }

      const clients = await response.json();
      const formattedClients = clients.map((c: any) => ({
        id: c.id.toString(),
        name: c.name,
      }));

      return new Response(
        JSON.stringify({ success: true, clients: formattedClients }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "sync") {
      // Fetch all agents from Tactical RMM
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      
      const agentsResponse = await fetch(`${settings.url}/agents/`, {
        headers,
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (!agentsResponse.ok) {
        throw new Error("Erro ao buscar agentes do Tactical RMM");
      }

      const agents = await agentsResponse.json();

      // Get all client mappings for tactical_rmm
      const { data: mappings } = await supabase
        .from("client_external_mappings")
        .select("client_id, external_id, external_name")
        .eq("external_source", "tactical_rmm");

      // Create maps for both ID and name-based matching
      const clientMappingByExternalId = new Map(
        (mappings || []).map((m: any) => [m.external_id.toString(), m.client_id])
      );
      
      const clientMappingByExternalName = new Map(
        (mappings || []).filter((m: any) => m.external_name).map((m: any) => [m.external_name.toLowerCase(), m.client_id])
      );

      let synced = 0;
      let created = 0;
      let alerts = 0;
      let unmapped = 0;

      for (const agent of agents) {
        // Check if device exists - use .limit(1).single() pattern to handle potential duplicates
        const { data: existingList } = await supabase
          .from("monitored_devices")
          .select("id, client_id")
          .eq("external_id", agent.agent_id)
          .eq("external_source", "tactical_rmm")
          .limit(1);
        
        const existing = existingList && existingList.length > 0 ? existingList[0] : null;

        // Try to find client_id from mapping using multiple possible fields
        const agentClientId = (
          agent.client?.toString() || 
          agent.client_id?.toString() ||
          agent.site?.client?.toString() ||
          (typeof agent.client === 'object' ? agent.client?.id?.toString() : null)
        );
        
        // Also try to match by client name
        const agentClientName = (
          agent.client_name?.toLowerCase() ||
          (typeof agent.client === 'object' ? agent.client?.name?.toLowerCase() : null) ||
          agent.site?.client_name?.toLowerCase()
        );

        // First try by ID, then fallback to name
        let mappedClientId = agentClientId ? clientMappingByExternalId.get(agentClientId) : null;
        
        if (!mappedClientId && agentClientName) {
          mappedClientId = clientMappingByExternalName.get(agentClientName);
        }

        const deviceData: Record<string, any> = {
          name: agent.hostname || agent.agent_id,
          hostname: agent.hostname,
          ip_address: agent.local_ip || agent.public_ip,
          is_online: agent.status === "online",
          device_type: agent.plat || "computer",
          external_id: agent.agent_id,
          external_source: "tactical_rmm",
          last_seen_at: agent.last_seen ? new Date(agent.last_seen).toISOString() : null,
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

          // Check for alerts
          if (!agent.status || agent.status !== "online") {
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
                  title: `${agent.hostname} está offline`,
                  message: `O agente ${agent.hostname} não está respondendo no Tactical RMM.`,
                  level: agent.overdue_dashboard_alert ? "critical" : "warning",
                  status: "active",
                });
              alerts++;
            }
          } else {
            // Resolve alerts if device is online
            await supabase
              .from("monitoring_alerts")
              .update({ 
                status: "resolved", 
                resolved_at: new Date().toISOString() 
              })
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
            ? `${unmapped} dispositivos sem mapeamento de cliente. Configure os mapeamentos em Configurações > Mapeamentos.`
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