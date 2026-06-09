import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============ STRUCTURED LOGGING ============
function generateCorrelationId(): string {
  return `asaas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function log(correlationId: string, level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    correlationId,
    level,
    message,
    ...data,
  };
  if (level === "error") {
    console.error(`[ASAAS-NFSE] ${JSON.stringify(entry)}`);
  } else {
    console.log(`[ASAAS-NFSE] ${JSON.stringify(entry)}`);
  }
}

// ============ EVENT LOGGING TO DATABASE ============
async function logNfseEvent(
  supabase: SupabaseClient,
  nfseHistoryId: string,
  eventType: string,
  eventLevel: "info" | "warn" | "error" | "debug",
  message: string,
  correlationId: string,
  details?: Record<string, unknown>
) {
  try {
    await supabase.from("nfse_event_logs").insert({
      nfse_history_id: nfseHistoryId,
      event_type: eventType,
      event_level: eventLevel,
      message,
      details: details || null,
      correlation_id: correlationId,
      source: "asaas-nfse",
    });
  } catch (e) {
    console.warn("[ASAAS-NFSE] Failed to log event:", e);
  }
}

// ============ ERROR CODES ============
const ERROR_CODES = {
  ASAAS_NOT_CONFIGURED: "Integração Asaas não configurada ou inativa",
  CLIENT_NOT_FOUND: "Cliente não encontrado",
  CUSTOMER_CREATE_FAILED: "Falha ao criar cliente no Asaas",
  INVOICE_CREATE_FAILED: "Falha ao criar NFS-e",
  CANCEL_NOT_ALLOWED: "Cancelamento não permitido",
  DELETE_NOT_ALLOWED: "Exclusão não permitida",
  RECORD_NOT_FOUND: "Registro não encontrado",
  ASAAS_API_ERROR: "Erro da API Asaas",
  DPS_DUPLICADA: "NFS-e duplicada - já emitida no Asaas",
} as const;

// ============ NORMALIZE SERVICE CODE ============
function normalizeServiceCode(code: string): string {
  // CORREÇÃO DEFINITIVA: NÃO remover zeros à esquerda
  // O código "010701" deve ser mantido como "010701" para match correto com a municipalidade
  return code.replace(/[.\s\-]/g, "");
}

// ============ KNOWN PREFEITURA ERRORS ============
interface KnownError {
  code: string;
  title: string;
  message: string;
  action: string;
}

const KNOWN_PREFEITURA_ERRORS: Record<string, KnownError> = {
  E0014: {
    code: "DPS_DUPLICADA",
    title: "Nota Fiscal já existe",
    message: "Esta NFS-e já foi emitida anteriormente com os mesmos dados no provedor Asaas.",
    action: "VERIFY_EXTERNAL",
  },
  E0001: {
    code: "CERT_INVALIDO",
    title: "Certificado digital inválido",
    message: "Verifique os dados do certificado digital.",
    action: "CHECK_CERTIFICATE",
  },
  E0002: {
    code: "DADOS_INCOMPLETOS",
    title: "Dados incompletos",
    message: "Verifique os dados do prestador ou tomador.",
    action: "CHECK_DATA",
  },
};

// Parse error code from prefeitura status description
function parseStatusDescription(statusDescription: string | null): {
  codigo: string | null;
  descricao: string;
  acao: string | null;
  knownError: KnownError | null;
} {
  if (!statusDescription) {
    return { codigo: null, descricao: "Erro desconhecido", acao: null, knownError: null };
  }
  
  // Extract code from format "Código: E0014\r\nDescrição: ..."
  const codigoMatch = statusDescription.match(/C[oó]digo:\s*(\w+)/i);
  const descMatch = statusDescription.match(/Descri[cç][aã]o:\s*(.+?)(?:\r?\n|$)/i);
  
  const codigo = codigoMatch?.[1] || null;
  const descricao = descMatch?.[1]?.trim() || statusDescription;
  
  // Check if it's a known error
  const knownError = codigo ? KNOWN_PREFEITURA_ERRORS[codigo] || null : null;
  
  // Map known actions
  const acoesConhecidas: Record<string, string> = {
    E0014: "Verifique se a nota já existe no Asaas e use 'Vincular Nota Existente'",
    E0001: "Verifique os dados do certificado digital",
    E0002: "Verifique os dados do prestador e tomador de serviço",
  };
  
  return {
    codigo,
    descricao,
    acao: codigo ? acoesConhecidas[codigo] || null : null,
    knownError,
  };
}

interface AsaasSettings {
  api_key: string;
  wallet_id?: string;
  environment: "sandbox" | "production";
  webhook_token: string;
}

class AsaasApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, code: string = "ASAAS_API_ERROR", details?: Record<string, unknown>) {
    super(message);
    this.name = "AsaasApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const ASAAS_URLS = {
  sandbox: "https://sandbox.asaas.com/api/v3",
  production: "https://api.asaas.com/v3",
};

// Helper to normalize competencia to full date format (YYYY-MM-DD)
function normalizeCompetencia(competencia?: string): string {
  if (!competencia) {
    return new Date().toISOString().slice(0, 10);
  }
  // If already full date format (YYYY-MM-DD), return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(competencia)) {
    return competencia;
  }
  // If month format (YYYY-MM), append -01
  if (/^\d{4}-\d{2}$/.test(competencia)) {
    return `${competencia}-01`;
  }
  // Default to current date
  return new Date().toISOString().slice(0, 10);
}

// ============ ADDRESS HELPERS ============
function extractStreetFromAddress(address: string): string {
  // Remove o número do endereço (ex: "RUA X, 123" -> "RUA X")
  return address.replace(/,?\s*\d+\s*(-.*)?$/, "").trim() || address;
}

function extractNumberFromAddress(address: string): string | null {
  // Extrai número do endereço (ex: "RUA X, 123" -> "123")
  const match = address.match(/,?\s*(\d+)\s*(?:-|$)/);
  return match ? match[1] : null;
}

// ============ CUSTOMER SYNC FOR NFS-e ============
interface ClientData {
  id: string;
  name: string;
  email: string | null;
  financial_email: string | null;
  phone: string | null;
  whatsapp: string | null;
  document: string | null;
  zip_code: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  asaas_customer_id: string | null;
}

async function ensureCustomerSync(
  supabase: SupabaseClient,
  settings: AsaasSettings,
  clientId: string,
  correlationId: string
): Promise<{ customerId: string; client: ClientData }> {
  // 1. Buscar cliente COM TODOS os campos necessários
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, email, financial_email, phone, whatsapp, document, zip_code, address, city, state, asaas_customer_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    throw new AsaasApiError(ERROR_CODES.CLIENT_NOT_FOUND, 404, "CLIENT_NOT_FOUND");
  }

  // 2. Validar dados obrigatórios para NFS-e
  const email = client.email || client.financial_email;
  const address = client.address;
  const postalCode = client.zip_code?.replace(/\D/g, "");

  const missingFields: string[] = [];
  if (!email) missingFields.push("E-mail");
  if (!address) missingFields.push("Endereço");
  if (!postalCode || postalCode.length !== 8) missingFields.push("CEP válido (8 dígitos)");

  if (missingFields.length > 0) {
    throw new AsaasApiError(
      `Dados obrigatórios do cliente faltando: ${missingFields.join(", ")}. Atualize o cadastro do cliente antes de emitir NFS-e.`,
      400,
      "CLIENT_INCOMPLETE_DATA"
    );
  }

  // 3. Montar payload completo para Asaas
  const customerPayload = {
    name: client.name,
    email: email,
    phone: client.phone?.replace(/\D/g, "") || undefined,
    mobilePhone: client.whatsapp?.replace(/\D/g, "") || undefined,
    cpfCnpj: client.document?.replace(/\D/g, ""),
    postalCode: postalCode,
    address: extractStreetFromAddress(address),
    addressNumber: extractNumberFromAddress(address) || "S/N",
    province: client.city || "Não informado",
    externalReference: client.id,
    notificationDisabled: false,
  };

  let customerId: string;

  // 4. Criar ou atualizar cliente no Asaas
  if (client.asaas_customer_id) {
    // Cliente existe - ATUALIZAR para garantir dados sincronizados
    log(correlationId, "info", "Sincronizando dados do cliente no Asaas", { 
      customer_id: client.asaas_customer_id,
      email: email,
      postal_code: postalCode 
    });
    try {
      await asaasRequest(
        settings, 
        `/customers/${client.asaas_customer_id}`, 
        "PUT", 
        customerPayload, 
        correlationId
      );
    } catch (updateError) {
      // Se falhar o update, pode ser que o cliente foi deletado no Asaas - tentar criar novo
      log(correlationId, "warn", "Falha ao atualizar cliente, tentando criar novo", { 
        error: updateError instanceof Error ? updateError.message : String(updateError)
      });
      const newCustomer = await asaasRequest(settings, "/customers", "POST", customerPayload, correlationId);
      await supabase
        .from("clients")
        .update({ asaas_customer_id: newCustomer.id })
        .eq("id", clientId);
      return { customerId: newCustomer.id, client: client as ClientData };
    }
    customerId = client.asaas_customer_id;
  } else {
    // Cliente não existe - CRIAR com dados completos
    log(correlationId, "info", "Criando cliente no Asaas com dados completos", {
      email: email,
      postal_code: postalCode,
      address: address
    });
    const customer = await asaasRequest(settings, "/customers", "POST", customerPayload, correlationId);
    customerId = customer.id;
    
    // Salvar ID do Asaas no cliente local
    await supabase
      .from("clients")
      .update({ asaas_customer_id: customerId })
      .eq("id", clientId);
  }

  return { customerId, client: client as ClientData };
}

/**
 * Versão "leve" do sync de cliente, usada antes de criar BOLETO/PIX.
 * Diferente de ensureCustomerSync (que exige email+endereço+CEP por causa da NFS-e),
 * aqui exigimos apenas nome + CNPJ/CPF. Sempre faz PUT se o cliente já existir no
 * Asaas, para garantir que mudanças locais de CNPJ/email se propaguem antes do
 * boleto ser emitido.
 */
async function ensureCustomerForPayment(
  supabase: SupabaseClient,
  settings: AsaasSettings,
  clientId: string,
  correlationId: string,
): Promise<{ customerId: string; client: ClientData }> {
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("id, name, email, financial_email, phone, whatsapp, document, zip_code, address, city, state, asaas_customer_id")
    .eq("id", clientId)
    .single();

  if (clientError || !client) {
    throw new AsaasApiError(ERROR_CODES.CLIENT_NOT_FOUND, 404, "CLIENT_NOT_FOUND");
  }

  const cpfCnpj = client.document?.replace(/\D/g, "");
  if (!cpfCnpj) {
    throw new AsaasApiError(
      "Cliente sem CPF/CNPJ cadastrado. Atualize o cadastro antes de gerar cobrança.",
      400,
      "CLIENT_MISSING_DOCUMENT",
    );
  }

  const email = client.financial_email || client.email || undefined;
  const postalCode = client.zip_code?.replace(/\D/g, "");

  const customerPayload: Record<string, unknown> = {
    name: client.name,
    cpfCnpj,
    email,
    phone: client.phone?.replace(/\D/g, "") || undefined,
    mobilePhone: client.whatsapp?.replace(/\D/g, "") || undefined,
    externalReference: client.id,
    notificationDisabled: false,
  };
  // Endereço é opcional para boleto/PIX, mas se houver enviamos
  if (postalCode && postalCode.length === 8) {
    customerPayload.postalCode = postalCode;
    if (client.address) {
      customerPayload.address = extractStreetFromAddress(client.address);
      customerPayload.addressNumber = extractNumberFromAddress(client.address) || "S/N";
    }
    if (client.city) customerPayload.province = client.city;
  }

  let customerId: string;
  if (client.asaas_customer_id) {
    log(correlationId, "info", "Sincronizando cliente no Asaas antes da cobrança", {
      customer_id: client.asaas_customer_id,
      cpf_cnpj: cpfCnpj,
    });
    try {
      await asaasRequest(
        settings,
        `/customers/${client.asaas_customer_id}`,
        "PUT",
        customerPayload,
        correlationId,
      );
      customerId = client.asaas_customer_id;
    } catch (updateError) {
      log(correlationId, "warn", "Falha ao atualizar cliente no Asaas, criando novo", {
        error: updateError instanceof Error ? updateError.message : String(updateError),
      });
      const newCustomer = await asaasRequest(settings, "/customers", "POST", customerPayload, correlationId);
      customerId = newCustomer.id;
      await supabase.from("clients").update({ asaas_customer_id: customerId }).eq("id", clientId);
    }
  } else {
    log(correlationId, "info", "Criando cliente no Asaas (não existia)");
    const newCustomer = await asaasRequest(settings, "/customers", "POST", customerPayload, correlationId);
    customerId = newCustomer.id;
    await supabase.from("clients").update({ asaas_customer_id: customerId }).eq("id", clientId);
  }

  return { customerId, client: client as ClientData };
}



function generateValidCpf(): string {
  const randomDigit = () => Math.floor(Math.random() * 10);
  const computeDigit = (digits: number[], factor: number) => {
    let sum = 0;
    for (const d of digits) {
      sum += d * factor;
      factor -= 1;
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const base: number[] = Array.from({ length: 9 }, randomDigit);
    const allSame = base.every((d) => d === base[0]);
    if (allSame) continue;
    const d1 = computeDigit(base, 10);
    const d2 = computeDigit([...base, d1], 11);
    return [...base, d1, d2].join("");
  }
  return "39053344705";
}

// deno-lint-ignore no-explicit-any
async function getAsaasConfig(supabase: any): Promise<AsaasSettings | null> {
  const { data, error } = await supabase
    .from("integration_settings")
    .select("settings, is_active")
    .eq("integration_type", "asaas")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return data.settings as AsaasSettings;
}

async function asaasRequest(
  settings: AsaasSettings,
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>,
  correlationId?: string
) {
  const baseUrl = ASAAS_URLS[settings.environment];
  const url = `${baseUrl}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Colmeia-Helpdesk/1.0",
    "access_token": settings.api_key,
  };

  if (settings.wallet_id) {
    headers["X-WalletId"] = settings.wallet_id;
  }

  if (correlationId) {
    log(correlationId, "info", `API Request: ${method} ${endpoint}`, { body: body ? JSON.stringify(body).slice(0, 200) : undefined });
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  let data: Record<string, unknown> = {};

  if (responseText.trim()) {
    try {
      data = JSON.parse(responseText) as Record<string, unknown>;
    } catch (parseError) {
      if (correlationId) {
        log(correlationId, "error", "Resposta inválida da API Asaas", {
          status: response.status,
          endpoint,
          parse_error: parseError instanceof Error ? parseError.message : String(parseError),
          response_preview: responseText.slice(0, 300),
        });
      }
      throw new AsaasApiError("Resposta inválida da API Asaas", 502, "ASAAS_INVALID_RESPONSE", {
        status: response.status,
        endpoint,
      });
    }
  }

  if (!response.ok) {
    const errors = Array.isArray(data.errors) ? data.errors as Array<{ description?: string; code?: string }> : [];
    const message = errors[0]?.description || (typeof data.message === "string" ? data.message : null) || "Erro na API Asaas";
    const code = errors[0]?.code || "ASAAS_API_ERROR";
    if (correlationId) {
      log(correlationId, "error", `API Error: ${message}`, { status: response.status, errors: data.errors });
    }
    throw new AsaasApiError(message, response.status, code, { asaas_errors: data.errors });
  }

  return data;
}

