import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEOUT_MS = 20000;

// Protected fields that should never be overwritten by sync
const PROTECTED_FIELDS = ["ram", "primary_user", "physical_location", "notes", "purpose", "context", "isolated"];

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function err(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Build upsert data respecting manual edits
function mergeWithProtection(newData: Record<string, unknown>, existing: Record<string, unknown> | null): Record<string, unknown> {
  if (!existing) return newData;
  const merged = { ...newData };
  for (const field of PROTECTED_FIELDS) {
    if (existing[field] != null && existing[field] !== "") {
      delete merged[field];
    }
  }
  // Track mixed source
  const existingSource = (existing.data_source as string) || "";
  const newSource = (newData.data_source as string) || "";
  if (existingSource.includes("+manual")) {
    merged.data_source = existingSource; // keep manual flag
  }
  return merged;
}

// ─── TRMM SYNC ────────────────────────────────────────────────────────────────
async function syncTrmm(supabase: ReturnType<typeof createClient>, clientId: string) {
  // Buscar mapeamento via client_external_mappings
  const { data: mapping } = await supabase
    .from("client_external_mappings")
    .select("external_id, external_name")
    .eq("client_id", clientId)
    .eq("external_source", "tactical_rmm")
    .maybeSingle();

  if (!mapping) {
    return { success: false, error: "Cliente não mapeado no Tactical RMM. Configure em Operações → Mapeamentos." };
  }

  // Get TRMM settings
  const { data: settings } = await supabase
    .from("integration_settings")
    .select("settings, is_active")
    .eq("integration_type", "tactical_rmm")
    .maybeSingle();

  if (!settings?.is_active || !settings.settings) {
    return { success: false, error: "Integração Tactical RMM não configurada ou desativada" };
  }

  const { url, api_key } = settings.settings as { url: string; api_key: string };
  if (!url || !api_key) {
    return { success: false, error: "URL ou API Key do TRMM não configurada" };
  }

  // Fetch agents
  const agentsRes = await fetchWithTimeout(`${url}/agents/`, {
    headers: { "X-API-KEY": api_key, "Content-Type": "application/json" },
  });
  if (!agentsRes.ok) throw new Error(`TRMM API error: ${agentsRes.status}`);
  const agents = await agentsRes.json();

  // Filtrar agentes pelo external_id numérico (mais robusto que nome)
  let clientAgents = agents.filter((a: unknown) => {
    const agent = a as Record<string, unknown>;
    const clientObj = agent.client as Record<string, unknown> | undefined;
    return String(agent.client_id ?? "") === String(mapping.external_id)
      || String(clientObj?.id ?? "") === String(mapping.external_id);
  });

  // Fallback por nome caso o ID não bata
  if (clientAgents.length === 0 && mapping.external_name) {
    clientAgents = agents.filter((a: unknown) => {
      const agent = a as Record<string, unknown>;
      const clientObj = agent.client as Record<string, unknown> | undefined;
      const name = (agent.client_name as string) || (clientObj?.name as string) || "";
      return name.toLowerCase() === (mapping.external_name as string).toLowerCase();
    });
  }

  // Get existing doc_devices for this client with trmm source
  const { data: existingDevices } = await supabase
    .from("doc_devices")
    .select("id, name, trmm_agent_id, data_source, ram, primary_user, physical_location, notes")
    .eq("client_id", clientId);

  const existingByAgentId = new Map((existingDevices || []).filter((d: any) => d.trmm_agent_id).map((d: any) => [d.trmm_agent_id, d]));
  const existingByName = new Map((existingDevices || []).filter((d: any) => !d.trmm_agent_id && d.name).map((d: any) => [d.name.toLowerCase(), d]));

  let synced = 0;
  const conflicts: string[] = [];

  for (const agent of clientAgents) {
    const agentId = agent.agent_id;
    const hostname = agent.hostname || agentId;
    const deviceType = agent.monitoring_type === "server" ? "server" : (agent.plat === "darwin" ? "notebook" : "workstation");

    const newData: Record<string, unknown> = {
      client_id: clientId,
      name: hostname,
      device_type: deviceType,
      brand_model: agent.make_model || null,
      serial_number: agent.serial_number || null,
      os: agent.operating_system || null,
      cpu: agent.cpu_model ? `${agent.cpu_model}` : null,
      disks: Array.isArray(agent.physical_disks) ? agent.physical_disks.map((d: any) => typeof d === "string" ? d : `${d.name || ""} ${d.size || ""}`).join(", ") : null,
      ip_local: Array.isArray(agent.local_ips) ? agent.local_ips.join(", ") : (agent.local_ip || null),
      status: agent.status || "unknown",
      last_seen: agent.last_seen || null,
      trmm_agent_id: agentId,
      data_source: "trmm",
    };

    const existing = existingByAgentId.get(agentId);
    if (existing) {
      const merged = mergeWithProtection(newData, existing);
      delete merged.client_id;
      await supabase.from("doc_devices").update(merged).eq("id", existing.id);
      synced++;
    } else {
      // Check for hostname conflict
      const conflict = existingByName.get(hostname.toLowerCase());
      if (conflict) {
        conflicts.push(hostname);
        continue;
      }
      await supabase.from("doc_devices").insert(newData);
      synced++;
    }
  }

  // Log sync
  await supabase.from("doc_sync_log").insert({
    client_id: clientId,
    source: "trmm",
    devices_synced: synced,
    details: { total_agents: clientAgents.length, conflicts },
    status: "success",
  });

  return { success: true, synced, conflicts, total: clientAgents.length };
}

// ─── UNIFI SYNC ───────────────────────────────────────────────────────────────
async function syncUnifi(supabase: ReturnType<typeof createClient>, clientId: string) {
  // Get UniFi controllers for this client
  const { data: controllers } = await supabase
    .from("unifi_controllers")
    .select("*")
    .eq("client_id", clientId)
    .eq("is_active", true);

  if (!controllers || controllers.length === 0) {
    return { success: false, error: "Nenhum controller UniFi configurado para este cliente" };
  }

  let totalDevices = 0;
  let totalVlans = 0;
  let totalFirewall = 0;
  let totalVpn = 0;

  for (const ctrl of controllers) {
    try {
      let cookie = "";
      let baseApiUrl = "";

      if (ctrl.connection_method === "direct") {
        if (!ctrl.url || !ctrl.username || !ctrl.password_encrypted) continue;
        const baseUrl = ctrl.url.replace(/\/$/, "");

        // Login
        const loginRes = await fetchWithTimeout(`${baseUrl}/api/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: ctrl.username, password: ctrl.password_encrypted }),
        });
        if (!loginRes.ok) { await loginRes.text(); continue; }
        const setCookie = loginRes.headers.get("set-cookie") || "";
        const match = setCookie.match(/unifises=([^;]+)/);
        if (!match) { await loginRes.json(); continue; }
        await loginRes.json();
        cookie = match[1];

        // Get sites
        const sitesRes = await fetchWithTimeout(`${baseUrl}/api/self/sites`, {
          headers: { Cookie: `unifises=${cookie}` },
        });
        if (!sitesRes.ok) { await sitesRes.text(); continue; }
        const sitesData = await sitesRes.json();
        const sites = sitesData.data || [];
        const siteCode = sites[0]?.name || "default";
        baseApiUrl = `${baseUrl}/api/s/${siteCode}`;

        // Sync devices
        const devicesRes = await fetchWithTimeout(`${baseApiUrl}/stat/device`, {
          headers: { Cookie: `unifises=${cookie}` },
        });
        if (devicesRes.ok) {
          const devData = await devicesRes.json();
          const devices = devData.data || [];
          totalDevices += await upsertUnifiDevices(supabase, clientId, devices);
        }

        // Sync VLANs
        const vlansRes = await fetchWithTimeout(`${baseApiUrl}/rest/networkconf`, {
          headers: { Cookie: `unifises=${cookie}` },
        });
        if (vlansRes.ok) {
          const vlansData = await vlansRes.json();
          const vlans = (vlansData.data || []).filter((v: any) => v.vlan_enabled || v.vlan);
          totalVlans += await upsertUnifiVlans(supabase, clientId, vlans);
        }

        // Sync firewall rules
        const fwRes = await fetchWithTimeout(`${baseApiUrl}/rest/firewallrule`, {
          headers: { Cookie: `unifises=${cookie}` },
        });
        if (fwRes.ok) {
          const fwData = await fwRes.json();
          totalFirewall += await upsertUnifiFirewall(supabase, clientId, fwData.data || []);
        }

        // Sync port forwards
        const pfRes = await fetchWithTimeout(`${baseApiUrl}/rest/portforward`, {
          headers: { Cookie: `unifises=${cookie}` },
        });
        if (pfRes.ok) {
          const pfData = await pfRes.json();
          totalFirewall += await upsertUnifiPortForwards(supabase, clientId, pfData.data || []);
        }

        // Sync VPNs from networkconf
        const vpnRes = await fetchWithTimeout(`${baseApiUrl}/rest/networkconf`, {
          headers: { Cookie: `unifises=${cookie}` },
        });
        if (vpnRes.ok) {
          const vpnData = await vpnRes.json();
          const vpnNetworks = (vpnData.data || []).filter((n: any) =>
            n.purpose === "vpn-client" || n.purpose === "site-vpn" || n.vpn_type
          );
          totalVpn += await upsertUnifiVpns(supabase, clientId, vpnNetworks);
        }

        // Logout
        try {
          const logoutRes = await fetchWithTimeout(`${baseUrl}/api/logout`, {
            method: "POST", headers: { Cookie: `unifises=${cookie}` },
          });
          await logoutRes.text();
        } catch { /* ignore */ }
      } else if (ctrl.connection_method === "cloud") {
        if (!ctrl.cloud_api_key_encrypted) continue;
        const apiKey = ctrl.cloud_api_key_encrypted;
        const hdrs = { "X-API-KEY": apiKey, Accept: "application/json" };

        // Get devices
        const devUrl = new URL("https://api.ui.com/v1/devices");
        if (ctrl.cloud_host_id) devUrl.searchParams.append("hostIds[]", ctrl.cloud_host_id);
        devUrl.searchParams.set("pageSize", "200");

        const devRes = await fetchWithTimeout(devUrl.toString(), { headers: hdrs });
        if (devRes.ok) {
          const devJson = await devRes.json();
          const rows = Array.isArray(devJson.data) ? devJson.data : [];
          // Parse cloud devices
          const parsedDevices = rows.map((d: any) => {
            const rs = d.reportedState || {};
            return {
              _id: d.id || d._id || rs.mac || "",
              name: d.name || rs.name || rs.hostname || rs.mac || "",
              type: d.type || rs.type || d.deviceType || "",
              model: d.model || d.shortModel || rs.model || rs.shortModel || "",
              mac: rs.mac || d.mac || "",
              ip: rs.ip || d.ip || "",
              version: rs.version || d.version || "",
              state: rs.state ?? d.state ?? 0,
              num_sta: rs.numSta || rs.num_sta || d.numSta || 0,
            };
          });
          totalDevices += await upsertUnifiDevices(supabase, clientId, parsedDevices);
        }
      }
    } catch (e) {
      console.error(`[sync-doc-devices] UniFi controller ${ctrl.name} error:`, e);
    }
  }

  // Log sync
  await supabase.from("doc_sync_log").insert({
    client_id: clientId,
    source: "unifi",
    devices_synced: totalDevices + totalVlans + totalFirewall + totalVpn,
    details: { devices: totalDevices, vlans: totalVlans, firewall_rules: totalFirewall, vpns: totalVpn },
    status: "success",
  });

  return { success: true, devices: totalDevices, vlans: totalVlans, firewall: totalFirewall, vpns: totalVpn };
}

async function upsertUnifiDevices(supabase: ReturnType<typeof createClient>, clientId: string, devices: any[]): Promise<number> {
  let count = 0;
  const { data: existing } = await supabase
    .from("doc_devices")
    .select("id, unifi_device_id, data_source, physical_location, notes")
    .eq("client_id", clientId)
    .not("unifi_device_id", "is", null);

  const existingMap = new Map((existing || []).map((d: any) => [d.unifi_device_id, d]));

  for (const dev of devices) {
    const devId = dev._id || dev.mac || "";
    if (!devId) continue;

    const devType = mapUnifiDeviceType(dev.type || "");
    const newData: Record<string, unknown> = {
      client_id: clientId,
      name: dev.name || dev.hostname || dev.mac || "Unknown",
      device_type: devType,
      brand_model: dev.model || null,
      ip_local: dev.ip || null,
      mac_address: dev.mac || null,
      firmware: dev.version || null,
      status: dev.state === 1 ? "online" : "offline",
      connected_clients: dev.num_sta || null,
      unifi_device_id: devId,
      data_source: "unifi",
    };

    if (devType === "switch") {
      newData.port_count = dev.port_table?.length || dev.num_sta || null;
    }

    const ex = existingMap.get(devId);
    if (ex) {
      const merged = mergeWithProtection(newData, ex);
      delete merged.client_id;
      await supabase.from("doc_devices").update(merged).eq("id", ex.id);
    } else {
      await supabase.from("doc_devices").insert(newData);
    }
    count++;
  }
  return count;
}

function mapUnifiDeviceType(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("usw") || t.includes("switch")) return "switch";
  if (t.includes("uap") || t.includes("u6") || t.includes("u7") || t.includes("access")) return "access_point";
  if (t.includes("ugw") || t.includes("udm") || t.includes("uxg") || t.includes("ucg")) return "other";
  return "other";
}

async function upsertUnifiVlans(supabase: ReturnType<typeof createClient>, clientId: string, vlans: any[]): Promise<number> {
  let count = 0;
  const { data: existing } = await supabase
    .from("doc_vlans")
    .select("id, unifi_network_id, data_source, purpose, isolated, notes")
    .eq("client_id", clientId)
    .not("unifi_network_id", "is", null);

  const existingMap = new Map((existing || []).map((v: any) => [v.unifi_network_id, v]));

  for (const vlan of vlans) {
    const networkId = vlan._id || "";
    if (!networkId) continue;

    const newData: Record<string, unknown> = {
      client_id: clientId,
      vlan_id: vlan.vlan || vlan.vlan_id || null,
      name: vlan.name || null,
      ip_range: vlan.ip_subnet || null,
      gateway: vlan.dhcpd_ip || null,
      dhcp_enabled: vlan.dhcpd_enabled || false,
      unifi_network_id: networkId,
      data_source: "unifi",
    };

    const ex = existingMap.get(networkId);
    if (ex) {
      const merged = mergeWithProtection(newData, ex);
      delete merged.client_id;
      await supabase.from("doc_vlans").update(merged).eq("id", ex.id);
    } else {
      await supabase.from("doc_vlans").insert(newData);
    }
    count++;
  }
  return count;
}

async function upsertUnifiFirewall(supabase: ReturnType<typeof createClient>, clientId: string, rules: any[]): Promise<number> {
  let count = 0;
  const { data: existing } = await supabase
    .from("doc_firewall_rules")
    .select("id, unifi_rule_id, data_source, context, notes")
    .eq("client_id", clientId)
    .not("unifi_rule_id", "is", null);

  const existingMap = new Map((existing || []).map((r: any) => [r.unifi_rule_id, r]));

  for (const rule of rules) {
    const ruleId = rule._id || "";
    if (!ruleId) continue;

    const newData: Record<string, unknown> = {
      client_id: clientId,
      name: rule.name || "Sem nome",
      rule_type: "Regra de firewall",
      source: rule.src_address || rule.src_networkconf_id || null,
      destination: rule.dst_address || rule.dst_networkconf_id || null,
      port: rule.dst_port || null,
      protocol: rule.protocol || null,
      action: rule.action === "accept" ? "Permitir" : "Bloquear",
      unifi_rule_id: ruleId,
      data_source: "unifi",
    };

    const ex = existingMap.get(ruleId);
    if (ex) {
      const merged = mergeWithProtection(newData, ex);
      delete merged.client_id;
      await supabase.from("doc_firewall_rules").update(merged).eq("id", ex.id);
    } else {
      await supabase.from("doc_firewall_rules").insert(newData);
    }
    count++;
  }
  return count;
}

async function upsertUnifiPortForwards(supabase: ReturnType<typeof createClient>, clientId: string, forwards: any[]): Promise<number> {
  let count = 0;
  const { data: existing } = await supabase
    .from("doc_firewall_rules")
    .select("id, unifi_rule_id, data_source, context, notes")
    .eq("client_id", clientId)
    .not("unifi_rule_id", "is", null);

  const existingMap = new Map((existing || []).map((r: any) => [r.unifi_rule_id, r]));

  for (const pf of forwards) {
    const pfId = pf._id || "";
    if (!pfId) continue;

    const newData: Record<string, unknown> = {
      client_id: clientId,
      name: pf.name || "Port Forward",
      rule_type: "Abertura de porta (Port forward)",
      source: "WAN",
      destination: pf.fwd || null,
      port: `${pf.dst_port || ""} → ${pf.fwd_port || ""}`,
      action: "Permitir",
      unifi_rule_id: pfId,
      data_source: "unifi",
    };

    const ex = existingMap.get(pfId);
    if (ex) {
      const merged = mergeWithProtection(newData, ex);
      delete merged.client_id;
      await supabase.from("doc_firewall_rules").update(merged).eq("id", ex.id);
    } else {
      await supabase.from("doc_firewall_rules").insert(newData);
    }
    count++;
  }
  return count;
}

async function upsertUnifiVpns(supabase: ReturnType<typeof createClient>, clientId: string, vpns: any[]): Promise<number> {
  let count = 0;
  const { data: existing } = await supabase
    .from("doc_vpn")
    .select("id, unifi_vpn_id, data_source, notes")
    .eq("client_id", clientId)
    .not("unifi_vpn_id", "is", null);

  const existingMap = new Map((existing || []).map((v: any) => [v.unifi_vpn_id, v]));

  for (const vpn of vpns) {
    const vpnId = vpn._id || "";
    if (!vpnId) continue;

    const newData: Record<string, unknown> = {
      client_id: clientId,
      name: vpn.name || "VPN",
      vpn_type: vpn.x_ipsec_pre_shared_key ? "IPSec" : "OpenVPN",
      unifi_vpn_id: vpnId,
      data_source: "unifi",
    };

    const ex = existingMap.get(vpnId);
    if (ex) {
      const merged = mergeWithProtection(newData, ex);
      delete merged.client_id;
      await supabase.from("doc_vpn").update(merged).eq("id", ex.id);
    } else {
      await supabase.from("doc_vpn").insert(newData);
    }
    count++;
  }
  return count;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, client_id } = await req.json();

    if (!client_id) return err("client_id é obrigatório", 400);

    switch (action) {
      case "sync_trmm": {
        const result = await syncTrmm(supabase, client_id);
        return ok(result);
      }
      case "sync_unifi": {
        const result = await syncUnifi(supabase, client_id);
        return ok(result);
      }
      case "sync_all": {
        const [trmm, unifi] = await Promise.allSettled([
          syncTrmm(supabase, client_id),
          syncUnifi(supabase, client_id),
        ]);
        return ok({
          trmm: trmm.status === "fulfilled" ? trmm.value : { success: false, error: (trmm as PromiseRejectedResult).reason?.message },
          unifi: unifi.status === "fulfilled" ? unifi.value : { success: false, error: (unifi as PromiseRejectedResult).reason?.message },
        });
      }
      default:
        return err("Ação inválida", 400);
    }
  } catch (error: any) {
    console.error("[sync-doc-devices] Error:", error);
    return err(error.message);
  }
});
