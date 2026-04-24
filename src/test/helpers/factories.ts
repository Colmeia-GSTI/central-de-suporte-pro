/**
 * Lightweight factories for fixture data used across integration tests.
 * Keep them dumb: just shape + sensible defaults; tests override fields.
 */

export function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    email: "user@test.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
    user_metadata: { full_name: "Test User" },
    ...overrides,
  };
}

export function makeClient(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "client-1",
    name: "Cliente Teste",
    email: "cli@test.com",
    financial_email: null,
    whatsapp: null,
    ...overrides,
  };
}

export function makeContract(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "contract-1",
    client_id: "client-1",
    name: "Contrato Mensal",
    monthly_value: 1000,
    billing_day: 10,
    days_before_due: 30, // wide window so generation is in scope
    payment_preference: "boleto",
    billing_provider: null,
    nfse_enabled: false,
    nfse_aliquota: null,
    nfse_iss_retido: false,
    notification_message: null,
    description: null,
    nfse_descricao_customizada: null,
    nfse_service_code: null,
    first_billing_month: null,
    clients: { name: "Cliente Teste", email: "cli@test.com", financial_email: null },
    ...overrides,
  };
}

export function makeInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    id: "invoice-1",
    invoice_number: 100,
    amount: 1000,
    due_date: tomorrow.toISOString().split("T")[0],
    status: "pending",
    client_id: "client-1",
    contract_id: "contract-1",
    boleto_url: null,
    clients: makeClient(),
    ...overrides,
  };
}

export function makeTicketFormData(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    title: "Impressora não imprime",
    description: "Tentamos reiniciar mas continua sem responder ao spool.",
    client_id: "client-1",
    requester_contact_id: "contact-1",
    category_id: "cat-1",
    subcategory_id: "",
    priority: "medium" as const,
    origin: "portal" as const,
    assigned_to: "",
    ...overrides,
  };
}
