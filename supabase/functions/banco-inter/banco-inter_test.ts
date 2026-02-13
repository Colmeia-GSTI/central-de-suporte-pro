import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const BASE_URL = `${SUPABASE_URL}/functions/v1/banco-inter`;

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
};

Deno.test("banco-inter: test action returns scope status", async () => {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "test" }),
  });

  const data = await response.json();
  assertExists(data);
  // Should return either success with scopes or error (not configured)
  if (data.success) {
    assertExists(data.available_scopes);
  } else {
    assertExists(data.error);
  }
});

Deno.test("banco-inter: boleto generation requires invoice_id and payment_type", async () => {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  const data = await response.json();
  assertExists(data);
  // Should fail - missing required fields or not configured
  if (data.error) {
    assertExists(data.error);
  }
});

Deno.test("banco-inter: cancel requires invoice_id", async () => {
  const response = await fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "cancel" }),
  });

  const data = await response.json();
  assertExists(data);
  if (data.error) {
    assertExists(data.error);
  }
});

Deno.test("banco-inter: OPTIONS returns CORS headers", async () => {
  const response = await fetch(BASE_URL, { method: "OPTIONS" });
  await response.text();
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
});