function buildErrorResponse(
  correlationId: string,
  error: unknown,
  defaultCode: string = "INTERNAL_ERROR"
): Response {
  const message = error instanceof Error ? error.message : "Erro interno";
  const status = error instanceof AsaasApiError ? error.status : 500;
  const code = error instanceof AsaasApiError ? error.code : defaultCode;
  const details = error instanceof AsaasApiError ? error.details : undefined;

  log(correlationId, "error", message, { code, details });

  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      code,
      details: {
        ...details,
        correlation_id: correlationId,
      },
    }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = generateCorrelationId();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, ...params } = await req.json();
    
    log(correlationId, "info", `Ação recebida: ${action}`, {
      client_id: params.client_id,
      invoice_id: params.invoice_id,
      value: params.value,
      nfse_history_id: params.nfse_history_id,
    });

    const settings = await getAsaasConfig(supabase);
    if (!settings) {
      return new Response(
        JSON.stringify({
          success: false,
          error: ERROR_CODES.ASAAS_NOT_CONFIGURED,
          code: "ASAAS_NOT_CONFIGURED",
          details: { correlation_id: correlationId },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log(correlationId, "info", `Ambiente: ${settings.environment}`);

    switch (action) {
      case "test": {
        const account = await asaasRequest(settings, "/myAccount", "GET", undefined, correlationId);
        log(correlationId, "info", "Teste de conexão bem-sucedido");
        return new Response(
          JSON.stringify({ success: true, account, correlation_id: correlationId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "list_services": {
        const { city } = params;
        const endpoint = city 
          ? `/invoices/municipalServices?city=${encodeURIComponent(city)}`
          : "/invoices/municipalServices";
        const services = await asaasRequest(settings, endpoint, "GET", undefined, correlationId);
        return new Response(
          JSON.stringify({ success: true, services: services.data || [], correlation_id: correlationId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_customer": {
        const { client_id } = params;

        const { data: client, error: clientError } = await supabase
          .from("clients")
          .select("id, name, email, financial_email, phone, whatsapp, document, zip_code, address, city, asaas_customer_id")
          .eq("id", client_id)
          .single();

        if (clientError || !client) {
          throw new AsaasApiError(ERROR_CODES.CLIENT_NOT_FOUND, 404, "CLIENT_NOT_FOUND");
        }

        if (client.asaas_customer_id) {
          log(correlationId, "info", "Cliente já existe no Asaas", { customer_id: client.asaas_customer_id });
          return new Response(
            JSON.stringify({ success: true, customer_id: client.asaas_customer_id, correlation_id: correlationId }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const customerData = {
          name: client.name,
          email: client.email || client.financial_email,
          phone: client.phone?.replace(/\D/g, ""),
          mobilePhone: client.whatsapp?.replace(/\D/g, ""),
          cpfCnpj: client.document?.replace(/\D/g, ""),
          postalCode: client.zip_code?.replace(/\D/g, ""),
          address: client.address,
          addressNumber: "S/N",
          province: client.city,
          externalReference: client.id,
          notificationDisabled: false,
        };

        const customer = await asaasRequest(settings, "/customers", "POST", customerData, correlationId);

        await supabase
          .from("clients")
          .update({ asaas_customer_id: customer.id })
          .eq("id", client_id);

        log(correlationId, "info", "Cliente criado no Asaas", { customer_id: customer.id });

        return new Response(
          JSON.stringify({ success: true, customer_id: customer.id, correlation_id: correlationId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "emit": {
        const {
          client_id,
          value,
          service_description,
          municipal_service_id,
          municipal_service_code,
          effective_date,
          retain_iss,
          iss_rate,
          nfse_history_id,
          payment_id,
          invoice_id,
          contract_id,
          competencia,
          // NFS-e Nacional 2026 - Tributos Federais
          pis_value,
          cofins_value,
          csll_value,
          irrf_value,
          inss_value,
          valor_liquido,
        } = params;

        log(correlationId, "info", "Iniciando emissão de NFS-e", { client_id, value, contract_id });

        // ============ PRE-EMISSION VALIDATION FOR RE-EMISSION ============
        // If nfse_history_id provided, check if it already has an asaas_invoice_id
        // This prevents E0014 (DPS duplicada) errors when re-emitting
        // Skip this check if force_new_emission is set (used after retry_failed)
        const force_new_emission = params.force_new_emission === true;
        if (nfse_history_id && !force_new_emission) {
          const { data: existing, error: existingError } = await supabase
            .from("nfse_history")
            .select("asaas_invoice_id, asaas_status, status, numero_nfse")
            .eq("id", nfse_history_id)
            .single();
          
          if (!existingError && existing?.asaas_invoice_id) {
            log(correlationId, "info", "Registro já possui asaas_invoice_id, verificando status no Asaas", {
              asaas_invoice_id: existing.asaas_invoice_id,
              local_status: existing.status,
            });
            
            try {
              // Query current status in Asaas before attempting re-emission
              const existingInvoice = await asaasRequest(
                settings, 
                `/invoices/${existing.asaas_invoice_id}`, 
                "GET", 
                undefined, 
                correlationId
              );
              
              // If already authorized, update local record and return success
              if (existingInvoice.status === "AUTHORIZED") {
                log(correlationId, "info", "NFS-e já autorizada no Asaas, atualizando registro local", {
                  number: existingInvoice.number,
                });
                
                await supabase
                  .from("nfse_history")
                  .update({
                    status: "autorizada",
                    asaas_status: "AUTHORIZED",
                    numero_nfse: existingInvoice.number?.toString() || null,
                    codigo_verificacao: existingInvoice.validationCode || null,
                    data_autorizacao: new Date().toISOString(),
                    mensagem_retorno: "Nota já autorizada anteriormente",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", nfse_history_id);
                
                await logNfseEvent(supabase, nfse_history_id, "already_authorized", "info",
                  `NFS-e já estava autorizada. Número: ${existingInvoice.number}`,
                  correlationId, { asaas_id: existingInvoice.id, number: existingInvoice.number });
                
                return new Response(
                  JSON.stringify({
                    success: true,
                    already_authorized: true,
                    invoice_id: existingInvoice.id,
                    number: existingInvoice.number,
                    history_id: nfse_history_id,
                    correlation_id: correlationId,
                    message: "NFS-e já autorizada anteriormente",
                  }),
                  { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
              }
              
              // If error with E0014 (DPS duplicada), auto-clean and continue re-emission
              if (existingInvoice.status === "ERROR") {
                const parsed = parseStatusDescription(existingInvoice.statusDescription);
                
                if (parsed.codigo === "E0014") {
                  log(correlationId, "warn", "E0014 detectado - limpando invoice com erro para permitir reemissão", {
                    statusDescription: existingInvoice.statusDescription,
                    asaas_invoice_id: existing.asaas_invoice_id,
                  });
                  
                  // Try to delete the failed invoice in Asaas
                  try {
                    await asaasRequest(settings, `/invoices/${existing.asaas_invoice_id}`, "DELETE", undefined, correlationId);
                    log(correlationId, "info", "Invoice com erro E0014 deletada no Asaas", { asaas_invoice_id: existing.asaas_invoice_id });
                  } catch (deleteErr) {
                    log(correlationId, "warn", "Falha ao deletar invoice E0014 no Asaas (prosseguindo)", {
                      error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
                    });
                  }
                  
                  // Clear asaas_invoice_id so a new one can be created
                  await supabase
                    .from("nfse_history")
                    .update({
                      asaas_invoice_id: null,
                      asaas_status: null,
                      status: "processando",
                      mensagem_retorno: null,
                      codigo_retorno: null,
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", nfse_history_id);
                  
                  await logNfseEvent(supabase, nfse_history_id, "e0014_auto_cleanup", "info",
                    "Invoice com erro E0014 limpa automaticamente para reemissão",
                    correlationId, {
                      old_asaas_invoice_id: existing.asaas_invoice_id,
                    });
                  
                  // Continue with normal emission flow (fall through)
                }
              }
              
            } catch (checkError) {
              // If it's our custom DPS_DUPLICADA error, re-throw
              if (checkError instanceof AsaasApiError && checkError.code === "DPS_DUPLICADA") {
                throw checkError;
              }
              // Otherwise log and continue with re-emission attempt
              log(correlationId, "warn", "Erro ao verificar status existente, tentando reemitir", {
                error: checkError instanceof Error ? checkError.message : String(checkError),
              });
            }
          }
        }

        // 1. Ensure customer exists in Asaas with COMPLETE data (email, address, postalCode)
        // This prevents "E-mail/Endereço/CEP incompleto" errors from Asaas
        const { customerId, client } = await ensureCustomerSync(supabase, settings, client_id, correlationId);

        // ============ AUTO-RESOLVE: municipal_service_code ============
        // Safety net: se o chamador não enviou o código, resolver automaticamente
        // a partir do contrato vinculado (contract_id, invoice_id ou nfse_history_id)
        let effectiveServiceCode = municipal_service_code;

        if (!effectiveServiceCode && !municipal_service_id) {
          // Tentar via contract_id direto
          if (contract_id) {
            const { data: contractForCode } = await supabase
              .from("contracts")
              .select("nfse_service_code")
              .eq("id", contract_id)
              .maybeSingle();
            if (contractForCode?.nfse_service_code) {
              effectiveServiceCode = contractForCode.nfse_service_code;
              log(correlationId, "info", "municipal_service_code resolvido do contrato", {
                contract_id, code: effectiveServiceCode,
              });
            }
          }

          // Tentar via invoice -> contract
          if (!effectiveServiceCode && invoice_id) {
            const { data: invoiceForCode } = await supabase
              .from("invoices")
              .select("contract_id, contracts(nfse_service_code)")
              .eq("id", invoice_id)
              .maybeSingle();
            const contractData = invoiceForCode?.contracts as { nfse_service_code: string | null } | null;
            if (contractData?.nfse_service_code) {
              effectiveServiceCode = contractData.nfse_service_code;
              log(correlationId, "info", "municipal_service_code resolvido via fatura->contrato", {
                invoice_id, code: effectiveServiceCode,
              });
            }
          }

          // Tentar via nfse_history -> codigo_tributacao ou contract
          if (!effectiveServiceCode && nfse_history_id) {
            const { data: historyForCode } = await supabase
              .from("nfse_history")
              .select("contract_id, codigo_tributacao")
              .eq("id", nfse_history_id)
              .maybeSingle();
            if (historyForCode?.codigo_tributacao) {
              effectiveServiceCode = historyForCode.codigo_tributacao;
              log(correlationId, "info", "municipal_service_code resolvido via nfse_history.codigo_tributacao", {
                nfse_history_id, code: effectiveServiceCode,
              });
            } else if (historyForCode?.contract_id) {
              const { data: cForCode } = await supabase
                .from("contracts")
                .select("nfse_service_code")
                .eq("id", historyForCode.contract_id)
                .maybeSingle();
              if (cForCode?.nfse_service_code) {
                effectiveServiceCode = cForCode.nfse_service_code;
                log(correlationId, "info", "municipal_service_code resolvido via nfse_history->contrato", {
                  contract_id: historyForCode.contract_id, code: effectiveServiceCode,
                });
              }
            }
          }

          // Fallback final: código de tributação padrão da empresa
          if (!effectiveServiceCode) {
            const { data: companyDefaults } = await supabase
              .from("company_settings")
              .select("nfse_codigo_tributacao_padrao")
              .limit(1)
              .maybeSingle();
            if (companyDefaults?.nfse_codigo_tributacao_padrao) {
              effectiveServiceCode = companyDefaults.nfse_codigo_tributacao_padrao;
              log(correlationId, "info", "municipal_service_code resolvido via company_settings.nfse_codigo_tributacao_padrao", {
                code: effectiveServiceCode,
              });
            }
          }
        }

        // 2. Buscar dados fiscais da empresa (sempre, pois são usados no payload)
        let emitenteCidade: string | null = null;
        let emitenteOptanteSN: boolean | null = null;
        let emitenteIncentivadorCultural: boolean | null = null;
        let emitenteCnaePadrao: string | null = null;
        try {
          const { data: companyData } = await supabase
            .from("company_settings")
            .select("endereco_cidade, nfse_optante_simples, nfse_incentivador_cultural, nfse_cnae_padrao")
            .limit(1)
            .maybeSingle();
          emitenteCidade = companyData?.endereco_cidade || null;
          emitenteOptanteSN = companyData?.nfse_optante_simples ?? null;
          emitenteIncentivadorCultural = companyData?.nfse_incentivador_cultural ?? null;
          emitenteCnaePadrao = companyData?.nfse_cnae_padrao || null;
          log(correlationId, "info", `Dados fiscais da empresa: Cidade=${emitenteCidade || "N/A"}, Optante SN=${emitenteOptanteSN}, CNAE padrão=${emitenteCnaePadrao || "N/A"}`);
        } catch (e) {
          log(correlationId, "warn", "Erro ao buscar dados fiscais da empresa", { error: String(e) });
        }

        // 3. Resolve municipal service ID if only code provided
        let resolvedMunicipalServiceId = municipal_service_id;
        let resolvedMunicipalServiceName: string | null = null;
        if (!resolvedMunicipalServiceId && effectiveServiceCode) {
          log(correlationId, "info", `Buscando municipalServiceId para código ${effectiveServiceCode}`);
          
          const normalizedTarget = normalizeServiceCode(effectiveServiceCode);
          
          // Tentar com filtro de cidade primeiro
          const tryResolve = async (city?: string): Promise<{ id: string; description: string } | null> => {
            const endpoint = city
              ? `/invoices/municipalServices?description=&city=${encodeURIComponent(city)}`
              : "/invoices/municipalServices";
            const servicesResponse = await asaasRequest(settings, endpoint, "GET", undefined, correlationId);
            const services = servicesResponse.data || [];
            // CORREÇÃO CRÍTICA: A API Asaas NÃO retorna campo `code`.
            // O código do serviço está embutido no início do campo `description` (ex: "01.07.01 - Suporte técnico...")
            const matchedService = services.find(
              (s: { description: string; id: string }) => {
                const codeMatch = s.description?.match(/^(\d{2}\.\d{2}\.\d{2})/);
                if (!codeMatch) return false;
                return normalizeServiceCode(codeMatch[1]) === normalizedTarget;
              }
            );
            if (matchedService) {
              const extractedCode = matchedService.description?.match(/^(\d{2}\.\d{2}\.\d{2})/)?.[1] || "";
              log(correlationId, "info", `MunicipalServiceId encontrado${city ? ` (cidade: ${city})` : ""}: ${matchedService.id}`, {
                matched_code: extractedCode,
              });
              return { id: matchedService.id, description: matchedService.description };
            }
            log(correlationId, "warn", `Nenhum match${city ? ` para cidade ${city}` : ""}`, {
              codigo_enviado: effectiveServiceCode,
              codigo_normalizado: normalizedTarget,
              codigos_disponiveis: services.map((s: { description: string }) => {
                const m = s.description?.match(/^(\d{2}\.\d{2}\.\d{2})/);
                return m ? m[1] : s.description?.slice(0, 30);
              }).slice(0, 20),
            });
            return null;
          };
          
          try {
            let resolved: { id: string; description: string } | null = null;
            // 1. Tentar com filtro de cidade
            if (emitenteCidade) {
              resolved = await tryResolve(emitenteCidade);
            }
            // 2. Fallback sem filtro de cidade
            if (!resolved) {
              resolved = await tryResolve();
            }
            if (resolved) {
              resolvedMunicipalServiceId = resolved.id;
              resolvedMunicipalServiceName = resolved.description;
            }
          } catch (e) {
            log(correlationId, "warn", "Não foi possível buscar serviços municipais", { error: String(e) });
          }
        }

        // 3. Create nfse_history record if not provided (with NFS-e Nacional 2026 fields)
        let historyId = nfse_history_id;
        if (!historyId) {
          const { data: historyRecord, error: historyError } = await supabase
            .from("nfse_history")
            .insert({
              client_id,
              invoice_id: invoice_id || null,
              contract_id: contract_id || null,
              competencia: normalizeCompetencia(competencia),
              valor_servico: parseFloat(value),
              descricao_servico: service_description,
              provider: "asaas",
              status: "processando",
              ambiente: settings.environment === "production" ? "producao" : "homologacao",
              codigo_tributacao: effectiveServiceCode || null,
              aliquota: iss_rate || null,
              // NFS-e Nacional 2026 - Retenções
              iss_retido: retain_iss || false,
              valor_iss_retido: retain_iss ? parseFloat(value) * ((iss_rate || 0) / 100) : 0,
              valor_pis: pis_value || 0,
              valor_cofins: cofins_value || 0,
              valor_csll: csll_value || 0,
              valor_irrf: irrf_value || 0,
              valor_inss: inss_value || 0,
              valor_liquido: valor_liquido || parseFloat(value),
            })
            .select("id")
            .single();

          if (historyError) {
            log(correlationId, "error", "Erro ao criar registro de histórico", { error: historyError.message });
            throw new AsaasApiError("Erro ao registrar NFS-e no histórico", 500, "HISTORY_CREATE_FAILED");
          }
          historyId = historyRecord.id;
          log(correlationId, "info", "Registro de histórico criado", { history_id: historyId });
          
          // Log event: created
          await logNfseEvent(supabase, historyId, "created", "info",
            `NFS-e iniciada para ${client.name}. Valor: R$ ${parseFloat(value).toFixed(2)}${retain_iss ? ` (ISS Retido)` : ""}`,
            correlationId, { client_id, value, contract_id, retain_iss, valor_liquido });
        }

        // 4. Build invoice payload - Asaas NFS-e API requires specific fields
        const invoicePayload: Record<string, unknown> = {
          customer: customerId,
          value: parseFloat(value),
          effectiveDate: effective_date || new Date().toISOString().split("T")[0],
          externalReference: historyId,
          // REQUIRED: Nome do tomador de serviço (cliente)
          name: client.name,
          // Required fields for Asaas NFS-e API
          serviceDescription: service_description || "Serviços de TI",
          municipalServiceDescription: service_description || "Serviços de TI",
        };

        // Preferência: usar municipalServiceId resolvido; fallback: usar código municipal direto
        if (resolvedMunicipalServiceId) {
          invoicePayload.municipalServiceId = resolvedMunicipalServiceId;
          if (resolvedMunicipalServiceName) {
            invoicePayload.municipalServiceName = resolvedMunicipalServiceName;
          }
          log(correlationId, "info", `Usando municipalServiceId resolvido: ${resolvedMunicipalServiceId}`, {
            municipalServiceName: resolvedMunicipalServiceName,
          });
        } else if (effectiveServiceCode) {
          invoicePayload.municipalServiceCode = effectiveServiceCode;
          log(correlationId, "warn", "municipalServiceId não resolvido; usando municipalServiceCode diretamente", {
            municipalServiceCode: effectiveServiceCode,
          });
        } else {
          const errorMsg = "Código de serviço municipal (LC 116) não fornecido. Configure o código de serviço no contrato ou nas configurações da empresa antes de emitir NFS-e.";
          log(correlationId, "error", errorMsg);
          
          // Log event: validation_error
          if (historyId) {
            await logNfseEvent(supabase, historyId, "validation_error", "error",
              errorMsg, correlationId, { reason: "MISSING_MUNICIPAL_SERVICE_CODE" });
            
            // Update history to error status
            await supabase
              .from("nfse_history")
              .update({
                status: "erro",
                mensagem_retorno: errorMsg,
                codigo_retorno: "MISSING_MUNICIPAL_SERVICE_CODE",
                updated_at: new Date().toISOString(),
              })
              .eq("id", historyId);
          }
          
          throw new AsaasApiError(errorMsg, 400, "MISSING_MUNICIPAL_SERVICE_CODE");
        }

        if (payment_id) {
          invoicePayload.payment = payment_id;
        }

        // Simples Nacional / Incentivador Cultural (obrigatório para cálculo correto)
        invoicePayload.optanteSimplesNacional = emitenteOptanteSN ?? true;
        invoicePayload.culturalProjectContributor = emitenteIncentivadorCultural ?? false;

        // NFS-e Nacional 2026 - Tributos (OBRIGATÓRIO pela API Asaas)
        invoicePayload.observations = "";
        invoicePayload.deductions = 0;
        invoicePayload.taxes = {
          retainIss: retain_iss || false,
          iss: iss_rate || 0,
          pis: pis_value || 0,
          cofins: cofins_value || 0,
          csll: csll_value || 0,
          ir: irrf_value || 0,
          inss: inss_value || 0,
        };

        log(correlationId, "info", "Emitindo NFS-e no Asaas", { payload: JSON.stringify(invoicePayload).slice(0, 300) });
        
        // Log event: api_call
        await logNfseEvent(supabase, historyId, "api_call", "info",
          "Enviando requisição POST /invoices para API Asaas",
          correlationId, { endpoint: "/invoices", method: "POST" });

        // 5. Call Asaas API to create invoice (NFS-e) - with error handling to update history
        let invoice;
        try {
          invoice = await asaasRequest(settings, "/invoices", "POST", invoicePayload, correlationId);
        } catch (apiError) {
          // API failed - update history to "erro" status before propagating
          const errorMessage = apiError instanceof Error ? apiError.message : "Erro ao emitir NFS-e";
          const errorCode = apiError instanceof AsaasApiError ? apiError.code : "ASAAS_API_ERROR";
          
          log(correlationId, "error", "Falha na API Asaas - atualizando histórico para erro", { 
            history_id: historyId, 
            error: errorMessage,
            code: errorCode 
          });
          
          // Log event: api_error
          await logNfseEvent(supabase, historyId, "api_error", "error",
            `Erro na API Asaas: ${errorMessage}`,
            correlationId, { code: errorCode, error: errorMessage });
          
          await supabase
            .from("nfse_history")
            .update({
              status: "erro",
              mensagem_retorno: errorMessage,
              codigo_retorno: errorCode,
              updated_at: new Date().toISOString(),
            })
            .eq("id", historyId);
          
          throw apiError; // Re-throw to return error response to client
        }

        // 6. Update nfse_history with Asaas response
        await supabase
          .from("nfse_history")
          .update({
            asaas_invoice_id: invoice.id,
            asaas_status: invoice.status,
            numero_nfse: invoice.number || null,
            status: invoice.status === "AUTHORIZED" ? "autorizada" : "processando",
            updated_at: new Date().toISOString(),
          })
          .eq("id", historyId);

        // ============ SYNC nfse_status TO invoices TABLE ============
        const targetInvoiceId = invoice_id || null;
        if (targetInvoiceId) {
          const nfseStatus = invoice.status === "AUTHORIZED" ? "gerada" : "processando";
          const invoiceUpdate: Record<string, unknown> = {
            nfse_status: nfseStatus,
            nfse_error_msg: null,
            updated_at: new Date().toISOString(),
          };
          if (nfseStatus === "gerada") {
            invoiceUpdate.nfse_generated_at = new Date().toISOString();
          }
          await supabase.from("invoices").update(invoiceUpdate).eq("id", targetInvoiceId);
          log(correlationId, "info", "invoices.nfse_status sincronizado", { invoice_id: targetInvoiceId, nfse_status: nfseStatus });
        }

        log(correlationId, "info", "NFS-e emitida com sucesso", { invoice_id: invoice.id, status: invoice.status });
        
        // Log event: api_response
        await logNfseEvent(supabase, historyId, "api_response", "info",
          `NFS-e criada no Asaas com sucesso. ID: ${invoice.id}, Status: ${invoice.status}`,
          correlationId, { asaas_id: invoice.id, status: invoice.status, number: invoice.number });

        return new Response(
          JSON.stringify({
            success: true,
            invoice_id: invoice.id,
            status: invoice.status,
            number: invoice.number,
            history_id: historyId,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "emit_standalone": {
        const {
          client_id,
          value,
          service_description,
          service_code,
          cnae,
          aliquota,
          competencia,
          invoice_id,
          // NFS-e Nacional 2026 - Tributos Federais
          retain_iss,
          iss_rate,
          pis_value,
          cofins_value,
          csll_value,
          irrf_value,
          inss_value,
          valor_liquido,
        } = params;

        log(correlationId, "info", "Iniciando emissão de NFS-e avulsa", { client_id, value });

        // 1. Ensure customer exists in Asaas with COMPLETE data (email, address, postalCode)
        // This prevents "E-mail/Endereço/CEP incompleto" errors from Asaas
        const { customerId, client } = await ensureCustomerSync(supabase, settings, client_id, correlationId);

        // 2. Try to resolve municipal service ID
        let municipalServiceId: string | null = null;
        let municipalServiceName: string | null = null;

        // Buscar dados fiscais da empresa (cidade, optante SN, incentivador cultural, CNAE padrão)
        let emitenteCidade: string | null = null;
        let emitenteOptanteSN: boolean | null = null;
        let emitenteIncentivadorCultural: boolean | null = null;
        let emitenteCnaePadrao: string | null = null;
        try {
          const { data: companyData } = await supabase
            .from("company_settings")
            .select("endereco_cidade, nfse_optante_simples, nfse_incentivador_cultural, nfse_cnae_padrao")
            .limit(1)
            .maybeSingle();
          emitenteCidade = companyData?.endereco_cidade || null;
          emitenteOptanteSN = companyData?.nfse_optante_simples ?? null;
          emitenteIncentivadorCultural = companyData?.nfse_incentivador_cultural ?? null;
          emitenteCnaePadrao = companyData?.nfse_cnae_padrao || null;
        } catch (e) {
          log(correlationId, "warn", "Erro ao buscar dados fiscais da empresa", { error: String(e) });
        }

        if (service_code) {
          const normalizedTarget = normalizeServiceCode(service_code);
          
          const tryResolveStandalone = async (city?: string): Promise<{ id: string; description: string } | null> => {
            const endpoint = city
              ? `/invoices/municipalServices?description=&city=${encodeURIComponent(city)}`
              : "/invoices/municipalServices";
            const servicesResponse = await asaasRequest(settings, endpoint, "GET", undefined, correlationId);
            const services = servicesResponse.data || [];
            // CORREÇÃO CRÍTICA: A API Asaas NÃO retorna campo `code`.
            // O código do serviço está embutido no início do campo `description` (ex: "01.07.01 - Suporte técnico...")
            const matchedService = services.find(
              (s: { description: string; id: string }) => {
                const codeMatch = s.description?.match(/^(\d{2}\.\d{2}\.\d{2})/);
                if (!codeMatch) return false;
                return normalizeServiceCode(codeMatch[1]) === normalizedTarget;
              }
            );
            if (matchedService) {
              const extractedCode = matchedService.description?.match(/^(\d{2}\.\d{2}\.\d{2})/)?.[1] || "";
              log(correlationId, "info", `MunicipalServiceId encontrado (avulsa)${city ? ` (cidade: ${city})` : ""}: ${matchedService.id}`, {
                matched_code: extractedCode,
              });
              return { id: matchedService.id, description: matchedService.description };
            }
            log(correlationId, "warn", `Nenhum match (avulsa)${city ? ` para cidade ${city}` : ""}`, {
              codigo_enviado: service_code,
              codigo_normalizado: normalizedTarget,
              codigos_disponiveis: services.map((s: { description: string }) => {
                const m = s.description?.match(/^(\d{2}\.\d{2}\.\d{2})/);
                return m ? m[1] : s.description?.slice(0, 30);
              }).slice(0, 20),
            });
            return null;
          };
          
          try {
            let resolved: { id: string; description: string } | null = null;
            if (emitenteCidade) {
              resolved = await tryResolveStandalone(emitenteCidade);
            }
            if (!resolved) {
              resolved = await tryResolveStandalone();
            }
            if (resolved) {
              municipalServiceId = resolved.id;
              municipalServiceName = resolved.description;
            }
          } catch (e) {
            log(correlationId, "warn", "Erro ao buscar serviços municipais", { error: String(e) });
          }
        }

        // 3. Create nfse_history record (with NFS-e Nacional 2026 fields)
        const issRetidoValue = retain_iss || false;
        const aliquotaIss = iss_rate || aliquota || 0;
        const valorIssRetido = issRetidoValue ? parseFloat(value) * (aliquotaIss / 100) : 0;
        
        const { data: historyRecord, error: historyError } = await supabase
          .from("nfse_history")
          .insert({
            client_id,
            invoice_id: invoice_id || null,
            contract_id: null,
            competencia: normalizeCompetencia(competencia),
            valor_servico: parseFloat(value),
            descricao_servico: service_description,
            codigo_tributacao: service_code,
            cnae: cnae || emitenteCnaePadrao || null,
            aliquota: aliquotaIss || null,
            provider: "asaas",
            status: "processando",
            ambiente: settings.environment === "production" ? "producao" : "homologacao",
            municipal_service_id: municipalServiceId,
            // NFS-e Nacional 2026 - Retenções
            iss_retido: issRetidoValue,
            valor_iss_retido: valorIssRetido,
            valor_pis: pis_value || 0,
            valor_cofins: cofins_value || 0,
            valor_csll: csll_value || 0,
            valor_irrf: irrf_value || 0,
            valor_inss: inss_value || 0,
            valor_liquido: valor_liquido || parseFloat(value),
          })
          .select("id")
          .single();

        if (historyError) {
          log(correlationId, "error", "Erro ao criar histórico", { error: historyError.message });
          throw new AsaasApiError("Erro ao registrar NFS-e no histórico", 500, "HISTORY_CREATE_FAILED");
        }

        log(correlationId, "info", "Histórico criado", { history_id: historyRecord.id });
        
        // Log event: created
        await logNfseEvent(supabase, historyRecord.id, "created", "info",
          `NFS-e avulsa iniciada para ${client.name}. Valor: R$ ${parseFloat(value).toFixed(2)}`,
          correlationId, { client_id, value, type: "standalone" });

        // 4. Build and send invoice request - Asaas NFS-e API requires specific fields
        const invoicePayload: Record<string, unknown> = {
          customer: customerId,
          value: parseFloat(value),
          effectiveDate: new Date().toISOString().split("T")[0],
          externalReference: historyRecord.id,
          // Required fields for Asaas NFS-e API
          serviceDescription: service_description || "Serviços de TI",
          municipalServiceDescription: service_description || "Serviços de TI",
        };

        // Preferência: usar municipalServiceId resolvido; fallback: usar código municipal direto
        if (municipalServiceId) {
          invoicePayload.municipalServiceId = municipalServiceId;
          if (municipalServiceName) {
            invoicePayload.municipalServiceName = municipalServiceName;
          }
        } else if (service_code) {
          invoicePayload.municipalServiceCode = service_code;
          log(correlationId, "warn", "municipalServiceId não resolvido na avulsa; usando municipalServiceCode diretamente", {
            municipalServiceCode: service_code,
          });
        }

        // Simples Nacional / Incentivador Cultural (obrigatório para cálculo correto)
        invoicePayload.optanteSimplesNacional = emitenteOptanteSN ?? true;
        invoicePayload.culturalProjectContributor = emitenteIncentivadorCultural ?? false;

        // NFS-e Nacional 2026 - Tributos (OBRIGATÓRIO pela API Asaas)
        invoicePayload.observations = "";
        invoicePayload.deductions = 0;
        invoicePayload.taxes = {
          retainIss: issRetidoValue || false,
          iss: aliquotaIss || 0,
          pis: pis_value || 0,
          cofins: cofins_value || 0,
          csll: csll_value || 0,
          ir: irrf_value || 0,
          inss: inss_value || 0,
        };

        log(correlationId, "info", "Emitindo NFS-e avulsa no Asaas");
        
        // Log event: api_call
        await logNfseEvent(supabase, historyRecord.id, "api_call", "info",
          "Enviando requisição POST /invoices para API Asaas (avulsa)",
          correlationId, { endpoint: "/invoices", method: "POST" });

        // Call Asaas API - with error handling to update history
        let invoice;
        try {
          invoice = await asaasRequest(settings, "/invoices", "POST", invoicePayload, correlationId);
        } catch (apiError) {
          // API failed - update history to "erro" status before propagating
          const errorMessage = apiError instanceof Error ? apiError.message : "Erro ao emitir NFS-e";
          const errorCode = apiError instanceof AsaasApiError ? apiError.code : "ASAAS_API_ERROR";
          
          log(correlationId, "error", "Falha na API Asaas (avulsa) - atualizando histórico para erro", { 
            history_id: historyRecord.id, 
            error: errorMessage,
            code: errorCode 
          });
          
          // Log event: api_error
          await logNfseEvent(supabase, historyRecord.id, "api_error", "error",
            `Erro na API Asaas: ${errorMessage}`,
            correlationId, { code: errorCode, error: errorMessage });
          
          await supabase
            .from("nfse_history")
            .update({
              status: "erro",
              mensagem_retorno: errorMessage,
              codigo_retorno: errorCode,
              updated_at: new Date().toISOString(),
            })
            .eq("id", historyRecord.id);
          
          throw apiError; // Re-throw to return error response to client
        }

        // 5. Update history with response
        await supabase
          .from("nfse_history")
          .update({
            asaas_invoice_id: invoice.id,
            asaas_status: invoice.status,
            numero_nfse: invoice.number || null,
            status: invoice.status === "AUTHORIZED" ? "autorizada" : "processando",
            updated_at: new Date().toISOString(),
          })
          .eq("id", historyRecord.id);

        // ============ SYNC nfse_status TO invoices TABLE (standalone) ============
        const standaloneInvoiceId = invoice_id || null;
        if (standaloneInvoiceId) {
          const nfseStatus = invoice.status === "AUTHORIZED" ? "gerada" : "processando";
          const invoiceUpdate: Record<string, unknown> = {
            nfse_status: nfseStatus,
            nfse_error_msg: null,
            updated_at: new Date().toISOString(),
          };
          if (nfseStatus === "gerada") {
            invoiceUpdate.nfse_generated_at = new Date().toISOString();
          }
          await supabase.from("invoices").update(invoiceUpdate).eq("id", standaloneInvoiceId);
          log(correlationId, "info", "invoices.nfse_status sincronizado (avulsa)", { invoice_id: standaloneInvoiceId, nfse_status: nfseStatus });
        }

        log(correlationId, "info", "NFS-e avulsa emitida com sucesso", { invoice_id: invoice.id });
        
        // Log event: api_response
        await logNfseEvent(supabase, historyRecord.id, "api_response", "info",
          `NFS-e avulsa criada no Asaas com sucesso. ID: ${invoice.id}, Status: ${invoice.status}`,
          correlationId, { asaas_id: invoice.id, status: invoice.status, number: invoice.number });

        return new Response(
          JSON.stringify({
            success: true,
            invoice_id: invoice.id,
            status: invoice.status,
            number: invoice.number,
            history_id: historyRecord.id,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "emit_test": {
        const { payment_id, customer_id } = params;

        const testPayload: Record<string, unknown> = {
          serviceDescription: "Serviço de Teste - Homologação NFS-e Asaas",
          value: 5.00,
          effectiveDate: new Date().toISOString().split("T")[0],
          externalReference: `teste-nfse-${Date.now()}`,
          observations: "Teste de homologação",
          deductions: 0,
          taxes: {
            retainIss: false,
            iss: 0,
            pis: 0,
            cofins: 0,
            csll: 0,
            ir: 0,
            inss: 0,
          },
        };

        if (payment_id) {
          testPayload.payment = payment_id;
        } else if (customer_id) {
          testPayload.customer = customer_id;
        } else {
          throw new AsaasApiError("É necessário informar payment_id ou customer_id", 400, "MISSING_PARAMS");
        }

        log(correlationId, "info", "Emitindo NFS-e de teste");

        const invoice = await asaasRequest(settings, "/invoices", "POST", testPayload, correlationId);

        return new Response(
          JSON.stringify({
            success: true,
            invoice_id: invoice.id,
            status: invoice.status,
            number: invoice.number,
            scheduled_date: invoice.scheduledDate,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_status": {
        const { invoice_id } = params;
        log(correlationId, "info", "Consultando status de NFS-e", { invoice_id });
        const invoice = await asaasRequest(settings, `/invoices/${invoice_id}`, "GET", undefined, correlationId);
        return new Response(
          JSON.stringify({ success: true, invoice, correlation_id: correlationId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "check_single_status": {
        const { nfse_history_id } = params;
        
        log(correlationId, "info", "Verificando status individual de NFS-e", { nfse_history_id });
        
        if (!nfse_history_id) {
          throw new AsaasApiError("ID do registro NFS-e é obrigatório", 400, "MISSING_HISTORY_ID");
        }
        
        // 1. Buscar registro local
        const { data: record, error: findError } = await supabase
          .from("nfse_history")
          .select("id, asaas_invoice_id, status, client_id, ambiente")
          .eq("id", nfse_history_id)
          .single();
        
        if (findError || !record) {
          throw new AsaasApiError(ERROR_CODES.RECORD_NOT_FOUND, 404, "RECORD_NOT_FOUND");
        }
        
        if (!record.asaas_invoice_id) {
          throw new AsaasApiError("NFS-e não possui ID no Asaas", 400, "NO_ASAAS_ID");
        }
        
        // Log event: manual check initiated
        await logNfseEvent(supabase, nfse_history_id, "status_check", "info",
          "Verificação manual de status iniciada",
          correlationId, { asaas_invoice_id: record.asaas_invoice_id });
        
        // 2. Consultar Asaas
        const invoice = await asaasRequest(settings, `/invoices/${record.asaas_invoice_id}`, "GET", undefined, correlationId);
        
        log(correlationId, "info", "Status obtido do Asaas", { 
          asaas_id: invoice.id, 
          status: invoice.status,
          number: invoice.number 
        });
        
        // 3. Mapear status Asaas para status interno
        const STATUS_MAP: Record<string, string> = {
          SCHEDULED: "processando",
          SYNCHRONIZED: "processando",
          AUTHORIZATION_PENDING: "processando",
          AUTHORIZED: "autorizada",
          CANCELED: "cancelada",
          CANCELLATION_PENDING: "processando",
          CANCELLATION_DENIED: "autorizada",
          ERROR: "erro",
        };
        
        const newStatus = STATUS_MAP[invoice.status] || "processando";
        const updateData: Record<string, unknown> = {
          asaas_status: invoice.status,
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        
        // 4. Se autorizada, atualizar campos adicionais e baixar arquivos
        if (invoice.status === "AUTHORIZED") {
          updateData.numero_nfse = invoice.number?.toString() || null;
          updateData.codigo_verificacao = invoice.validationCode || null;
          updateData.data_autorizacao = new Date().toISOString();
          
          // Tentar baixar PDF
          if (invoice.pdfUrl) {
            try {
              const pdfResponse = await fetch(invoice.pdfUrl);
              if (pdfResponse.ok) {
                const pdfBlob = await pdfResponse.arrayBuffer();
                const pdfPath = `${record.client_id}/${nfse_history_id}/nfse.pdf`;
                await supabase.storage.from("nfse-files").upload(pdfPath, pdfBlob, {
                  contentType: "application/pdf",
                  upsert: true,
                });
                updateData.pdf_url = `nfse-files/${pdfPath}`;
                log(correlationId, "info", "PDF baixado e salvo", { path: pdfPath });
              }
            } catch (pdfError) {
              log(correlationId, "warn", "Erro ao baixar PDF", { error: String(pdfError) });
            }
          }
          
          // Tentar baixar XML
          if (invoice.xmlUrl) {
            try {
              const xmlResponse = await fetch(invoice.xmlUrl);
              if (xmlResponse.ok) {
                const xmlBlob = await xmlResponse.arrayBuffer();
                const xmlPath = `${record.client_id}/${nfse_history_id}/nfse.xml`;
                await supabase.storage.from("nfse-files").upload(xmlPath, xmlBlob, {
                  contentType: "application/xml",
                  upsert: true,
                });
                updateData.xml_url = `nfse-files/${xmlPath}`;
                log(correlationId, "info", "XML baixado e salvo", { path: xmlPath });
              }
            } catch (xmlError) {
              log(correlationId, "warn", "Erro ao baixar XML", { error: String(xmlError) });
            }
          }
        }
        
        // Se erro, capturar mensagem - Asaas usa statusDescription (não errors[])
        if (invoice.status === "ERROR") {
          // statusDescription contém o retorno detalhado da prefeitura
          const errorDescription = invoice.statusDescription || 
            invoice.errors?.map((e: { description: string }) => e.description).join("; ") || 
            "Erro no processamento";
          updateData.mensagem_retorno = errorDescription;
          updateData.codigo_retorno = invoice.errors?.[0]?.code || "ERROR";
          
          // Log the detailed error from prefeitura
          log(correlationId, "warn", "Erro retornado pela prefeitura", { 
            statusDescription: invoice.statusDescription,
            errors: invoice.errors
          });
        }
        
        // 5. Atualizar registro local
        const { error: updateError } = await supabase
          .from("nfse_history")
          .update(updateData)
          .eq("id", nfse_history_id);
        
        if (updateError) {
          log(correlationId, "error", "Erro ao atualizar registro local", { error: updateError.message });
        }
        
        // Log event: status updated
        await logNfseEvent(supabase, nfse_history_id, "status_updated", "info",
          `Status atualizado: ${invoice.status}${invoice.number ? ` (Número: ${invoice.number})` : ""}`,
          correlationId, { 
            old_status: record.status,
            new_status: newStatus,
            asaas_status: invoice.status,
            number: invoice.number
          });
        
        log(correlationId, "info", "Verificação individual concluída", { 
          new_status: newStatus, 
          asaas_status: invoice.status 
        });
        
        return new Response(
          JSON.stringify({
            success: true,
            invoice,
            new_status: newStatus,
            previous_status: record.status,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cancel": {
        const { invoice_id, nfse_history_id, justification } = params;
        
        log(correlationId, "info", "Iniciando cancelamento de NFS-e", { invoice_id, nfse_history_id });

        if (!invoice_id) {
          throw new AsaasApiError("ID da NFS-e no Asaas é obrigatório", 400, "MISSING_INVOICE_ID");
        }

        // Validate justification (required, 15-500 chars)
        if (!justification || typeof justification !== "string") {
          throw new AsaasApiError("Justificativa é obrigatória para cancelamento", 400, "MISSING_JUSTIFICATION");
        }
        const trimmedJustification = justification.trim();
        if (trimmedJustification.length < 15 || trimmedJustification.length > 500) {
          throw new AsaasApiError("Justificativa deve ter entre 15 e 500 caracteres", 400, "INVALID_JUSTIFICATION");
        }

        // Idempotency check: block if already cancelled
        if (nfse_history_id) {
          const { data: existingCancellation } = await supabase
            .from("nfse_cancellation_log")
            .select("id")
            .eq("nfse_history_id", nfse_history_id)
            .eq("status", "CANCELLED")
            .maybeSingle();

          if (existingCancellation) {
            throw new AsaasApiError("Esta NFS-e já foi cancelada anteriormente", 409, "ALREADY_CANCELLED");
          }
        }

        // Resolve invoice_id from nfse_history if needed
        let resolvedInvoiceRefId: string | null = null;
        if (nfse_history_id) {
          const { data: histRecord } = await supabase
            .from("nfse_history")
            .select("invoice_id")
            .eq("id", nfse_history_id)
            .maybeSingle();
          resolvedInvoiceRefId = histRecord?.invoice_id || null;
        }

        // Create audit log with REQUESTED status BEFORE calling Asaas
        const { data: cancellationLog, error: logInsertError } = await supabase
          .from("nfse_cancellation_log")
          .insert({
            user_id: null, // service role context
            nfse_history_id: nfse_history_id || null,
            invoice_id: resolvedInvoiceRefId,
            asaas_invoice_id: invoice_id,
            justification: trimmedJustification,
            status: "REQUESTED",
            request_id: correlationId,
          })
          .select("id")
          .single();

        if (logInsertError) {
          log(correlationId, "error", "Falha ao criar log de auditoria", { error: logInsertError.message });
          throw new AsaasApiError("Falha ao registrar solicitação de cancelamento", 500, "AUDIT_LOG_FAILED");
        }

        const cancellationLogId = cancellationLog.id;

        try {
          try {
            await asaasRequest(settings, `/invoices/${invoice_id}`, "DELETE", undefined, correlationId);
          } catch (delErr) {
            // Se Asaas devolve 404, a invoice já não existe lá — tratamos como cancelada
            if (delErr instanceof AsaasApiError && delErr.status === 404) {
              log(correlationId, "warn", "Invoice não existe mais no Asaas (404) — tratando como já cancelada", { invoice_id });
            } else {
              throw delErr;
            }
          }

          // Success: update audit log to CANCELLED
          await supabase
            .from("nfse_cancellation_log")
            .update({ status: "CANCELLED" })
            .eq("id", cancellationLogId);

          // Update local nfse_history record
          if (nfse_history_id) {
            await supabase
              .from("nfse_history")
              .update({
                status: "cancelada",
                motivo_cancelamento: trimmedJustification,
                data_cancelamento: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", nfse_history_id);

            await logNfseEvent(supabase, nfse_history_id, "cancelled", "info",
              `NFS-e cancelada. Justificativa: ${trimmedJustification.slice(0, 100)}`,
              correlationId, { asaas_invoice_id: invoice_id });
          }

          log(correlationId, "info", "NFS-e cancelada com sucesso", { invoice_id });

          return new Response(
            JSON.stringify({ success: true, correlation_id: correlationId }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );

        } catch (cancelError) {
          // Failure: update audit log to FAILED with error payload
          const errorMessage = cancelError instanceof Error ? cancelError.message : String(cancelError);
          const errorPayload = cancelError instanceof AsaasApiError
            ? { status: cancelError.status, code: cancelError.code, message: errorMessage, details: cancelError.details }
            : { message: errorMessage };

          await supabase
            .from("nfse_cancellation_log")
            .update({
              status: "FAILED",
              error_payload: errorPayload,
            })
            .eq("id", cancellationLogId);

          if (nfse_history_id) {
            await logNfseEvent(supabase, nfse_history_id, "cancel_failed", "error",
              `Falha ao cancelar NFS-e: ${errorMessage}`,
              correlationId, errorPayload);
          }

          throw cancelError;
        }
      }

      case "link_external": {
        // Link an externally emitted NFS-e to a local record with audit trail
        const { nfse_history_id, numero_nfse, data_autorizacao, codigo_verificacao, justificativa, rps_numero } = params;
        
        log(correlationId, "info", "Vinculando nota externa", { nfse_history_id, numero_nfse, justificativa: justificativa?.slice(0, 50) });
        
        if (!nfse_history_id) {
          throw new AsaasApiError("ID do registro é obrigatório", 400, "MISSING_HISTORY_ID");
        }
        
        if (!numero_nfse) {
          throw new AsaasApiError("Número da NFS-e é obrigatório", 400, "MISSING_NFSE_NUMBER");
        }
        
        // Fetch record to verify it exists
        const { data: record, error: findError } = await supabase
          .from("nfse_history")
          .select("id, status, client_id")
          .eq("id", nfse_history_id)
          .single();
        
        if (findError || !record) {
          throw new AsaasApiError(ERROR_CODES.RECORD_NOT_FOUND, 404, "RECORD_NOT_FOUND");
        }
        
        // Update record to authorized status with external number
        const { error: updateError } = await supabase
          .from("nfse_history")
          .update({
            status: "autorizada",
            numero_nfse: numero_nfse.toString(),
            data_autorizacao: data_autorizacao || new Date().toISOString(),
            codigo_verificacao: codigo_verificacao || null,
            mensagem_retorno: "Nota vinculada manualmente a emissão externa no Portal Nacional",
            codigo_retorno: "LINKED_EXTERNAL",
            updated_at: new Date().toISOString(),
          })
          .eq("id", nfse_history_id);
        
        if (updateError) {
          throw new AsaasApiError("Erro ao atualizar registro", 500, "UPDATE_FAILED", { db_error: updateError.message });
        }
        
        // Log vinculacao_manual event with justificativa for audit
        await logNfseEvent(supabase, nfse_history_id, "vinculacao_manual", "info",
          `Nota vinculada manualmente ao número ${numero_nfse} do Portal Nacional`,
          correlationId, {
            numero_nfse,
            data_autorizacao,
            justificativa: justificativa || "Não informada",
            rps_numero: rps_numero || null,
          });
        
        log(correlationId, "info", "Nota externa vinculada com sucesso", { numero_nfse });
        
        return new Response(
          JSON.stringify({
            success: true,
            linked: true,
            numero_nfse,
            history_id: nfse_history_id,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Compat: "delete_record" foi DEPRECADO por conformidade fiscal.
      // NFS-e não é mais apagada fisicamente — apenas arquivada (is_active=false),
      // preservando histórico, logs de cancelamento e auditoria.
      case "delete_record":
      case "archive_record": {
        const { nfse_history_id, reason } = params;

        log(correlationId, "info", "Arquivando registro de NFS-e", { nfse_history_id });

        if (!nfse_history_id) {
          throw new AsaasApiError("ID do registro é obrigatório", 400, "MISSING_HISTORY_ID");
        }

        const trimmedReason = (reason || "").toString().trim();
        if (trimmedReason.length < 5) {
          throw new AsaasApiError(
            "Motivo do arquivamento é obrigatório (mínimo 5 caracteres)",
            400,
            "MISSING_REASON"
          );
        }

        const { data: record, error: findError } = await supabase
          .from("nfse_history")
          .select("id, status, asaas_invoice_id, numero_nfse, is_active")
          .eq("id", nfse_history_id)
          .single();

        if (findError || !record) {
          throw new AsaasApiError(ERROR_CODES.RECORD_NOT_FOUND, 404, "RECORD_NOT_FOUND");
        }

        if (record.is_active === false) {
          return new Response(
            JSON.stringify({ success: true, already_archived: true, archived_id: nfse_history_id, correlation_id: correlationId }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: archiveError } = await supabase
          .from("nfse_history")
          .update({
            is_active: false,
            archived_at: new Date().toISOString(),
            archived_reason: trimmedReason,
            updated_at: new Date().toISOString(),
          })
          .eq("id", nfse_history_id);

        if (archiveError) {
          throw new AsaasApiError("Erro ao arquivar registro", 500, "ARCHIVE_FAILED", { db_error: archiveError.message });
        }

        await logNfseEvent(supabase, nfse_history_id, "archived", "info",
          `Registro arquivado. Motivo: ${trimmedReason.slice(0, 200)}`,
          correlationId, { numero_nfse: record.numero_nfse, status_at_archive: record.status });

        log(correlationId, "info", "Registro arquivado com sucesso", { nfse_history_id });

        return new Response(
          JSON.stringify({ success: true, archived_id: nfse_history_id, correlation_id: correlationId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "restore_record": {
        const { nfse_history_id } = params;

        if (!nfse_history_id) {
          throw new AsaasApiError("ID do registro é obrigatório", 400, "MISSING_HISTORY_ID");
        }

        const { data: record, error: findError } = await supabase
          .from("nfse_history")
          .select("id, is_active, numero_nfse")
          .eq("id", nfse_history_id)
          .single();

        if (findError || !record) {
          throw new AsaasApiError(ERROR_CODES.RECORD_NOT_FOUND, 404, "RECORD_NOT_FOUND");
        }

        const { error: restoreError } = await supabase
          .from("nfse_history")
          .update({
            is_active: true,
            archived_at: null,
            archived_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", nfse_history_id);

        if (restoreError) {
          throw new AsaasApiError("Erro ao restaurar registro", 500, "RESTORE_FAILED", { db_error: restoreError.message });
        }

        await logNfseEvent(supabase, nfse_history_id, "restored", "info",
          "Registro restaurado (desarquivado)", correlationId,
          { numero_nfse: record.numero_nfse });

        return new Response(
          JSON.stringify({ success: true, restored_id: nfse_history_id, correlation_id: correlationId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_test_customer": {
        const cpf = generateValidCpf();
        const email = `teste+${Date.now()}@colmeia.tec.br`;
        const testCustomerData = {
          name: "Cliente Teste - Colmeia GSTI",
          email,
          cpfCnpj: cpf,
          externalReference: "teste-integracao-" + Date.now(),
          notificationDisabled: true,
        };

        log(correlationId, "info", "Criando cliente de teste");
        const customer = await asaasRequest(settings, "/customers", "POST", testCustomerData, correlationId);

        log(correlationId, "info", "Cliente de teste criado", { customer_id: customer.id });

        return new Response(
          JSON.stringify({
            success: true,
            customer_id: customer.id,
            customer_name: customer.name,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_test_payment": {
        const { cpf, value, billing_type } = params;
        
        const cleanCpf = (cpf || "01179973070").replace(/\D/g, "");
        const paymentValue = parseFloat(value) || 5;
        const paymentType = billing_type || "BOLETO";
        
        const customerData = {
          name: "Cliente Teste Cobrança",
          email: `teste.cobranca+${Date.now()}@colmeia.tec.br`,
          cpfCnpj: cleanCpf,
          externalReference: "teste-cobranca-" + Date.now(),
          notificationDisabled: true,
        };

        log(correlationId, "info", "Criando cliente para cobrança de teste");
        const customer = await asaasRequest(settings, "/customers", "POST", customerData, correlationId);

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
        const dueDateStr = dueDate.toISOString().split("T")[0];

        const paymentData = {
          customer: customer.id,
          billingType: paymentType,
          value: paymentValue,
          dueDate: dueDateStr,
          description: "Cobrança de Teste - Homologação Asaas",
          externalReference: "teste-pagamento-" + Date.now(),
        };

        log(correlationId, "info", "Criando cobrança de teste");
        const payment = await asaasRequest(settings, "/payments", "POST", paymentData, correlationId);

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: payment.id,
            customer_id: customer.id,
            billing_type: payment.billingType,
            value: payment.value,
            due_date: payment.dueDate,
            status: payment.status,
            boleto_url: payment.bankSlipUrl,
            invoice_url: payment.invoiceUrl,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "confirm_test_payment": {
        const { payment_id } = params;
        
        if (!payment_id) {
          throw new AsaasApiError("ID do pagamento é obrigatório", 400, "MISSING_PAYMENT_ID");
        }

        log(correlationId, "info", "Confirmando pagamento de teste", { payment_id });
        const paymentDetails = await asaasRequest(settings, `/payments/${payment_id}`, "GET", undefined, correlationId);

        const today = new Date().toISOString().split("T")[0];
        const confirmData = {
          paymentDate: today,
          value: paymentDetails.value,
          notifyCustomer: false,
        };

        const result = await asaasRequest(
          settings, 
          `/payments/${payment_id}/receiveInCash`, 
          "POST", 
          confirmData,
          correlationId
        );

        log(correlationId, "info", "Pagamento confirmado", { payment_id: result.id, status: result.status });

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: result.id,
            status: result.status,
            value: result.value,
            payment_date: result.paymentDate,
            confirmed_date: result.confirmedDate,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_payment": {
        const { invoice_id, billing_type } = params;

        log(correlationId, "info", "Criando cobrança via Asaas", { invoice_id, billing_type });

        // 1. Buscar dados da fatura
        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .select(`
            id,
            invoice_number,
            client_id,
            amount,
            due_date,
            description,
            asaas_payment_id,
            asaas_payment_deleted_at,
            asaas_invoice_url,
            boleto_url,
            boleto_barcode,
            pix_code,
            clients (
              id,
              name,
              document,
              email,
              financial_email,
              asaas_customer_id
            )
          `)
          .eq("id", invoice_id)
          .single();

        if (invoiceError || !invoice) {
          throw new AsaasApiError("Fatura não encontrada", 404, "INVOICE_NOT_FOUND");
        }

        const requestedType = (billing_type || "BOLETO").toUpperCase();

        // 1.5 IDEMPOTÊNCIA com VALIDAÇÃO DE DRIFT.
        // Antes de reutilizar a cobrança existente, verificamos:
        //  (a) Se o webhook marcou o payment como deletado → recria
        //  (b) Se o payment ainda existe no Asaas e não está deletado → recria
        //  (c) Se o CNPJ do customer no Asaas diverge do CNPJ local → recria
        // Esses 3 casos cobrem o bug do "boleto com CNPJ antigo" porque o PDF
        // do boleto é CONGELADO no momento da emissão pelo Asaas.
        if (invoice.asaas_payment_id) {
          let needsRegenerate = false;
          let regenerateReason = "";

          // (a) Webhook PAYMENT_DELETED já marcou
          if (invoice.asaas_payment_deleted_at) {
            needsRegenerate = true;
            regenerateReason = "payment_deleted_by_webhook";
          }

          // (b) Checa status no Asaas
          if (!needsRegenerate) {
            try {
              const existingPayment = await asaasRequest(
                settings,
                `/payments/${invoice.asaas_payment_id}`,
                "GET",
                undefined,
                correlationId,
              );
              if (!existingPayment || existingPayment.deleted === true || existingPayment.status === "DELETED") {
                needsRegenerate = true;
                regenerateReason = "payment_deleted_on_asaas";
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              if (msg.includes("not found") || msg.includes("404") || msg.toLowerCase().includes("deletad")) {
                needsRegenerate = true;
                regenerateReason = "payment_not_found_on_asaas";
              } else {
                log(correlationId, "warn", "Falha ao validar payment existente no Asaas", { error: msg });
              }
            }
          }

          // (c) Checa drift de CNPJ entre Asaas e banco local
          if (!needsRegenerate && (invoice.clients as any)?.asaas_customer_id && (invoice.clients as any)?.document) {
            try {
              const asaasCustomer = await asaasRequest(
                settings,
                `/customers/${(invoice.clients as any).asaas_customer_id}`,
                "GET",
                undefined,
                correlationId,
              );
              const localCnpj = (invoice.clients as any).document.replace(/\D/g, "");
              const asaasCnpj = (asaasCustomer?.cpfCnpj || "").replace(/\D/g, "");
              if (asaasCnpj && localCnpj && asaasCnpj !== localCnpj) {
                needsRegenerate = true;
                regenerateReason = `cnpj_drift (local=${localCnpj}, asaas=${asaasCnpj})`;
                log(correlationId, "warn", "Drift de CNPJ detectado — boleto antigo será regenerado", {
                  invoice_id, local: localCnpj, asaas: asaasCnpj,
                });
              }
            } catch (e) {
              log(correlationId, "warn", "Falha ao validar customer no Asaas", {
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }

          if (needsRegenerate) {
            log(correlationId, "info", "Regenerando boleto: condição detectada", {
              reason: regenerateReason, old_payment_id: invoice.asaas_payment_id,
            });
            // CANCELA payment antigo no Asaas ANTES de limpar local — evita
            // que o cliente fique com 2 cobranças ativas (duplicação).
            // Se já estiver deletado (404), apenas loga e segue.
            if (regenerateReason !== "payment_deleted_by_webhook"
                && regenerateReason !== "payment_deleted_on_asaas"
                && regenerateReason !== "payment_not_found_on_asaas") {
              try {
                await asaasRequest(
                  settings,
                  `/payments/${invoice.asaas_payment_id}`,
                  "DELETE",
                  undefined,
                  correlationId,
                );
                log(correlationId, "info", "Payment antigo cancelado no Asaas", {
                  old_payment_id: invoice.asaas_payment_id,
                });
              } catch (e) {
                log(correlationId, "warn", "Falha ao cancelar payment antigo no Asaas (seguindo)", {
                  error: e instanceof Error ? e.message : String(e),
                  old_payment_id: invoice.asaas_payment_id,
                });
              }
            }
            // Limpa campos e cai no fluxo de criação nova abaixo
            await supabase.from("invoices").update({
              asaas_payment_id: null,
              asaas_invoice_url: null,
              boleto_url: null,
              boleto_barcode: null,
              pix_code: null,
              asaas_payment_deleted_at: null,
              auto_payment_generated: false,
              updated_at: new Date().toISOString(),
            }).eq("id", invoice_id);
            // Remove PDF antigo do Storage (se existir)
            try {
              await supabase.storage.from("invoice-documents")
                .remove([`boletos/${invoice_id}/boleto.pdf`]);
            } catch (_) { /* ignora */ }
            await supabase.from("invoice_documents")
              .delete().eq("invoice_id", invoice_id).eq("document_type", "boleto_pdf");
            await supabase.from("audit_logs").insert({
              action: "asaas_payment_auto_cancelled",
              table_name: "invoices",
              record_id: invoice_id,
              new_data: {
                reason: regenerateReason,
                old_asaas_payment_id: invoice.asaas_payment_id,
                correlation_id: correlationId,
              },
            });

            // segue para criação nova
            invoice.asaas_payment_id = null;
          } else {
            // Reuso seguro
            log(correlationId, "info", "Fatura já possui cobrança válida no Asaas, reutilizando", {
              asaas_payment_id: invoice.asaas_payment_id, requested: requestedType,
            });

            const updateData: Record<string, unknown> = {};

            if (requestedType === "PIX" && !invoice.pix_code) {
              try {
                const pixInfo = await asaasRequest(
                  settings,
                  `/payments/${invoice.asaas_payment_id}/pixQrCode`,
                  "GET",
                  undefined,
                  correlationId,
                );
                if (pixInfo?.payload) {
                  updateData.pix_code = pixInfo.payload;
                  updateData.payment_method = "pix";
                }
              } catch (e) {
                log(correlationId, "warn", "Falha ao buscar PIX da cobrança existente", { error: String(e) });
              }
            }

            if (Object.keys(updateData).length > 0) {
              await supabase.from("invoices").update(updateData).eq("id", invoice_id);
            }

            return new Response(
              JSON.stringify({
                success: true,
                payment_id: invoice.asaas_payment_id,
                reused: true,
                pix_code: updateData.pix_code ?? invoice.pix_code ?? null,
                boleto_url: invoice.boleto_url,
                invoice_url: invoice.asaas_invoice_url,
                correlation_id: correlationId,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }


        // 2. SINCRONIZAR cliente no Asaas (PUT) ANTES de criar cobrança.
        // Garante que mudanças locais de CNPJ/email cheguem ao Asaas antes do boleto.
        // Bug histórico (caso Calherão 06/2026): cobrança era criada sem PUT e saía
        // com o CNPJ antigo que estava cadastrado no Asaas.
        const { customerId } = await ensureCustomerForPayment(
          supabase,
          settings,
          invoice.client_id,
          correlationId,
        );



        // 3. Criar cobrança no Asaas
        const paymentType = requestedType;
        const paymentData = {
          customer: customerId,
          billingType: paymentType,
          value: invoice.amount,
          dueDate: invoice.due_date,
          description: invoice.description || `Fatura #${invoice.invoice_number}`,
          externalReference: invoice.id,
        };



        log(correlationId, "info", "Criando cobrança no Asaas", { billing_type: paymentType });
        const payment = await asaasRequest(settings, "/payments", "POST", paymentData, correlationId);

        // 4. Atualizar fatura com dados do pagamento
        const updateData: Record<string, unknown> = {
          asaas_payment_id: payment.id,
          asaas_invoice_url: payment.invoiceUrl,
          billing_provider: "asaas",
          auto_payment_generated: true,
        };

        if (paymentType === "BOLETO" || paymentType === "UNDEFINED") {
          // Campos obrigatórios para boleto (conforme contrato de dados padronizado)
          // boleto_status='gerado' (não 'enviado'): boleto foi criado no Asaas mas
          // o email com o boleto ainda não foi confirmado pelo Resend. O fluxo de
          // notificação (notify-due-invoices ou resend-payment-notification) é quem
          // marca como 'enviado' + seta boleto_sent_at após confirmação do envio.
          updateData.payment_method = "boleto";
          updateData.boleto_status = "gerado";

          // Buscar identificationField via endpoint separado (conforme docs.asaas.com)
          // POST /payments retorna bankSlipUrl mas NÃO retorna identificationField diretamente
          let identificationField = payment.identificationField || null;
          let barCode = null;
          if (!identificationField && payment.id) {
            try {
              const idFieldData = await asaasRequest(settings, `/payments/${payment.id}/identificationField`, "GET", undefined, correlationId);
              identificationField = idFieldData?.identificationField || null;
              barCode = idFieldData?.barCode || null;
              log(correlationId, "info", "identificationField obtido via endpoint separado", { 
                hasField: !!identificationField, hasBarCode: !!barCode 
              });
            } catch (idFieldError) {
              log(correlationId, "warn", "Erro ao buscar identificationField (boleto pode estar em processamento)", { 
                error: String(idFieldError) 
              });
            }
          }

          // Baixar PDF do boleto e salvar no Storage S3
          let storageBoletoUrl = payment.bankSlipUrl;
          if (payment.bankSlipUrl) {
            try {
              const pdfResponse = await fetch(payment.bankSlipUrl);
              if (pdfResponse.ok) {
                const pdfBlob = await pdfResponse.arrayBuffer();
                const boletoPath = `boletos/${invoice_id}/boleto.pdf`;
                await supabase.storage.from("invoice-documents").upload(boletoPath, pdfBlob, {
                  contentType: "application/pdf",
                  upsert: true,
                });
                storageBoletoUrl = `invoice-documents/${boletoPath}`;
                log(correlationId, "info", "PDF do boleto salvo no Storage", { path: boletoPath });
                
                // Registrar na tabela invoice_documents
                await supabase.from("invoice_documents").insert({
                  invoice_id: invoice_id,
                  document_type: "boleto_pdf",
                  file_path: boletoPath,
                  file_name: `boleto_${invoice.invoice_number}.pdf`,
                  mime_type: "application/pdf",
                  bucket_name: "invoice-documents",
                  storage_provider: "supabase",
                  metadata: { source: "asaas", asaas_payment_id: payment.id },
                });
              }
            } catch (storageError) {
              log(correlationId, "warn", "Erro ao salvar PDF do boleto no Storage, usando URL externa", { error: String(storageError) });
            }
          }
          updateData.boleto_url = storageBoletoUrl;
          updateData.boleto_barcode = identificationField;
        }
        if (paymentType === "PIX") {
          // Campos obrigatórios para PIX (conforme contrato de dados padronizado)
          updateData.payment_method = "pix";

          // Buscar código PIX
          try {
            const pixInfo = await asaasRequest(settings, `/payments/${payment.id}/pixQrCode`, "GET", undefined, correlationId);
            if (pixInfo?.payload) {
              updateData.pix_code = pixInfo.payload;
            }
          } catch (pixError) {
            log(correlationId, "warn", "Erro ao buscar QR Code PIX", { error: String(pixError) });
          }
        }

        await supabase
          .from("invoices")
          .update(updateData)
          .eq("id", invoice_id);

        log(correlationId, "info", "Cobrança criada com sucesso", { payment_id: payment.id, billing_type: paymentType });

        return new Response(
          JSON.stringify({
            success: true,
            payment_id: payment.id,
            billing_type: paymentType,
            status: payment.status,
            boleto_url: payment.bankSlipUrl,
            invoice_url: payment.invoiceUrl,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "retry_failed": {
        // Cancels/deletes a failed invoice in Asaas (e.g. E0014 false positive),
        // clears asaas_invoice_id, resets status to "pendente" so user can re-emit.
        const { nfse_history_id: retryHistoryId } = params;
        if (!retryHistoryId) {
          throw new AsaasApiError("nfse_history_id é obrigatório", 400, "MISSING_PARAM");
        }

        const { data: nfseRecord, error: fetchErr } = await supabase
          .from("nfse_history")
          .select("id, asaas_invoice_id, status, client_id, invoice_id")
          .eq("id", retryHistoryId)
          .single();

        if (fetchErr || !nfseRecord) {
          throw new AsaasApiError(ERROR_CODES.RECORD_NOT_FOUND, 404, "RECORD_NOT_FOUND");
        }

        // Try to delete the failed invoice in Asaas if it exists
        if (nfseRecord.asaas_invoice_id) {
          try {
            await asaasRequest(settings, `/invoices/${nfseRecord.asaas_invoice_id}`, "DELETE", undefined, correlationId);
            log(correlationId, "info", "Invoice com erro deletada no Asaas", { asaas_invoice_id: nfseRecord.asaas_invoice_id });
          } catch (deleteErr) {
            // Log but don't block — the invoice may already be gone or in a non-deletable state
            log(correlationId, "warn", "Falha ao deletar invoice no Asaas (prosseguindo com limpeza local)", {
              error: deleteErr instanceof Error ? deleteErr.message : String(deleteErr),
              asaas_invoice_id: nfseRecord.asaas_invoice_id,
            });
          }
        }

        // Clear asaas_invoice_id and reset status
        await supabase
          .from("nfse_history")
          .update({
            asaas_invoice_id: null,
            asaas_status: null,
            status: "pendente",
            mensagem_retorno: null,
            codigo_retorno: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", retryHistoryId);

        // Clear nfse error on linked invoice
        if (nfseRecord.invoice_id) {
          await supabase
            .from("invoices")
            .update({ nfse_status: null, nfse_error_msg: null, updated_at: new Date().toISOString() })
            .eq("id", nfseRecord.invoice_id);
        }

        await logNfseEvent(supabase, retryHistoryId, "retry_failed", "info",
          "Invoice com erro cancelada/limpa para permitir reemissão",
          correlationId, { old_asaas_id: nfseRecord.asaas_invoice_id });

        log(correlationId, "info", "retry_failed concluído com sucesso", { nfse_history_id: retryHistoryId });

        return new Response(
          JSON.stringify({
            success: true,
            message: "Registro limpo. Pronto para reemissão.",
            nfse_history_id: retryHistoryId,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cancel_payment": {
        // Cancela (deleta) o boleto/PIX no Asaas e limpa os campos locais.
        // Usado pelo botão "Cancelar Boleto" quando billing_provider = 'asaas'.
        const { invoice_id, motivo } = params;
        if (!invoice_id) {
          throw new AsaasApiError("invoice_id é obrigatório", 400, "MISSING_PARAM");
        }

        const { data: inv, error: invErr } = await supabase
          .from("invoices")
          .select("id, invoice_number, asaas_payment_id, billing_provider, status")
          .eq("id", invoice_id)
          .single();

        if (invErr || !inv) {
          throw new AsaasApiError("Fatura não encontrada", 404, "INVOICE_NOT_FOUND");
        }
        if (!inv.asaas_payment_id) {
          throw new AsaasApiError("Fatura não possui cobrança no Asaas", 400, "NO_ASAAS_PAYMENT");
        }
        if (inv.status === "paid") {
          throw new AsaasApiError("Fatura já paga não pode ser cancelada", 400, "ALREADY_PAID");
        }

        log(correlationId, "info", "Cancelando cobrança no Asaas", {
          invoice_id,
          asaas_payment_id: inv.asaas_payment_id,
          motivo,
        });

        try {
          await asaasRequest(
            settings,
            `/payments/${inv.asaas_payment_id}`,
            "DELETE",
            undefined,
            correlationId,
          );
        } catch (delErr) {
          const msg = delErr instanceof Error ? delErr.message : String(delErr);
          log(correlationId, "warn", "Falha ao deletar payment no Asaas", { error: msg });
          // Erros típicos: "invalid_action" (já recebido/processando) → propagar
          throw new AsaasApiError(
            `Não foi possível cancelar a cobrança no Asaas: ${msg}`,
            400,
            "ASAAS_CANCEL_FAILED",
          );
        }

        // Limpar campos locais da cobrança (mantém a fatura)
        await supabase
          .from("invoices")
          .update({
            asaas_payment_id: null,
            asaas_invoice_url: null,
            boleto_url: null,
            boleto_barcode: null,
            boleto_status: "cancelado",
            pix_code: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice_id);

        await supabase.from("audit_logs").insert({
          action: "asaas_payment_cancelled",
          table_name: "invoices",
          record_id: invoice_id,
          new_data: {
            asaas_payment_id: inv.asaas_payment_id,
            motivo: motivo || "Não informado",
            correlation_id: correlationId,
          },
        });

        log(correlationId, "info", "Cobrança cancelada com sucesso", { invoice_id });

        return new Response(
          JSON.stringify({
            success: true,
            message: `Cobrança da fatura #${inv.invoice_number} cancelada no Asaas`,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "sync_customer": {
        // Força sincronização (PUT) do cliente no Asaas. Útil após editar CNPJ/email
        // localmente — propaga a mudança ANTES da próxima emissão.
        const { client_id } = params;
        if (!client_id) {
          throw new AsaasApiError("client_id é obrigatório", 400, "MISSING_PARAM");
        }
        const { customerId } = await ensureCustomerForPayment(supabase, settings, client_id, correlationId);
        return new Response(
          JSON.stringify({
            success: true,
            customer_id: customerId,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "regenerate_payment": {
        // Força regeneração do boleto/PIX: cancela o payment antigo no Asaas,
        // limpa todos os campos locais (asaas_payment_id, boleto_url, etc.),
        // remove o PDF do Storage e chama o create_payment internamente.
        // Usado quando o CNPJ/dados cadastrais mudaram e o boleto antigo
        // permanece com dados desatualizados (PDF é congelado pelo Asaas).
        const { invoice_id: regInvId, billing_type: regBT, reason: regReason } = params;
        if (!regInvId) {
          throw new AsaasApiError("invoice_id é obrigatório", 400, "MISSING_PARAM");
        }
        if (!regReason || String(regReason).trim().length < 5) {
          throw new AsaasApiError(
            "Motivo é obrigatório (mínimo 5 caracteres)",
            400, "MISSING_REASON",
          );
        }

        const { data: regInv, error: regInvErr } = await supabase
          .from("invoices")
          .select("id, invoice_number, asaas_payment_id, status, client_id")
          .eq("id", regInvId)
          .single();
        if (regInvErr || !regInv) {
          throw new AsaasApiError("Fatura não encontrada", 404, "INVOICE_NOT_FOUND");
        }
        if (regInv.status === "paid") {
          throw new AsaasApiError("Fatura já paga não pode regenerar boleto", 400, "ALREADY_PAID");
        }

        const oldPaymentId = regInv.asaas_payment_id;
        log(correlationId, "info", "Regenerando boleto", {
          invoice_id: regInvId, old_payment_id: oldPaymentId, reason: regReason,
        });

        // 1. Cancela payment antigo (se existir e não estiver já deletado)
        if (oldPaymentId) {
          try {
            await asaasRequest(settings, `/payments/${oldPaymentId}`, "DELETE", undefined, correlationId);
          } catch (e) {
            log(correlationId, "warn", "Falha ao cancelar payment antigo (pode já estar deletado)", {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // 2. Limpa campos locais
        await supabase.from("invoices").update({
          asaas_payment_id: null,
          asaas_invoice_url: null,
          boleto_url: null,
          boleto_barcode: null,
          boleto_status: "pendente",
          pix_code: null,
          asaas_payment_deleted_at: null,
          auto_payment_generated: false,
          updated_at: new Date().toISOString(),
        }).eq("id", regInvId);

        // 3. Remove PDF antigo
        try {
          await supabase.storage.from("invoice-documents")
            .remove([`boletos/${regInvId}/boleto.pdf`]);
        } catch (_) { /* ignora */ }
        await supabase.from("invoice_documents")
          .delete().eq("invoice_id", regInvId).eq("document_type", "boleto_pdf");

        // 4. Audit
        await supabase.from("audit_logs").insert({
          action: "boleto_regenerated",
          table_name: "invoices",
          record_id: regInvId,
          new_data: {
            reason: regReason,
            old_asaas_payment_id: oldPaymentId,
            requested_by: "user",
            correlation_id: correlationId,
          },
        });

        // 5. Retorna sucesso — UI deve chamar create_payment em seguida para gerar novo
        return new Response(
          JSON.stringify({
            success: true,
            message: `Boleto da fatura #${regInv.invoice_number} pronto para regeneração`,
            old_payment_id: oldPaymentId,
            cleared: true,
            correlation_id: correlationId,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:



        log(correlationId, "warn", `Ação desconhecida: ${action}`);
        return new Response(
          JSON.stringify({ success: false, error: `Ação desconhecida: ${action}`, code: "UNKNOWN_ACTION", correlation_id: correlationId }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    return buildErrorResponse(correlationId, error);
  }
});
