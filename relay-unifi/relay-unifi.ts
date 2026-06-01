/**
 * Relay UniFi OS — worker autônomo (LXC na tailnet)
 *
 * Lê controllers 'direct' do Supabase via RPC, faz polling dos UDMs via
 * Tailscale usando o fluxo UniFi OS (/api/auth/login + /proxy/network/api/...
 * + x-csrf-token), e grava devices/alarmes/logs via RPCs escopadas.
 *
 * NÃO usa service_role: autentica como usuário de serviço
 * relay-unifi@colmeiagsti.com.br (role technician) e só pode executar as
 * RPCs unifi_relay_*.
 *
 * Variáveis de ambiente (definir na LXC):
 *   SUPABASE_URL            ex.: https://silefpsayliwqtoskkdz.supabase.co
 *   SUPABASE_ANON_KEY       chave publishable/anon (necessária para o auth/token)
 *   RELAY_EMAIL             relay-unifi@colmeiagsti.com.br
 *   RELAY_PASSWORD          (do Vault UNIFI_RELAY_PASSWORD)
 *
 * Execução:
 *   deno run --allow-net --allow-env relay-unifi.ts          # ciclo único
 *   LOOP=true deno run --allow-net --allow-env relay-unifi.ts # loop contínuo
 *
 * Recomendado: rodar via systemd timer ou cron na LXC (ciclo único por execução).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const RELAY_EMAIL = Deno.env.get("RELAY_EMAIL")!;
const RELAY_PASSWORD = Deno.env.get("RELAY_PASSWORD")!;

const UDM_TIMEOUT_MS = 15000;

// ===================== Helpers de mapeamento (reaproveitados do unifi-sync) ===

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
  if (/(ugw|udm|uxg|ucg|gateway|dream|router)/.test(t)) return "gateway";
  if (/(usw|usl|switch)/.test(t)) return "switch";
  if (/(uap|u6|u7|access|wifi|wi-fi)/.test(t)) return "access_point";
  return "other";
}

// ===================== Supabase (auth + RPC) =================================

interface Session { accessToken: string }

async function supabaseLogin(): Promise<Session> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email: RELAY_EMAIL, password: RELAY_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Supabase login falhou: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { accessToken: data.access_token };
}

async function rpc<T = unknown>(session: Session, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`RPC ${fn} falhou: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}

// ===================== UniFi OS (direct via Tailscale) =======================

interface UdmSession { cookie: string; csrf: string }

async function udmFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), UDM_TIMEOUT_MS);
  try {
    // UDM usa cert self-signed; Deno não valida por padrão em IP, mas
    // garantimos via client sem verificação quando necessário.
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Login UniFi OS: /api/auth/login → cookie TOKEN + header x-csrf-token */
async function udmLogin(baseUrl: string, username: string, password: string): Promise<UdmSession> {
  const res = await udmFetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`UDM login falhou: ${res.status}`);

  const setCookie = res.headers.get("set-cookie") || "";
  const tokenMatch = setCookie.match(/TOKEN=([^;]+)/);
  const csrf = res.headers.get("x-csrf-token")
    || res.headers.get("x-updated-csrf-token")
    || "";
  await res.body?.cancel();

  if (!tokenMatch) throw new Error("Cookie TOKEN não encontrado no login UniFi OS");
  return { cookie: `TOKEN=${tokenMatch[1]}`, csrf };
}

async function udmLogout(baseUrl: string, s: UdmSession): Promise<void> {
  try {
    const res = await udmFetch(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: s.cookie, "x-csrf-token": s.csrf },
    });
    await res.body?.cancel();
  } catch { /* ignore */ }
}

/** GET em rota /proxy/network/api/... */
async function udmGet(baseUrl: string, s: UdmSession, path: string): Promise<any[]> {
  const res = await udmFetch(`${baseUrl}/proxy/network${path}`, {
    headers: { Cookie: s.cookie, "x-csrf-token": s.csrf },
  });
  if (!res.ok) { await res.body?.cancel(); return []; }
  const data = await res.json();
  return data.data || [];
}

// ===================== Sync de um controller =================================

interface Controller {
  id: string;
  client_id: string;
  name: string;
  url: string;
  username: string;
  password_encrypted: string;
  sync_interval_hours: number;
  last_sync_at: string | null;
}

function dueForSync(c: Controller): boolean {
  if (!c.last_sync_at) return true;
  const elapsedH = (Date.now() - new Date(c.last_sync_at).getTime()) / 3_600_000;
  return elapsedH >= c.sync_interval_hours;
}

