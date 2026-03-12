import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEOUT_MS = 15000;
const CLOUD_BASE = "https://api.ui.com/v1";

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
  const t = (type || "").toLowerCase();
  if (t.includes("ugw") || t.includes("udm") || t.includes("uxg") || t.includes("ucg") || t.includes("gateway") || t.includes("dream") || t.includes("router")) return "gateway";
  if (t.includes("usw") || t.includes("usl") || t.includes("switch")) return "switch";
  if (t.includes("uap") || t.includes("u6") || t.includes("u7") || t.includes("access") || t.includes("wifi") || t.includes("wi-fi")) return "access_point";
  return "other";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

function asNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function normalizeModelCode(model: string): string {
  return model.trim().toUpperCase().replace(/\s+/g, "-").replace(/_/g, "-");
}

function inferModelCodeFromText(text: string): string {
  const normalized = normalizeModelCode(text);
  if (!normalized) return "";

  const matches = normalized.match(/(UCG-ULTRA|UCGU|UCG-MAX|UCGMAX|UDM-PRO-SE|UDM-PRO-MAX|UDM-PRO|UDMSE|UDR|UNVR|UXG-PRO|USW-[A-Z0-9-]+|U7-[A-Z0-9-]+|U6-[A-Z0-9-]+|UAP-[A-Z0-9-]+)/);
  if (matches?.[1]) return matches[1];

  return "";
}

// Map shortModel to a friendly product name
function mapModelName(rawModel: string): string {
  const model = normalizeModelCode(rawModel);
  const m: Record<string, string> = {
    "UCGU": "Cloud Gateway Ultra",
    "UCG-ULTRA": "Cloud Gateway Ultra",
    "UCGULTRA": "Cloud Gateway Ultra",
    "UDRULT": "Cloud Gateway Ultra",
    "UCGMAX": "Cloud Gateway Max",
    "UCG-MAX": "Cloud Gateway Max",
    "UDM": "UniFi Dream Machine",
    "UDMPRO": "UniFi Dream Machine Pro",
    "UDM-PRO": "UniFi Dream Machine Pro",
    "UDMSE": "UniFi Dream Machine SE",
    "UDM-SE": "UniFi Dream Machine SE",
    "UDMPROSE": "UniFi Dream Machine Pro SE",
    "UDM-PRO-SE": "UniFi Dream Machine Pro SE",
    "UDMPROMAX": "UniFi Dream Machine Pro Max",
    "UDM-PRO-MAX": "UniFi Dream Machine Pro Max",
    "UDR": "UniFi Dream Router",
    "UNVR": "UniFi Network Video Recorder",
    "UOSSERVER": "UniFi OS Server",
    "UXG-PRO": "UniFi Next-Gen Gateway Pro",
    "USW-24-POE": "Switch 24 PoE",
    "USW-48-POE": "Switch 48 PoE",
    "USW-PRO-24-POE": "Switch Pro 24 PoE",
    "USW-LITE-16-POE": "Switch Lite 16 PoE",
    "USW-LITE-8-POE": "Switch Lite 8 PoE",
    "USW-FLEX": "Switch Flex",
    "USW-FLEX-MINI": "Switch Flex Mini",
    "U6-PRO": "U6 Pro",
    "U6-LITE": "U6 Lite",
    "U6-LR": "U6 Long Range",
    "U6-PLUS": "U6+",
    "U6-ENTERPRISE": "U6 Enterprise",
    "U6-MESH": "U6 Mesh",
    "U7-PRO": "U7 Pro",
    "U7-PRO-MAX": "U7 Pro Max",
    "UAP-AC-PRO": "UAP AC Pro",
    "UAP-AC-LITE": "UAP AC Lite",
    "UAP-AC-LR": "UAP AC LR",
  };

  if (!model) return "Modelo não identificado";
  return m[model] || rawModel || model;
}

function extractResponseRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.map(asRecord).filter((row): row is Record<string, unknown> => row !== null);
  }

  const payloadRecord = asRecord(payload);
  if (!payloadRecord) return [];

  for (const key of ["items", "results", "rows", "hosts", "devices", "data"]) {
    const candidate = payloadRecord[key];
    if (Array.isArray(candidate)) {
      return candidate.map(asRecord).filter((row): row is Record<string, unknown> => row !== null);
    }
  }

  return [payloadRecord];
}

function looksLikeCloudDevice(row: Record<string, unknown>): boolean {
  const rs = asRecord(row.reportedState);
  return Boolean(
    asString(row.mac, row.id, row._id, row.deviceId) ||
    asString(row.model, row.shortModel, row.type, row.deviceType) ||
    asString(rs?.mac, rs?.model, rs?.shortModel, rs?.ip, rs?.status)
  );
}

function extractCloudDeviceRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const devices: Record<string, unknown>[] = [];

  for (const row of rows) {
    const hostId = asString(row.hostId, row.host_id, row.hostID);
    const hostName = asString(row.hostName, row.host_name);

    let nestedFound = false;
    for (const key of ["devices", "items", "results", "data"]) {
      const candidate = row[key];
      if (!Array.isArray(candidate)) continue;

      nestedFound = true;
      for (const nested of candidate) {
        const nestedRecord = asRecord(nested);
        if (!nestedRecord) continue;
        if (!nestedRecord.hostId && hostId) nestedRecord.hostId = hostId;
        if (!nestedRecord.hostName && hostName) nestedRecord.hostName = hostName;
        devices.push(nestedRecord);
      }
    }

    if (!nestedFound && looksLikeCloudDevice(row)) {
      devices.push(row);
    }
  }

  return devices;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
    // Ignore
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

// ========== CLOUD METHOD (Site Manager API v1) ==========
function cloudHeaders(apiKey: string): Record<string, string> {
  return { "X-API-KEY": apiKey, Accept: "application/json" };
}

async function cloudGetHosts(apiKey: string): Promise<Record<string, unknown>[]> {
  const allHosts: Record<string, unknown>[] = [];
  let nextToken: string | undefined;

  // Paginate through all hosts
  do {
    const url = new URL(`${CLOUD_BASE}/hosts`);
    url.searchParams.set("pageSize", "200");
    if (nextToken) url.searchParams.set("nextToken", nextToken);

    const response = await fetchWithTimeout(url.toString(), {
      headers: cloudHeaders(apiKey),
    });

    if (!response.ok) {
      const t = await response.text();
      throw new Error(`Cloud API falhou (hosts): ${response.status} ${t}`);
    }

    const json = await response.json();
    const hosts = extractResponseRows(json.data);
    allHosts.push(...hosts);
    nextToken = typeof json.nextToken === "string" ? json.nextToken : undefined;
  } while (nextToken);

  return allHosts;
}

async function cloudGetDevices(apiKey: string, hostId: string): Promise<Record<string, unknown>[]> {
  const allRows: Record<string, unknown>[] = [];
  let nextToken: string | undefined;

  do {
    const url = new URL(`${CLOUD_BASE}/devices`);
    url.searchParams.append("hostIds[]", hostId);
    url.searchParams.set("pageSize", "200");
    if (nextToken) url.searchParams.set("nextToken", nextToken);

    const response = await fetchWithTimeout(url.toString(), {
      headers: cloudHeaders(apiKey),
    });

    if (!response.ok) {
      const t = await response.text();
      console.warn(`[cloudGetDevices] ${response.status}: ${t}`);
      return allRows;
    }

    const json = await response.json();
    const rows = extractResponseRows(json.data);
    allRows.push(...rows);
    nextToken = typeof json.nextToken === "string" ? json.nextToken : undefined;
  } while (nextToken);

  return allRows;
}

