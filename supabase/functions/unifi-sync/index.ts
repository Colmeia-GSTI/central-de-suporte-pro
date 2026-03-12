import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEOUT_MS = 10000;

interface UnifiController {
  id: string;
  client_id: string;
  name: string;
  connection_method: "direct" | "cloud";
  url: string | null;
  username: string | null;
  password_encrypted: string | null;
  ddns_hostname: string | null;
  cloud_api_key_encrypted: string | null;
  cloud_host_id: string | null;
  is_active: boolean;
  sync_interval_hours: number;
  last_sync_at: string | null;
  last_error: string | null;
}

// Severity mapping for UniFi alarm keys
const CRITICAL_ALARMS = new Set([
  "EVT_LU_DISCONNECTED", "EVT_GW_WANTransition",
  "EVT_AP_Lost", "EVT_SW_Lost", "EVT_GW_Lost",
  "EVT_AP_Disconnected", "EVT_SW_Disconnected",
]);

const WARNING_ALARMS = new Set([
  "EVT_LU_Connected", "EVT_AP_RestartedUnknown",
  "EVT_SW_RestartedUnknown", "EVT_GW_RestartedUnknown",
  "EVT_AP_ChannelChanged", "EVT_AP_DetectRogueAP",
]);

function mapAlarmSeverity(key: string): "critical" | "warning" | "info" {
  if (CRITICAL_ALARMS.has(key)) return "critical";
  if (WARNING_ALARMS.has(key)) return "warning";
  return "info";
}