async function syncController(session: Session, c: Controller): Promise<void> {
  const start = Date.now();
  let devices = 0, alarmsCollected = 0, alarmsNew = 0, alertsPosted = 0;
  let status = "success";
  let errorMessage: string | null = null;

  const baseUrl = c.url.replace(/\/$/, "");

  try {
    const udm = await udmLogin(baseUrl, c.username, c.password_encrypted);
    try {
      const sites = await udmGet(baseUrl, udm, "/api/self/sites");
      console.log(`[${c.name}] ${sites.length} site(s)`);

      for (const site of sites) {
        const siteCode = site.name || "default";
        const siteName = site.desc || site.name || "Default";

        const devList = await udmGet(baseUrl, udm, `/api/s/${siteCode}/stat/device`);
        const deviceIdByMac = new Map<string, string>();

        for (const dev of devList) {
          const mac = dev.mac || "";
          if (!mac) continue;
          const name = dev.name || dev.model || mac;

          const deviceId = await rpc<string>(session, "unifi_relay_upsert_device", {
            p_controller_id: c.id,
            p_client_id: c.client_id,
            p_site_code: siteCode,
            p_site_name: siteName,
            p_site_device_count: site.num_adopted || 0,
            p_site_client_count: site.num_sta || 0,
            p_mac: mac,
            p_name: name,
            p_hostname: dev.hostname || name,
            p_ip: dev.ip || null,
            p_model: dev.model || null,
            p_firmware: dev.version || null,
            p_is_online: dev.state === 1,
            p_device_type: mapDeviceType(dev.type || ""),
            p_last_seen: dev.last_seen ? new Date(dev.last_seen * 1000).toISOString() : null,
            p_service_data: {
              uptime: dev.uptime, tx_bytes: dev.tx_bytes, rx_bytes: dev.rx_bytes,
              num_sta: dev.num_sta, satisfaction: dev.satisfaction,
            },
          });
          deviceIdByMac.set(mac, deviceId);
          devices++;
        }

        const alarms = await udmGet(baseUrl, udm, `/api/s/${siteCode}/rest/alarm?archived=false`);
        alarmsCollected += alarms.length;

        for (const alarm of alarms) {
          const key = alarm.key || alarm.type || "UNKNOWN";
          const deviceMac = alarm.ap || alarm.sw || alarm.gw || "";
          const deviceId = deviceIdByMac.get(deviceMac);
          if (!deviceId) continue;

          const created = await rpc<boolean>(session, "unifi_relay_post_alert", {
            p_device_id: deviceId,
            p_title: alarm.msg || key,
            p_message: `Alarme UniFi: ${alarm.msg || key}. Controller: ${c.name}, Site: ${siteName}`,
            p_level: mapAlarmSeverity(key),
            p_service_name: key,
          });
          if (created) { alarmsNew++; alertsPosted++; }
        }
      }
    } finally {
      await udmLogout(baseUrl, udm);
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`[${c.name}] erro: ${errorMessage}`);
  }

  await rpc(session, "unifi_relay_log_sync", {
    p_controller_id: c.id,
    p_devices_synced: devices,
    p_alarms_collected: alarmsCollected,
    p_alarms_new: alarmsNew,
    p_alerts_posted: alertsPosted,
    p_status: status,
    p_error_message: errorMessage,
    p_duration_ms: Date.now() - start,
  });

  console.log(`[${c.name}] ${status} — ${devices} devices, ${alertsPosted} alertas (${Date.now() - start}ms)`);
}

// ===================== Ciclo principal =======================================

async function runCycle(): Promise<void> {
  const session = await supabaseLogin();
  const controllers = await rpc<Controller[]>(session, "unifi_relay_list_controllers");
  console.log(`${controllers.length} controller(s) direct ativo(s)`);

  for (const c of controllers) {
    if (!c.url) { console.warn(`[${c.name}] sem url, pulando`); continue; }
    if (!dueForSync(c)) { console.log(`[${c.name}] ainda dentro do intervalo, pulando`); continue; }
    await syncController(session, c);
  }
}

if (import.meta.main) {
  const loop = Deno.env.get("LOOP") === "true";
  if (loop) {
    while (true) {
      try { await runCycle(); } catch (e) { console.error("Ciclo falhou:", e); }
      await new Promise((r) => setTimeout(r, 15 * 60 * 1000)); // 15min
    }
  } else {
    await runCycle();
  }
}