async function cloudGetSites(apiKey: string): Promise<Record<string, unknown>[]> {
  const allSites: Record<string, unknown>[] = [];
  let nextToken: string | undefined;

  do {
    const url = new URL(`${CLOUD_BASE}/sites`);
    url.searchParams.set("pageSize", "200");
    if (nextToken) url.searchParams.set("nextToken", nextToken);

    const response = await fetchWithTimeout(url.toString(), {
      headers: cloudHeaders(apiKey),
    });

    if (!response.ok) {
      const t = await response.text();
      console.warn(`[cloudGetSites] ${response.status}: ${t}`);
      return allSites;
    }

    const json = await response.json();
    const rows = extractResponseRows(json.data);
    allSites.push(...rows);
    nextToken = typeof json.nextToken === "string" ? json.nextToken : undefined;
  } while (nextToken);

  return allSites;
}

function hostIdsMatch(candidateHostId: string, selectedHostId: string): boolean {
  if (!candidateHostId || !selectedHostId) return false;
  if (candidateHostId === selectedHostId) return true;

  const candidateBase = candidateHostId.split(":")[0];
  const selectedBase = selectedHostId.split(":")[0];
  return Boolean(candidateBase && selectedBase && candidateBase === selectedBase);
}

function getSiteDeviceCount(site: Record<string, unknown>): number {
  const stats = asRecord(site.statistics) ?? asRecord(site.stats);
  return asNumber(
    site.deviceCount,
    site.devices,
    site.numDevices,
    stats?.deviceCount,
    stats?.devices,
    stats?.numDevices,
  );
}

function getSiteClientCount(site: Record<string, unknown>): number {
  const stats = asRecord(site.statistics) ?? asRecord(site.stats);
  return asNumber(
    site.clientCount,
    site.clients,
    site.numClients,
    site.wifiClients,
    stats?.clientCount,
    stats?.clients,
    stats?.numClients,
    stats?.wifiClients,
    stats?.wirelessClients,
    stats?.num_sta,
    stats?.numSta,
  );
}

// Extract fields from a Cloud host object (nested reportedState/userData)
function getHostDisplayName(h: Record<string, unknown>): string {
  const rs = h.reportedState as Record<string, unknown> | undefined;
  const ud = h.userData as Record<string, unknown> | undefined;
  return (ud?.name as string) || (rs?.hostname as string) || (rs?.name as string) || (h.name as string) || (h.hostname as string) || (h.id as string) || (h._id as string) || "Unknown";
}

function getHostModel(h: Record<string, unknown>): string {
  const rs = asRecord(h.reportedState);
  const ud = asRecord(h.userData);
  const rsHw = asRecord(rs?.hardware);
  const udHw = asRecord(ud?.hardware);

  const explicitModel = asString(
    rs?.shortModel,
    rs?.model,
    rsHw?.shortname,
    rsHw?.model,
    ud?.shortModel,
    ud?.model,
    udHw?.shortname,
    udHw?.model,
    h.shortModel,
    h.model,
  );

  const inferredCode = inferModelCodeFromText(
    `${getHostDisplayName(h)} ${asString(h.name)} ${explicitModel}`,
  );

  return mapModelName(explicitModel || inferredCode);
}

function getHostShortModel(h: Record<string, unknown>): string {
  const rs = asRecord(h.reportedState);
  const ud = asRecord(h.userData);
  const rsHw = asRecord(rs?.hardware);
  const udHw = asRecord(ud?.hardware);

  const explicitModel = asString(
    rs?.shortModel,
    rs?.model,
    rsHw?.shortname,
    rsHw?.model,
    ud?.shortModel,
    ud?.model,
    udHw?.shortname,
    udHw?.model,
    h.shortModel,
    h.model,
  );

  return explicitModel || inferModelCodeFromText(getHostDisplayName(h));
}

function getHostId(h: Record<string, unknown>): string {
  return asString(h.id, h._id, h.hostId, h.host_id);
}