function mapDeviceType(type: string): string {
  switch (type) {
    case "ugw": case "udm": case "uxg": return "gateway";
    case "usw": return "switch";
    case "uap": return "access_point";
    default: return "other";
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// ========== DIRECT METHOD ==========
async function directLogin(baseUrl: string, username: string, password: string): Promise<string> {
  const response = await fetchWithTimeout(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login falhou: ${response.status} ${text}`);
  }

  const setCookie = response.headers.get("set-cookie") || "";
  const match = setCookie.match(/unifises=([^;]+)/);
  if (!match) {
    await response.text();
    throw new Error("Cookie de sessão não encontrado na resposta");
  }
  await response.json();
  return match[1];
}

async function directLogout(baseUrl: string, sessionCookie: string): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/logout`, {
      method: "POST",
      headers: { Cookie: `unifises=${sessionCookie}` },
    });
    await res.text();
  } catch {
    // Ignore logout errors
  }
}

async function directGetSites(baseUrl: string, cookie: string): Promise<any[]> {
  const response = await fetchWithTimeout(`${baseUrl}/api/self/sites`, {
    headers: { Cookie: `unifises=${cookie}` },
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Erro ao listar sites: ${response.status} ${t}`);
  }
  const data = await response.json();
  return data.data || [];
}

async function directGetDevices(baseUrl: string, cookie: string, siteCode: string): Promise<any[]> {
  const response = await fetchWithTimeout(`${baseUrl}/api/s/${siteCode}/stat/device`, {
    headers: { Cookie: `unifises=${cookie}` },
  });
  if (!response.ok) {
    await response.text();
    return [];
  }
  const data = await response.json();
  return data.data || [];
}

async function directGetAlarms(baseUrl: string, cookie: string, siteCode: string): Promise<any[]> {
  const response = await fetchWithTimeout(`${baseUrl}/api/s/${siteCode}/rest/alarm?archived=false`, {
    headers: { Cookie: `unifises=${cookie}` },
  });
  if (!response.ok) {
    await response.text();
    return [];
  }
  const data = await response.json();
  return data.data || [];
}

async function directGetHealth(baseUrl: string, cookie: string, siteCode: string): Promise<any[]> {
  const response = await fetchWithTimeout(`${baseUrl}/api/s/${siteCode}/stat/health`, {
    headers: { Cookie: `unifises=${cookie}` },
  });
  if (!response.ok) {
    await response.text();
    return [];
  }
  const data = await response.json();
  return data.data || [];
}

// ========== CLOUD METHOD ==========
async function cloudGetHosts(apiKey: string): Promise<any[]> {
  const response = await fetchWithTimeout("https://api.ui.com/ea/hosts", {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Cloud API falhou: ${response.status} ${t}`);
  }
  const data = await response.json();
  return data.data || data || [];
}

// Extract friendly name from a UniFi Cloud host object
function getHostDisplayName(h: Record<string, unknown>): string {
  const rs = h.reportedState as Record<string, unknown> | undefined;
  const ud = h.userData as Record<string, unknown> | undefined;
  return (ud?.name as string) || (rs?.hostname as string) || (rs?.name as string) || (h.name as string) || (h.hostname as string) || (h.id as string) || (h._id as string) || "Unknown";
}

function getHostModel(h: Record<string, unknown>): string {
  const rs = h.reportedState as Record<string, unknown> | undefined;
  return (rs?.model as string) || (h.model as string) || "Unknown";
}

function getHostId(h: Record<string, unknown>): string {
  return (h.id as string) || (h._id as string) || "";
}

// Parse a Cloud device from nested reportedState structure
function parseCloudDevice(raw: Record<string, unknown>): Record<string, unknown> {
  const rs = raw.reportedState as Record<string, unknown> | undefined;
  const ud = raw.userData as Record<string, unknown> | undefined;
  const nc = rs?.networkConfig as Record<string, unknown> | undefined;

  const mac = (rs?.mac as string) || (raw.mac as string) || (raw._id as string) || "";
  const name = (ud?.name as string) || (rs?.name as string) || (rs?.hostname as string) || (raw.name as string) || mac;
  const model = (rs?.model as string) || (raw.model as string) || "";
  const ip = (rs?.ip as string) || (nc?.ip as string) || (raw.ip as string) || null;
  const version = (rs?.version as string) || (raw.version as string) || null;
  const type = (rs?.type as string) || (raw.type as string) || "";
  const hostname = (rs?.hostname as string) || (raw.hostname as string) || name;
  const uptime = (rs?.uptime as number) || (raw.uptime as number) || 0;
  const numSta = (rs?.num_sta as number) || (raw.num_sta as number) || 0;

  // Determine online status: state=1 (direct API), or check reportedState presence
  const stateVal = (rs?.state as number) ?? (raw.state as number) ?? null;
  const statusStr = (rs?.status as string) || (raw.status as string) || "";
  const isOnline = stateVal === 1 || statusStr === "online" || (rs !== undefined && stateVal === null && statusStr === "");

  return { mac, name, model, ip, version, type, hostname, uptime, numSta, isOnline };
}

async function cloudGetDevices(apiKey: string, hostId: string): Promise<any[]> {
  const response = await fetchWithTimeout(`https://api.ui.com/ea/sites/${hostId}/devices`, {
    headers: { "X-API-KEY": apiKey, Accept: "application/json" },
  });
  if (!response.ok) {
    await response.text();
    return [];
  }
  const data = await response.json();
  return data.data || data || [];
}

// ========== SYNC LOGIC ==========
async function syncController(supabase: any, ctrl: UnifiController) {
  const startTime = Date.now();
  let devicesSynced = 0;
  let alarmsCollected = 0;
  let alarmsNew = 0;
  let alertsPosted = 0;
  let status = "success";
  let errorMessage: string | null = null;

  try {
    if (ctrl.connection_method === "direct") {
      if (!ctrl.url || !ctrl.username || !ctrl.password_encrypted) {
        throw new Error("Configuração incompleta: URL, usuário e senha são obrigatórios");
      }

      const baseUrl = ctrl.url.replace(/\/$/, "");
      const cookie = await directLogin(baseUrl, ctrl.username, ctrl.password_encrypted);

      try {
        const sites = await directGetSites(baseUrl, cookie);
        console.log(`[${ctrl.name}] Found ${sites.length} sites`);

        // Auto-update controller name from first site if generic
        if (sites.length > 0) {
          const firstSiteName = sites[0].desc || sites[0].name || ctrl.name;
          if (firstSiteName && firstSiteName !== ctrl.name) {
            await supabase
              .from("unifi_controllers")
              .update({ name: firstSiteName })
              .eq("id", ctrl.id);
          }
        }

        for (const site of sites) {
          const siteCode = site.name || "default";
          const siteName = site.desc || site.name || "Default";

          const { data: siteRow } = await supabase
            .from("network_sites")
            .upsert({
              controller_id: ctrl.id,
              client_id: ctrl.client_id,
              site_code: siteCode,
              site_name: siteName,
              device_count: site.num_adopted || 0,
              client_count: site.num_sta || 0,
              last_sync_at: new Date().toISOString(),
            }, { onConflict: "controller_id,site_code" })
            .select("id")
            .single();

          const siteId = siteRow?.id;

          const devices = await directGetDevices(baseUrl, cookie, siteCode);
          for (const dev of devices) {
            const mac = dev.mac || "";
            const devName = dev.name || dev.model || mac;
            const devType = mapDeviceType(dev.type || "");

            const { data: existingList } = await supabase
              .from("monitored_devices")
              .select("id")
              .eq("external_id", mac)
              .eq("external_source", "unifi")
              .limit(1);

            const existing = existingList?.[0];
            const deviceData = {
              name: devName,
              hostname: dev.hostname || devName,
              ip_address: dev.ip || null,
              mac_address: mac,
              model: dev.model || null,
              firmware_version: dev.version || null,
              is_online: dev.state === 1,
              device_type: devType,
              external_id: mac,
              external_source: "unifi",
              client_id: ctrl.client_id,
              site_id: siteId || null,
              last_seen_at: dev.last_seen ? new Date(dev.last_seen * 1000).toISOString() : new Date().toISOString(),
              service_data: {
                uptime: dev.uptime,
                tx_bytes: dev.tx_bytes,
                rx_bytes: dev.rx_bytes,
                num_sta: dev.num_sta,
                satisfaction: dev.satisfaction,
              },
            };

            if (existing) {
              await supabase.from("monitored_devices").update(deviceData).eq("id", existing.id);
            } else {
              await supabase.from("monitored_devices").insert(deviceData);
            }
            devicesSynced++;

            // Extract LLDP topology
            if (dev.lldp_table && Array.isArray(dev.lldp_table) && siteId) {
              for (const lldp of dev.lldp_table) {
                await supabase.from("network_topology").upsert({
                  site_id: siteId,
                  client_id: ctrl.client_id,
                  device_mac: mac,
                  device_name: devName,
                  device_port: lldp.local_port_name || lldp.local_port_idx?.toString() || null,
                  neighbor_mac: lldp.chassis_id || "",
                  neighbor_name: lldp.chassis_name || lldp.chassis_id || "",
                  neighbor_port: lldp.port_id || null,
                  connection_type: "ethernet",
                }, { ignoreDuplicates: true });
              }
            }
          }

          // Collect alarms
          const alarms = await directGetAlarms(baseUrl, cookie, siteCode);
          alarmsCollected += alarms.length;

          for (const alarm of alarms) {
            const alarmKey = alarm.key || alarm.type || "UNKNOWN";
            const severity = mapAlarmSeverity(alarmKey);
            const deviceMac = alarm.ap || alarm.sw || alarm.gw || "";
            const alarmMsg = alarm.msg || alarmKey;

            const { data: devList } = await supabase
              .from("monitored_devices")
              .select("id")
              .eq("external_id", deviceMac)
              .eq("external_source", "unifi")
              .limit(1);

            const alertDevice = devList?.[0];
            if (!alertDevice) continue;

            const { data: existingAlert } = await supabase
              .from("monitoring_alerts")
              .select("id")
              .eq("device_id", alertDevice.id)
              .eq("status", "active")
              .eq("service_name", alarmKey)
              .maybeSingle();

            if (!existingAlert) {
              await supabase.from("monitoring_alerts").insert({
                device_id: alertDevice.id,
                title: alarmMsg.substring(0, 200),
                message: `Alarme UniFi: ${alarmMsg}. Controller: ${ctrl.name}, Site: ${siteName}`,
                level: severity,
                status: "active",
                service_name: alarmKey,
              });
              alarmsNew++;
              alertsPosted++;
            }
          }

          // Update health status
          const health = await directGetHealth(baseUrl, cookie, siteCode);
          if (health.length > 0 && siteId) {
            const healthMap: Record<string, any> = {};
            for (const h of health) {
              healthMap[h.subsystem] = {
                status: h.status,
                num_adopted: h.num_adopted,
                num_sta: h.num_sta,
              };
            }
            await supabase
              .from("network_sites")
              .update({ health_status: healthMap })
              .eq("id", siteId);
          }
        }
      } finally {
        await directLogout(baseUrl, cookie);
      }
    } else if (ctrl.connection_method === "cloud") {
      if (!ctrl.cloud_api_key_encrypted) {
        throw new Error("API Key do UniFi Cloud não configurada");
      }

      const apiKey = ctrl.cloud_api_key_encrypted;

      // Resolve host
      let hostId = ctrl.cloud_host_id;
      let hostRealName: string | null = null;

      if (!hostId) {
        const hosts = await cloudGetHosts(apiKey);
        if (hosts.length === 0) throw new Error("Nenhum host encontrado na conta UniFi Cloud");
        hostId = getHostId(hosts[0]);
        hostRealName = getHostDisplayName(hosts[0]);
      } else {
        // Fetch hosts to get real name for the configured host
        try {
          const hosts = await cloudGetHosts(apiKey);
          const matched = hosts.find((h: Record<string, unknown>) => getHostId(h) === hostId);
          if (matched) hostRealName = getHostDisplayName(matched);
        } catch {
          // Non-critical: keep existing name
        }
      }

      // Auto-update controller name with the real host name
      if (hostRealName && hostRealName !== ctrl.name) {
        await supabase
          .from("unifi_controllers")
          .update({ name: hostRealName })
          .eq("id", ctrl.id);
        console.log(`[${ctrl.name}] Updated controller name to: ${hostRealName}`);
      }

      const siteName = hostRealName || ctrl.name;

      // Create/update default site entry for cloud
      const { data: siteRow } = await supabase
        .from("network_sites")
        .upsert({
          controller_id: ctrl.id,
          client_id: ctrl.client_id,
          site_code: "cloud-default",
          site_name: siteName,
          last_sync_at: new Date().toISOString(),
        }, { onConflict: "controller_id,site_code" })
        .select("id")
        .single();

      const siteId = siteRow?.id;

      const rawDevices = await cloudGetDevices(apiKey, hostId);
      let deviceCount = 0;
      let totalClients = 0;

      for (const rawDev of rawDevices) {
        const dev = parseCloudDevice(rawDev);
        const mac = dev.mac as string;
        const devName = dev.name as string;
        const devType = mapDeviceType((dev.type as string) || "");

        const { data: existingList } = await supabase
          .from("monitored_devices")
          .select("id")
          .eq("external_id", mac)
          .eq("external_source", "unifi")
          .limit(1);

        const existing = existingList?.[0];
        const deviceData = {
          name: devName,
          hostname: dev.hostname as string,
          ip_address: dev.ip || null,
          mac_address: mac,
          model: dev.model || null,
          firmware_version: dev.version || null,
          is_online: dev.isOnline as boolean,
          device_type: devType,
          external_id: mac,
          external_source: "unifi",
          client_id: ctrl.client_id,
          site_id: siteId || null,
          last_seen_at: new Date().toISOString(),
          service_data: {
            uptime: dev.uptime,
            num_sta: dev.numSta,
          },
        };

        if (existing) {
          await supabase.from("monitored_devices").update(deviceData).eq("id", existing.id);
        } else {
          await supabase.from("monitored_devices").insert(deviceData);
        }
        devicesSynced++;
        deviceCount++;
        totalClients += (dev.numSta as number) || 0;
      }

      // Update site with real counts
      if (siteId) {
        await supabase
          .from("network_sites")
          .update({
            device_count: deviceCount,
            client_count: totalClients,
            site_name: siteName,
          })
          .eq("id", siteId);
      }

      console.log(`[${siteName}] Cloud sync: ${deviceCount} devices, ${totalClients} Wi-Fi clients`);
    }

    // Update controller status
    await supabase
      .from("unifi_controllers")
      .update({ last_sync_at: new Date().toISOString(), last_error: null })
      .eq("id", ctrl.id);

  } catch (e: any) {
    status = "error";
    errorMessage = e.name === "AbortError" ? "Timeout ao conectar ao controller" : e.message;
    console.error(`[${ctrl.name}] Sync error:`, errorMessage);

    await supabase
      .from("unifi_controllers")
      .update({ last_error: errorMessage })
      .eq("id", ctrl.id);
  }

  const durationMs = Date.now() - startTime;

  await supabase.from("unifi_sync_logs").insert({
    controller_id: ctrl.id,
    sync_timestamp: new Date().toISOString(),
    devices_synced: devicesSynced,
    alarms_collected: alarmsCollected,
    alarms_new: alarmsNew,
    alerts_posted: alertsPosted,
    status,
    error_message: errorMessage,
    duration_ms: durationMs,
  });

  return { devicesSynced, alarmsCollected, alarmsNew, alertsPosted, status, errorMessage };
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

    const body = await req.json();
    const action = body.action as string;
    const controllerId = body.controller_id as string | undefined;

    // ========== TEST CONNECTION ==========
    if (action === "test") {
      const { connection_method, url, username, password, cloud_api_key } = body;

      if (connection_method === "direct") {
        if (!url || !username || !password) {
          return new Response(
            JSON.stringify({ error: "URL, usuário e senha são obrigatórios" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const baseUrl = url.replace(/\/$/, "");
        let cookie: string;
        try {
          cookie = await directLogin(baseUrl, username, password);
        } catch (e: any) {
          return new Response(
            JSON.stringify({ error: e.name === "AbortError" ? "Timeout ao conectar" : e.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        try {
          const sites = await directGetSites(baseUrl, cookie);
          return new Response(
            JSON.stringify({
              success: true,
              message: `Conexão válida. ${sites.length} site(s) encontrado(s).`,
              sites: sites.map((s: any) => ({
                code: s.name,
                name: s.desc || s.name,
                devices: s.num_adopted || 0,
                clients: s.num_sta || 0,
              })),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } finally {
          await directLogout(baseUrl, cookie);
        }
      } else if (connection_method === "cloud") {
        if (!cloud_api_key) {
          return new Response(
            JSON.stringify({ error: "API Key é obrigatória" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        try {
          const hosts = await cloudGetHosts(cloud_api_key);

          // For each host, try to get device count for preview
          const hostsWithCounts = await Promise.all(
            hosts.map(async (h: Record<string, unknown>) => {
              const hId = getHostId(h);
              let deviceCount = 0;
              try {
                const devices = await cloudGetDevices(cloud_api_key, hId);
                deviceCount = devices.length;
              } catch {
                // Non-critical
              }
              return {
                id: hId,
                name: getHostDisplayName(h),
                model: getHostModel(h),
                device_count: deviceCount,
              };
            })
          );

          return new Response(
            JSON.stringify({
              success: true,
              message: `Conexão válida. ${hosts.length} host(s) encontrado(s).`,
              hosts: hostsWithCounts,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (e: any) {
          return new Response(
            JSON.stringify({ error: e.name === "AbortError" ? "Timeout ao conectar" : e.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ error: "Método de conexão inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== LIST SITES ==========
    if (action === "list_sites" && controllerId) {
      const { data: ctrl } = await supabase
        .from("unifi_controllers")
        .select("*")
        .eq("id", controllerId)
        .single();

      if (!ctrl) {
        return new Response(
          JSON.stringify({ error: "Controller não encontrado" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (ctrl.connection_method === "direct") {
        const baseUrl = ctrl.url.replace(/\/$/, "");
        const cookie = await directLogin(baseUrl, ctrl.username, ctrl.password_encrypted);
        try {
          const sites = await directGetSites(baseUrl, cookie);
          return new Response(
            JSON.stringify({ success: true, sites }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } finally {
          await directLogout(baseUrl, cookie);
        }
      } else {
        const hosts = await cloudGetHosts(ctrl.cloud_api_key_encrypted);
        return new Response(
          JSON.stringify({
            success: true,
            hosts: hosts.map((h: Record<string, unknown>) => ({
              id: getHostId(h),
              name: getHostDisplayName(h),
              model: getHostModel(h),
            })),
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ========== SYNC (single or all) ==========
    if (action === "sync") {
      let controllers: UnifiController[] = [];

      if (controllerId) {
        const { data } = await supabase
          .from("unifi_controllers")
          .select("*")
          .eq("id", controllerId)
          .eq("is_active", true)
          .single();

        if (data) controllers = [data];
      } else {
        const { data } = await supabase
          .from("unifi_controllers")
          .select("*")
          .eq("is_active", true);

        controllers = (data || []).filter((ctrl: UnifiController) => {
          if (!ctrl.last_sync_at) return true;
          const lastSync = new Date(ctrl.last_sync_at).getTime();
          const intervalMs = ctrl.sync_interval_hours * 60 * 60 * 1000;
          return Date.now() - lastSync >= intervalMs;
        });
      }

      if (controllers.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: "Nenhum controller para sincronizar", synced: 0 }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Starting UniFi sync for ${controllers.length} controller(s)...`);
      const results = [];

      for (const ctrl of controllers) {
        const result = await syncController(supabase, ctrl);
        results.push({ controller: ctrl.name, ...result });
      }

      const totalDevices = results.reduce((s, r) => s + r.devicesSynced, 0);
      const totalAlerts = results.reduce((s, r) => s + r.alertsPosted, 0);
      const errors = results.filter((r) => r.status === "error");

      console.log(`UniFi sync complete: ${totalDevices} devices, ${totalAlerts} alerts, ${errors.length} errors`);

      return new Response(
        JSON.stringify({
          success: true,
          controllers_synced: controllers.length,
          total_devices: totalDevices,
          total_alerts: totalAlerts,
          errors: errors.length,
          results,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error("Ação inválida");
  } catch (error: any) {
    console.error("UniFi sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
