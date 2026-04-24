/**
 * Chainable Supabase client mock.
 *
 * Use `createSupabaseMock({ ... })` to define table responses and
 * function-invoke responses. Each `from(table)` returns a thenable
 * builder that resolves with the configured `{ data, error }` for that
 * table. The `.single()`, `.maybeSingle()`, `.limit()`, `.select()`,
 * `.eq()`, `.gte()`, `.lte()`, `.in()`, `.order()`, `.not()`, `.gt()`
 * methods all return `this` so any chain shape resolves to the same
 * configured value. `.insert()` / `.update()` / `.delete()` also return
 * the chainable so they can be awaited or further chained with `.select()`.
 */

import { vi } from "vitest";

type TableResponse =
  | { data: unknown; error: unknown }
  | (() => { data: unknown; error: unknown });

type FunctionResponse =
  | { data: unknown; error: unknown }
  | ((body: unknown) => { data: unknown; error: unknown });

export interface MockConfig {
  tables?: Record<string, TableResponse>;
  /** Responses keyed by function name for supabase.functions.invoke */
  functions?: Record<string, FunctionResponse>;
  /** auth.signInWithPassword response */
  signInResponse?: { data: unknown; error: unknown };
  /** auth.admin.listUsers response */
  listUsersResponse?: { data: unknown; error: unknown };
  /** auth.admin.generateLink response */
  generateLinkResponse?: { data: unknown; error: unknown };
  /** storage signed url response */
  signedUrlResponse?: { data: unknown; error: unknown };
}

export interface MockSpies {
  insertCalls: Array<{ table: string; payload: unknown }>;
  updateCalls: Array<{ table: string; payload: unknown }>;
  invokeCalls: Array<{ name: string; body: unknown }>;
}

export function createSupabaseMock(config: MockConfig = {}) {
  const spies: MockSpies = {
    insertCalls: [],
    updateCalls: [],
    invokeCalls: [],
  };

  const resolve = (resp: TableResponse | undefined) => {
    if (!resp) return { data: null, error: null };
    return typeof resp === "function" ? resp() : resp;
  };

  const buildBuilder = (table: string) => {
    const response = () => resolve(config.tables?.[table]);

    const builder: Record<string, unknown> = {};
    const chain = (..._args: unknown[]) => builder;

    builder.select = chain;
    builder.eq = chain;
    builder.neq = chain;
    builder.gt = chain;
    builder.gte = chain;
    builder.lt = chain;
    builder.lte = chain;
    builder.in = chain;
    builder.not = chain;
    builder.is = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.range = chain;
    builder.match = chain;

    builder.insert = (payload: unknown) => {
      spies.insertCalls.push({ table, payload });
      return builder;
    };
    builder.update = (payload: unknown) => {
      spies.updateCalls.push({ table, payload });
      return builder;
    };
    builder.delete = () => builder;
    builder.upsert = (payload: unknown) => {
      spies.insertCalls.push({ table, payload });
      return builder;
    };

    builder.single = () => Promise.resolve(response());
    builder.maybeSingle = () => Promise.resolve(response());
    builder.then = (
      onFulfilled: (v: { data: unknown; error: unknown }) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => Promise.resolve(response()).then(onFulfilled, onRejected);

    return builder;
  };

  const client = {
    from: vi.fn((table: string) => buildBuilder(table)),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    functions: {
      invoke: vi.fn(async (name: string, opts?: { body?: unknown }) => {
        spies.invokeCalls.push({ name, body: opts?.body });
        const fn = config.functions?.[name];
        if (!fn) return { data: null, error: null };
        return typeof fn === "function" ? fn(opts?.body) : fn;
      }),
    },
    auth: {
      signInWithPassword: vi.fn(async () =>
        config.signInResponse ?? { data: { user: null, session: null }, error: null },
      ),
      signOut: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      admin: {
        listUsers: vi.fn(async () =>
          config.listUsersResponse ?? { data: { users: [] }, error: null },
        ),
        generateLink: vi.fn(async () =>
          config.generateLinkResponse ?? { data: { properties: { action_link: "" } }, error: null },
        ),
      },
    },
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(async () =>
          config.signedUrlResponse ?? { data: { signedUrl: "" }, error: null },
        ),
      })),
    },
  };

  return { client, spies };
}
