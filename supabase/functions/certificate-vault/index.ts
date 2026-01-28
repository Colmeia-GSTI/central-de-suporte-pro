import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64 encode/decode helpers
function toBase64(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data));
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Secure certificate password management using server-side encryption
 * This function encrypts/decrypts certificate passwords before storage
 */

// Use a combination of service role key and a salt for encryption
// In production, you should use Supabase Vault or a dedicated KMS
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(serviceKey),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );
  
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: new Uint8Array(salt),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await deriveKey(salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv) },
    key,
    data
  );
  
  // Combine salt + iv + ciphertext and encode as base64
  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return "ENCRYPTED:" + toBase64(result);
}

async function decryptPassword(encryptedData: string): Promise<string> {
  // Check if data is encrypted
  if (!encryptedData.startsWith("ENCRYPTED:")) {
    // Return as-is if not encrypted (legacy data)
    return encryptedData;
  }
  
  const data = fromBase64(encryptedData.replace("ENCRYPTED:", ""));
  
  // Extract salt, iv, and ciphertext
  const salt = new Uint8Array(data.slice(0, 16));
  const iv = new Uint8Array(data.slice(16, 28));
  const ciphertext = new Uint8Array(data.slice(28));
  
  const key = await deriveKey(salt);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user authentication
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await supabase.auth.getUser(token);
    if (authError || !claims?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { action, password, certificate_id } = body;

    if (action === "encrypt") {
      if (!password) {
        return new Response(
          JSON.stringify({ error: "Password is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const encrypted = await encryptPassword(password);
      console.log("[CERTIFICATE-VAULT] Password encrypted successfully");

      return new Response(
        JSON.stringify({ success: true, encrypted_password: encrypted }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "decrypt") {
      if (!certificate_id) {
        return new Response(
          JSON.stringify({ error: "Certificate ID is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // AUTHORIZATION CHECK: Verify user has access to certificates via RLS
      // Use the user's authenticated client to check access (respects RLS policies)
      const { data: userCertCheck, error: accessError } = await supabase
        .from("certificates")
        .select("id")
        .eq("id", certificate_id)
        .maybeSingle();

      if (accessError || !userCertCheck) {
        console.warn(`[CERTIFICATE-VAULT] Unauthorized access attempt to certificate ${certificate_id} by user ${claims.user.id}`);
        return new Response(
          JSON.stringify({ error: "Certificate not found or unauthorized" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Now use service role to fetch the encrypted password (user already authorized above)
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: cert, error: fetchError } = await adminClient
        .from("certificates")
        .select("senha_hash")
        .eq("id", certificate_id)
        .single();

      if (fetchError || !cert) {
        return new Response(
          JSON.stringify({ error: "Certificate not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!cert.senha_hash) {
        return new Response(
          JSON.stringify({ error: "No password stored for this certificate" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const decrypted = await decryptPassword(cert.senha_hash);
      console.log("[CERTIFICATE-VAULT] Password decrypted successfully for authorized user");

      return new Response(
        JSON.stringify({ success: true, password: decrypted }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'encrypt' or 'decrypt'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[CERTIFICATE-VAULT] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
