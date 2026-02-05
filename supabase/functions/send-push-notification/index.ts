import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// VAPID keys for Web Push - must match frontend public key
const VAPID_PUBLIC_KEY = "BDQ4g_RaLdz1m7aQEEezyJ8OGEdpBMXqY9q3iKE0gHr3Q9mIPhNQ3NqzV8xzuPfRDKxT_G8kHy9sXB7CvKP_RvU";
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
  type: "ticket" | "alert" | "sla" | "custom" | "test";
  user_ids?: string[];
  role_filter?: string[];
  data: PushPayload;
}

// Base64 URL encoding/decoding utilities
function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Import EC private key for signing
async function importVapidPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  const privateKeyBytes = base64UrlDecode(privateKeyBase64);
  
  // Create JWK from raw private key bytes (32 bytes for P-256)
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: base64UrlEncode(privateKeyBytes),
    // We need to derive x and y from the public key
    x: base64UrlEncode(base64UrlDecode(VAPID_PUBLIC_KEY).slice(1, 33)),
    y: base64UrlEncode(base64UrlDecode(VAPID_PUBLIC_KEY).slice(33, 65)),
  };

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"]
  );
}

// Create VAPID JWT token
async function createVapidJwt(audience: string, privateKey: CryptoKey): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: VAPID_SUBJECT,
  };

  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    privateKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw format (64 bytes: r || s)
  const signatureArray = new Uint8Array(signature);
  const rawSignature = derToRaw(signatureArray);

  return `${unsignedToken}.${base64UrlEncode(rawSignature)}`;
}

// Convert DER encoded ECDSA signature to raw format
function derToRaw(signature: Uint8Array): Uint8Array {
  // WebCrypto returns raw format for ECDSA, not DER
  // But just in case, handle both
  if (signature.length === 64) {
    return signature;
  }
  
  // DER format: 0x30 [length] 0x02 [r-length] [r] 0x02 [s-length] [s]
  let offset = 2;
  const rLength = signature[offset + 1];
  const r = signature.slice(offset + 2, offset + 2 + rLength);
  offset = offset + 2 + rLength;
  const sLength = signature[offset + 1];
  const s = signature.slice(offset + 2, offset + 2 + sLength);
  
  // Pad or trim to 32 bytes each
  const rawSignature = new Uint8Array(64);
  rawSignature.set(r.length > 32 ? r.slice(-32) : r, 32 - Math.min(r.length, 32));
  rawSignature.set(s.length > 32 ? s.slice(-32) : s, 64 - Math.min(s.length, 32));
  
  return rawSignature;
}

// Generate encryption keys for Web Push payload
async function generateEncryptionKeys(p256dhKey: string, authSecret: string) {
  // Generate ephemeral ECDH key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Import subscriber's public key
  const subscriberPublicKeyBytes = base64UrlDecode(p256dhKey);
  const subscriberPublicKey = await crypto.subtle.importKey(
    "raw",
    subscriberPublicKeyBytes.buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // Derive shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: subscriberPublicKey },
    localKeyPair.privateKey,
    256
  );

  // Export local public key
  const localPublicKey = await crypto.subtle.exportKey("raw", localKeyPair.publicKey);
  const localPublicKeyBytes = new Uint8Array(localPublicKey);

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive content encryption key using HKDF
  const authSecretBytes = base64UrlDecode(authSecret);
  
  // PRK = HKDF-Extract(auth_secret, shared_secret)
  const prkKey = await crypto.subtle.importKey(
    "raw",
    authSecretBytes.buffer as ArrayBuffer,
    { name: "HKDF" },
    false,
    ["deriveBits", "deriveKey"]
  );

  // Info for key derivation - "Content-Encoding: aes128gcm"
  const keyInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");

  // Create info with ecdh context
  const context = new Uint8Array([
    ...new TextEncoder().encode("P-256\0"),
    0, 65, ...subscriberPublicKeyBytes,
    0, 65, ...localPublicKeyBytes,
  ]);

  const ikm = new Uint8Array(sharedSecret);
  
  // Import IKM for HKDF
  const ikmKey = await crypto.subtle.importKey(
    "raw",
    ikm,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );

  // Derive CEK (Content Encryption Key) - 16 bytes
  const cekBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      salt: salt,
      info: new Uint8Array([...keyInfo, ...context]),
      hash: "SHA-256",
    },
    ikmKey,
    128
  );

  // Derive nonce - 12 bytes
  const nonceBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      salt: salt,
      info: new Uint8Array([...nonceInfo, ...context]),
      hash: "SHA-256",
    },
    ikmKey,
    96
  );

  return {
    contentEncryptionKey: new Uint8Array(cekBits),
    nonce: new Uint8Array(nonceBits),
    salt,
    localPublicKey: localPublicKeyBytes,
  };
}

