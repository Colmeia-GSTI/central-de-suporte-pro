/**
 * Minimal fetch helpers for testing edge function logic that may
 * call external HTTP services. We don't need MSW because handlers
 * are extracted as pure functions and receive a supabase mock.
 */

import { vi } from "vitest";

export function mockFetchOnce(response: { status?: number; body?: unknown }) {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify(response.body ?? {}), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

export function restoreFetch() {
  // jsdom installs a default fetch — leave it alone after tests.
}