// Parse a Cloud device from the /v1/devices response
function parseCloudDevice(raw: Record<string, unknown>): Record<string, unknown> {
  const wrapped = asRecord(raw.device) ?? raw;
  const rs = asRecord(wrapped.reportedState);
  const ud = asRecord(wrapped.userData);
  const nc = asRecord(rs?.networkConfig) ?? asRecord(wrapped.networkConfig);
  const uidb = asRecord(wrapped.uidb);

  const uidbShortnames = Array.isArray(uidb?.shortnames) ? uidb.shortnames : [];
  const primaryShortname = typeof uidbShortnames[0] === "string" ? uidbShortnames[0] : "";

  const rawModel = asString(
    wrapped.shortModel,
    wrapped.shortname,
    rs?.shortModel,
    rs?.shortname,
    wrapped.model,
    rs?.model,
    uidb?.model,
    uidb?.name,
    primaryShortname,
    wrapped.productModel,
    wrapped.productName,
    inferModelCodeFromText(asString(ud?.name, rs?.name, wrapped.name, raw.hostName)),
  );

  const mac = asString(wrapped.mac, rs?.mac);
  const deviceId = asString(wrapped.id, wrapped._id, wrapped.deviceId, rs?.id, rs?.deviceId);
  const name = asString(ud?.name, rs?.name, rs?.hostname, wrapped.name, raw.hostName, mac, deviceId);
  const model = mapModelName(rawModel);
  const ip = asString(wrapped.ip, rs?.ip, nc?.ip) || null;
  const version = asString(wrapped.version, rs?.version, wrapped.firmwareVersion) || null;
  const hostname = asString(rs?.hostname, wrapped.hostname, name);
  const uptime = asNumber(wrapped.uptime, rs?.uptime, rs?.uptimeSec, rs?.uptime_sec);
  const numSta = asNumber(
    wrapped.numSta,
    wrapped.num_sta,
    rs?.numSta,
    rs?.num_sta,
    rs?.wifiClientCount,
    rs?.wirelessClientCount,
    wrapped.wifiClientCount,
  );

  const stateVal = wrapped.state ?? rs?.state ?? null;
  const statusStr = asString(wrapped.status, rs?.status).toLowerCase();
  const onlineValue = wrapped.isOnline ?? rs?.isOnline ?? null;
  const isOnline =
    onlineValue === true ||
    onlineValue === 1 ||
    stateVal === 1 ||
    statusStr === "online" ||
    statusStr === "connected" ||
    statusStr === "up";

  return {
    mac,
    deviceId,
    name,
    model,
    shortModel: rawModel,
    ip,
    version,
    type: asString(wrapped.type, wrapped.deviceType, rawModel, model),
    hostname,
    uptime,
    numSta,
    isOnline,
  };
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

        // Auto-update controller name from first site
        if (sites.length > 0) {
          const firstSiteName = sites[0].desc || sites[0].name || ctrl.name;
          if (firstSiteName && firstSiteName !== ctrl.name) {
            await supabase.from("unifi_controllers").update({ name: firstSiteName }).eq("id", ctrl.id);
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

          const health = await directGetHealth(baseUrl, cookie, siteCode);
          if (health.length > 0 && siteId) {
            const healthMap: Record<string, any> = {};
            for (const h of health) {
              healthMap[h.subsystem] = { status: h.status, num_adopted: h.num_adopted, num_sta: h.num_sta };
            }
            await supabase.from("network_sites").update({ health_status: healthMap }).eq("id", siteId);
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

      const hosts = await cloudGetHosts(apiKey);
      if (!hostId) {
        if (hosts.length === 0) throw new Error("Nenhum host encontrado na conta UniFi Cloud");
        hostId = getHostId(hosts[0]);
        hostRealName = getHostDisplayName(hosts[0]);
      } else {
        const matched = hosts.find((h: Record<string, unknown>) => getHostId(h) === hostId);
        if (matched) hostRealName = getHostDisplayName(matched);
      }

      // Auto-update controller name
      if (hostRealName && hostRealName !== ctrl.name) {
        await supabase.from("unifi_controllers").update({ name: hostRealName }).eq("id", ctrl.id);
        console.log(`[${ctrl.name}] Updated controller name to: ${hostRealName}`);
      }

      const siteName = hostRealName || ctrl.name;

      // Upsert default site
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

      // Fetch devices using v1 API
      const rawRows = await cloudGetDevices(apiKey, hostId);
      const normalizedDevices = extractCloudDeviceRows(rawRows);
      console.log(`[${siteName}] Cloud API returned ${rawRows.length} payload row(s), ${normalizedDevices.length} normalized device(s)`);

      // Log first normalized device structure for debugging (only keys)
      if (normalizedDevices.length > 0) {
        console.log(`[${siteName}] Sample normalized device keys: ${Object.keys(normalizedDevices[0]).join(", ")}`);
      }

      let deviceCount = 0;
      let totalClients = 0;

      for (const rawDev of normalizedDevices) {
        const dev = parseCloudDevice(rawDev);
        const mac = dev.mac as string;
        const externalId = mac || (dev.deviceId as string);
        if (!externalId) continue;

        const devName = (dev.name as string) || externalId;
        const devType = mapDeviceType((dev.shortModel as string) || (dev.type as string) || (dev.model as string) || "");

        const { data: existingList } = await supabase
          .from("monitored_devices")
          .select("id")
          .eq("external_id", externalId)
          .eq("external_source", "unifi")
          .limit(1);

        const existing = existingList?.[0];
        const deviceData = {
          name: devName,
          hostname: dev.hostname as string,
          ip_address: dev.ip || null,
          mac_address: mac || null,
          model: dev.model || null,
          firmware_version: dev.version || null,
          is_online: dev.isOnline as boolean,
          device_type: devType,
          external_id: externalId,
          external_source: "unifi",
          client_id: ctrl.client_id,
          site_id: siteId || null,
          last_seen_at: new Date().toISOString(),
          service_data: {
            uptime: dev.uptime,
            num_sta: dev.numSta,
            short_model: dev.shortModel,
            cloud_host_id: asString(rawDev.hostId),
            cloud_host_name: asString(rawDev.hostName),
          },
        };

        if (existing) {
          await supabase.from("monitored_devices").update(deviceData).eq("id", existing.id);
        } else {
          await supabase.from("monitored_devices").insert(deviceData);
        }
        devicesSynced++;
        deviceCount++;
        totalClients += asNumber(dev.numSta);
      }

      const cloudSites = await cloudGetSites(apiKey);
      const matchingSites = cloudSites.filter((site) => {
        const siteHostId = asString(site.hostId, site.host_id, asRecord(site.meta)?.hostId);
        return hostIdsMatch(siteHostId, hostId || "");
      });

      const sitesDeviceCount = matchingSites.reduce((sum, site) => sum + getSiteDeviceCount(site), 0);
      const sitesClientCount = matchingSites.reduce((sum, site) => sum + getSiteClientCount(site), 0);

      const finalDeviceCount = Math.max(deviceCount, sitesDeviceCount);
      const finalClientCount = Math.max(totalClients, sitesClientCount);

      // Update site with real counts
      if (siteId) {
        await supabase
          .from("network_sites")
          .update({ device_count: finalDeviceCount, client_count: finalClientCount, site_name: siteName })
          .eq("id", siteId);
      }

      console.log(`[${siteName}] Cloud sync complete: ${finalDeviceCount} devices, ${finalClientCount} Wi-Fi clients`);
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
    await supabase.from("unifi_controllers").update({ last_error: errorMessage }).eq("id", ctrl.id);
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

          // For each host, get device count
          const hostsWithCounts = await Promise.all(
            hosts.map(async (h: Record<string, unknown>) => {
              const hId = getHostId(h);
              let deviceCount = 0;
              try {
                const deviceRows = await cloudGetDevices(cloud_api_key, hId);
                deviceCount = extractCloudDeviceRows(deviceRows).length;
              } catch {
                // Non-critical
              }
              return {
                id: hId,
                name: getHostDisplayName(h),
                model: getHostModel(h),
                shortModel: getHostShortModel(h),
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
              shortModel: getHostShortModel(h),
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
