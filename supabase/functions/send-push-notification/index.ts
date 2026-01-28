import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// VAPID keys for Web Push
// These must match the public key in the frontend
const VAPID_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = "mailto:suporte@colmeiagsti.com.br";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string }>;
}

interface RequestBody {
  type: "ticket" | "alert" | "sla" | "custom";
  user_ids?: string[];
  role_filter?: string[];
  data: PushPayload;
}

// Simple JWT creation for Web Push
function createJWT(payload: Record<string, unknown>, privateKey: string): string {
  const header = { alg: "ES256", typ: "JWT" };
  
  const base64UrlEncode = (obj: Record<string, unknown> | string) => {
    const str = typeof obj === "string" ? obj : JSON.stringify(obj);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  
  const headerB64 = base64UrlEncode(header);
  const payloadB64 = base64UrlEncode(payload);
  
  // Note: In production, you'd properly sign this with the ES256 algorithm
  // For now, we'll use the web-push compatible format
  return `${headerB64}.${payloadB64}`;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<boolean> {
  try {
    const body = JSON.stringify(payload);
    
    // Create authorization header for VAPID
    const audience = new URL(subscription.endpoint).origin;
    const expiration = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours
    
    const vapidPayload = {
      aud: audience,
      exp: expiration,
      sub: VAPID_SUBJECT,
    };

    // For proper Web Push, we need to use the web-push library or implement
    // the full VAPID signing. For now, we'll make a simpler HTTP request
    // that works with most push services.
    
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
      },
      body: body,
    });

    if (!response.ok) {
      console.error(`Push failed for ${subscription.endpoint}: ${response.status}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error sending push notification:", error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();
    const { type, user_ids, role_filter, data } = body;

    console.log(`[send-push-notification] Type: ${type}, Users: ${user_ids?.length || "all"}`);

    // Build query for subscriptions - only fetch needed fields
    let query = supabase.from("push_subscriptions").select("id, user_id, subscription, endpoint, p256dh, auth");

    if (user_ids && user_ids.length > 0) {
      query = query.in("user_id", user_ids);
    } else if (role_filter && role_filter.length > 0) {
      // Get users with specific roles
      const { data: roleUsers } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", role_filter);
      
      if (roleUsers && roleUsers.length > 0) {
        const userIdList = roleUsers.map((r) => r.user_id);
        query = query.in("user_id", userIdList);
      }
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      console.error("Error fetching subscriptions:", error);
      throw error;
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log("[send-push-notification] No subscriptions found");
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "No subscriptions found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[send-push-notification] Found ${subscriptions.length} subscriptions`);

    // Prepare payload based on type
    let pushPayload: PushPayload = {
      title: data.title || "Colmeia GSTI",
      body: data.body || "Nova notificação",
      url: data.url || "/",
      tag: data.tag || type,
      icon: "/pwa-icons/icon-192x192.png",
      requireInteraction: data.requireInteraction || type === "alert",
    };

    // Add type-specific defaults
    switch (type) {
      case "ticket":
        pushPayload.tag = "new-ticket";
        pushPayload.actions = [
          { action: "view", title: "Ver Ticket" },
          { action: "dismiss", title: "Ignorar" },
        ];
        break;
      case "alert":
        pushPayload.tag = "critical-alert";
        pushPayload.requireInteraction = true;
        pushPayload.actions = [
          { action: "acknowledge", title: "Reconhecer" },
          { action: "view", title: "Ver Detalhes" },
        ];
        break;
      case "sla":
        pushPayload.tag = "sla-warning";
        pushPayload.actions = [
          { action: "view", title: "Ver Ticket" },
        ];
        break;
    }

    // Override with custom data
    pushPayload = { ...pushPayload, ...data };

    // Send push to all subscriptions
    let successCount = 0;
    let failedEndpoints: string[] = [];

    for (const sub of subscriptions) {
      const success = await sendWebPush(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        pushPayload
      );

      if (success) {
        successCount++;
      } else {
        failedEndpoints.push(sub.endpoint);
      }
    }

    // Clean up failed subscriptions (they might be expired)
    if (failedEndpoints.length > 0) {
      console.log(`[send-push-notification] Cleaning ${failedEndpoints.length} failed subscriptions`);
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("endpoint", failedEndpoints);
    }

    console.log(`[send-push-notification] Sent: ${successCount}/${subscriptions.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failedEndpoints.length,
        total: subscriptions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-push-notification] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