// Encrypt payload using AES-128-GCM
async function encryptPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<{ encrypted: Uint8Array; salt: Uint8Array; localPublicKey: Uint8Array }> {
  const { contentEncryptionKey, nonce, salt, localPublicKey } = await generateEncryptionKeys(
    p256dhKey,
    authSecret
  );

  // Import CEK for AES-GCM
  const aesKey = await crypto.subtle.importKey(
    "raw",
    contentEncryptionKey,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // Add padding (2 bytes padding length + padding + payload + 0x02 delimiter)
  const payloadBytes = new TextEncoder().encode(payload);
  const paddingLength = 0;
  const record = new Uint8Array(2 + paddingLength + payloadBytes.length + 1);
  record[0] = (paddingLength >> 8) & 0xff;
  record[1] = paddingLength & 0xff;
  record.set(payloadBytes, 2 + paddingLength);
  record[record.length - 1] = 2; // Final record delimiter

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    record
  );

  return {
    encrypted: new Uint8Array(encrypted),
    salt,
    localPublicKey,
  };
}

// Build aes128gcm encrypted content encoding body
function buildEncryptedBody(
  encrypted: Uint8Array,
  salt: Uint8Array,
  localPublicKey: Uint8Array,
  recordSize: number = 4096
): Uint8Array {
  // Header: salt (16) + rs (4) + idlen (1) + keyid (65)
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  
  // Record size as 4 bytes big-endian
  header[16] = (recordSize >> 24) & 0xff;
  header[17] = (recordSize >> 16) & 0xff;
  header[18] = (recordSize >> 8) & 0xff;
  header[19] = recordSize & 0xff;
  
  // Key ID length and key ID (local public key)
  header[20] = 65;
  header.set(localPublicKey, 21);

  // Combine header and encrypted data
  const body = new Uint8Array(header.length + encrypted.length);
  body.set(header, 0);
  body.set(encrypted, header.length);

  return body;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!VAPID_PRIVATE_KEY) {
      console.error("[Web Push] VAPID_PRIVATE_KEY not configured");
      return { success: false, error: "VAPID_PRIVATE_KEY not configured" };
    }

    const payloadString = JSON.stringify(payload);
    console.log(`[Web Push] Sending to endpoint: ${subscription.endpoint.substring(0, 60)}...`);

    // Import VAPID private key
    const privateKey = await importVapidPrivateKey(VAPID_PRIVATE_KEY);

    // Create VAPID JWT
    const audience = new URL(subscription.endpoint).origin;
    const vapidToken = await createVapidJwt(audience, privateKey);

    // Encrypt payload
    const { encrypted, salt, localPublicKey } = await encryptPayload(
      payloadString,
      subscription.p256dh,
      subscription.auth
    );

    // Build encrypted body
    const body = buildEncryptedBody(encrypted, salt, localPublicKey);

    // Send push request
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "TTL": "86400",
        "Authorization": `vapid t=${vapidToken}, k=${VAPID_PUBLIC_KEY}`,
      },
      body: body.buffer as ArrayBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Web Push] Failed: ${response.status} - ${errorText}`);
      return { 
        success: false, 
        error: `Push service returned ${response.status}: ${errorText}` 
      };
    }

    console.log(`[Web Push] Success: ${response.status}`);
    return { success: true };
  } catch (error) {
    console.error("[Web Push] Error:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
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

    // Build query for subscriptions
    let query = supabase.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");

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
      console.error("[send-push-notification] Error fetching subscriptions:", error);
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
      case "test":
        pushPayload.tag = "test-notification";
        break;
    }

    // Override with custom data
    pushPayload = { ...pushPayload, ...data };

    // Send push to all subscriptions
    let successCount = 0;
    const failedEndpoints: string[] = [];
    const errors: string[] = [];

    for (const sub of subscriptions) {
      if (!sub.p256dh || !sub.auth) {
        console.warn(`[send-push-notification] Subscription ${sub.id} missing keys`);
        failedEndpoints.push(sub.endpoint);
        continue;
      }

      const result = await sendWebPush(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        pushPayload
      );

      if (result.success) {
        successCount++;
      } else {
        failedEndpoints.push(sub.endpoint);
        if (result.error) {
          errors.push(result.error);
        }
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
        errors: errors.slice(0, 3), // Return first 3 errors for debugging
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
