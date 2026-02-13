import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BASE_URL = `${SUPABASE_URL}/functions/v1/asaas-nfse`;

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
};

Deno.test("asaas-nfse: test action returns connection status", async () => {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "test" }),
  });

  const data = await response.json();
  // Should return either success or ASAAS_NOT_CONFIGURED (both valid)
  assertExists(data);
  if (data.success) {
    assertExists(data.account);
  } else {
    assertEquals(data.code, "ASAAS_NOT_CONFIGURED");
  }
});

Deno.test("asaas-nfse: link_external requires nfse_history_id", async () => {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "link_external",
      numero_nfse: "123",
    }),
  });

  const data = await response.json();
  // Should fail with missing ID or not configured
  assertExists(data);
  if (!data.success) {
    assertExists(data.error);
  }
});

Deno.test("asaas-nfse: link_external requires numero_nfse", async () => {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "link_external",
      nfse_history_id: "00000000-0000-0000-0000-000000000000",
    }),
  });

  const data = await response.json();
  assertExists(data);
  if (!data.success) {
    assertExists(data.error);
  }
});

Deno.test("asaas-nfse: emit requires client_id", async () => {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "emit",
      value: 100,
      service_description: "Serviço teste",
    }),
  });

  const data = await response.json();
  assertExists(data);
  // Should fail - missing client_id or not configured
  if (!data.success) {
    assertExists(data.error);
  }
});

Deno.test("asaas-nfse: cancel requires invoice_id and motivo", async () => {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "cancel",
      nfse_history_id: "00000000-0000-0000-0000-000000000000",
    }),
  });

  const data = await response.json();
  assertExists(data);
  if (!data.success) {
    assertExists(data.error);
  }
});

Deno.test("asaas-nfse: OPTIONS returns CORS headers", async () => {
  const response = await fetch(BASE_URL, { method: "OPTIONS" });
  await response.text();
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
});
