import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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
} as const;

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

  const data = await response.json();

  if (!response.ok) {
    const message = data.errors?.[0]?.description || data.message || "Erro na API Asaas";
    const code = data.errors?.[0]?.code || "ASAAS_API_ERROR";
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

        // 1. Ensure customer exists in Asaas with COMPLETE data (email, address, postalCode)
        // This prevents "E-mail/Endereço/CEP incompleto" errors from Asaas
        const { customerId, client } = await ensureCustomerSync(supabase, settings, client_id, correlationId);

        // 2. Resolve municipal service ID if only code provided
        let resolvedMunicipalServiceId = municipal_service_id;
        if (!resolvedMunicipalServiceId && municipal_service_code) {
          log(correlationId, "info", `Buscando municipalServiceId para código ${municipal_service_code}`);
          try {
            const servicesResponse = await asaasRequest(settings, "/invoices/municipalServices", "GET", undefined, correlationId);
            const services = servicesResponse.data || [];
            const matchedService = services.find(
              (s: { code: string; id: string }) => s.code === municipal_service_code
            );
            if (matchedService) {
              resolvedMunicipalServiceId = matchedService.id;
              log(correlationId, "info", `MunicipalServiceId encontrado: ${resolvedMunicipalServiceId}`);
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

        // Asaas requires municipalServiceId OR (municipalServiceCode + municipalServiceName) OR municipalServiceExternalId
        if (resolvedMunicipalServiceId) {
          invoicePayload.municipalServiceId = resolvedMunicipalServiceId;
        } else if (municipal_service_code) {
          // Use the LC 116 code as externalId (formato: "01.01" ou "0101")
          invoicePayload.municipalServiceExternalId = municipal_service_code;
          invoicePayload.municipalServiceName = service_description || "Serviços de TI";
        } else {
          // Fallback: usar código padrão de serviços de informática
          invoicePayload.municipalServiceExternalId = "0107";
          invoicePayload.municipalServiceName = service_description || "Suporte técnico em informática";
        }

        if (payment_id) {
          invoicePayload.payment = payment_id;
        }

        // NFS-e Nacional 2026 - Tributos
        if (typeof retain_iss === "boolean" || iss_rate || pis_value || cofins_value || csll_value || irrf_value || inss_value) {
          invoicePayload.taxes = {
            retainIss: retain_iss || false,
            iss: iss_rate || 0,
            pis: pis_value || 0,
            cofins: cofins_value || 0,
            csll: csll_value || 0,
            irrf: irrf_value || 0,
            inss: inss_value || 0,
          };
        }

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
        if (service_code) {
          try {
            const servicesResponse = await asaasRequest(settings, "/invoices/municipalServices", "GET", undefined, correlationId);
            const services = servicesResponse.data || [];
            const matchedService = services.find(
              (s: { code: string; id: string }) => s.code === service_code
            );
            if (matchedService) {
              municipalServiceId = matchedService.id;
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
            cnae: cnae || null,
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

        // Asaas requires either municipalServiceId OR municipalServiceCode + municipalServiceName
        if (municipalServiceId) {
          invoicePayload.municipalServiceId = municipalServiceId;
        } else if (service_code) {
          // When we don't have the Asaas internal ID, use external code approach
          invoicePayload.municipalServiceCode = service_code;
          invoicePayload.municipalServiceName = service_description || "Serviços de TI";
        }

        // NFS-e Nacional 2026 - Tributos
        if (aliquotaIss || issRetidoValue || pis_value || cofins_value || csll_value || irrf_value || inss_value) {
          invoicePayload.taxes = {
            retainIss: issRetidoValue,
            iss: aliquotaIss,
            pis: pis_value || 0,
            cofins: cofins_value || 0,
            csll: csll_value || 0,
            irrf: irrf_value || 0,
            inss: inss_value || 0,
          };
        }

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
        const { invoice_id, nfse_history_id } = params;
        
        log(correlationId, "info", "Iniciando cancelamento de NFS-e", { invoice_id, nfse_history_id });

        if (!invoice_id) {
          throw new AsaasApiError("ID da NFS-e no Asaas é obrigatório", 400, "MISSING_INVOICE_ID");
        }

        await asaasRequest(settings, `/invoices/${invoice_id}`, "DELETE", undefined, correlationId);

        // Update local record if history_id provided
        if (nfse_history_id) {
          await supabase
            .from("nfse_history")
            .update({
              status: "cancelada",
              data_cancelamento: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", nfse_history_id);
        }

        log(correlationId, "info", "NFS-e cancelada com sucesso", { invoice_id });

        return new Response(
          JSON.stringify({ success: true, correlation_id: correlationId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_record": {
        const { nfse_history_id, force } = params;

        log(correlationId, "info", "Iniciando exclusão de registro", { nfse_history_id, force });

        if (!nfse_history_id) {
          throw new AsaasApiError("ID do registro é obrigatório", 400, "MISSING_HISTORY_ID");
        }

        // Fetch record
        const { data: record, error: findError } = await supabase
          .from("nfse_history")
          .select("id, status, asaas_invoice_id, numero_nfse")
          .eq("id", nfse_history_id)
          .single();

        if (findError || !record) {
          throw new AsaasApiError(ERROR_CODES.RECORD_NOT_FOUND, 404, "RECORD_NOT_FOUND");
        }

        // Only allow deletion of pending/error records unless forced
        if (!force && record.status === "autorizada") {
          throw new AsaasApiError(
            "Não é possível excluir NFS-e autorizada. Cancele primeiro ou use force=true.",
            400,
            "DELETE_NOT_ALLOWED",
            { current_status: record.status }
          );
        }

        // If authorized and has Asaas ID, try to cancel first
        if (record.asaas_invoice_id && record.status === "autorizada") {
          log(correlationId, "info", "Cancelando NFS-e no Asaas antes de excluir", { asaas_id: record.asaas_invoice_id });
          try {
            await asaasRequest(settings, `/invoices/${record.asaas_invoice_id}`, "DELETE", undefined, correlationId);
          } catch (e) {
            log(correlationId, "warn", "Erro ao cancelar no Asaas (continuando exclusão local)", { error: String(e) });
          }
        }

        // Delete from database
        const { error: deleteError } = await supabase
          .from("nfse_history")
          .delete()
          .eq("id", nfse_history_id);

        if (deleteError) {
          throw new AsaasApiError("Erro ao excluir registro do banco", 500, "DELETE_FAILED", { db_error: deleteError.message });
        }

        log(correlationId, "info", "Registro excluído com sucesso", { nfse_history_id });

        return new Response(
          JSON.stringify({ success: true, deleted_id: nfse_history_id, correlation_id: correlationId }),
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

        // 2. Garantir que o cliente existe no Asaas
        let customerId = (invoice.clients as any)?.asaas_customer_id;
        if (!customerId) {
          log(correlationId, "info", "Criando cliente no Asaas para cobrança");
          
          const clientData = invoice.clients as any;
          const customerData = {
            name: clientData?.name || "Cliente",
            email: clientData?.financial_email || clientData?.email || null,
            cpfCnpj: clientData?.document?.replace(/\D/g, "") || null,
            externalReference: invoice.client_id,
            notificationDisabled: false,
          };

          const customer = await asaasRequest(settings, "/customers", "POST", customerData, correlationId);
          customerId = customer.id;

          // Atualizar cliente com asaas_customer_id
          await supabase
            .from("clients")
            .update({ asaas_customer_id: customerId })
            .eq("id", invoice.client_id);
        }

        // 3. Criar cobrança no Asaas
        const paymentType = billing_type || "BOLETO";
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
          updateData.boleto_url = payment.bankSlipUrl;
          updateData.boleto_barcode = payment.identificationField;
        }
        if (paymentType === "PIX") {
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
