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
        } = params;

        log(correlationId, "info", "Iniciando emissão de NFS-e", { client_id, value, contract_id });

        // 1. Ensure customer exists in Asaas
        let customerId: string;
        const { data: client } = await supabase
          .from("clients")
          .select("id, name, document, asaas_customer_id")
          .eq("id", client_id)
          .single();

        if (!client) {
          throw new AsaasApiError(ERROR_CODES.CLIENT_NOT_FOUND, 404, "CLIENT_NOT_FOUND");
        }

        if (client.asaas_customer_id) {
          customerId = client.asaas_customer_id;
          log(correlationId, "info", "Cliente já existe no Asaas", { customer_id: customerId });
        } else {
          log(correlationId, "info", "Criando cliente no Asaas...");
          const createResult = await asaasRequest(settings, "/customers", "POST", {
            name: client.name || "Cliente",
            cpfCnpj: client.document?.replace(/\D/g, ""),
            externalReference: client_id,
            notificationDisabled: true,
          }, correlationId);
          customerId = createResult.id;

          await supabase
            .from("clients")
            .update({ asaas_customer_id: customerId })
            .eq("id", client_id);
        }

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

        // 3. Create nfse_history record if not provided
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
            `NFS-e iniciada para ${client.name}. Valor: R$ ${parseFloat(value).toFixed(2)}`,
            correlationId, { client_id, value, contract_id });
        }

        // 4. Build invoice payload
        const invoicePayload: Record<string, unknown> = {
          customer: customerId,
          serviceDescription: service_description,
          value: parseFloat(value),
          effectiveDate: effective_date || new Date().toISOString().split("T")[0],
          externalReference: historyId,
        };

        if (resolvedMunicipalServiceId) {
          invoicePayload.municipalServiceId = resolvedMunicipalServiceId;
        }

        if (payment_id) {
          invoicePayload.payment = payment_id;
        }

        if (typeof retain_iss === "boolean" || iss_rate) {
          invoicePayload.taxes = {
            retainIss: retain_iss || false,
            iss: iss_rate || 0,
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
        } = params;

        log(correlationId, "info", "Iniciando emissão de NFS-e avulsa", { client_id, value });

        // 1. Validate client and ensure Asaas customer exists
        const { data: client } = await supabase
          .from("clients")
          .select("id, name, document, asaas_customer_id")
          .eq("id", client_id)
          .single();

        if (!client) {
          throw new AsaasApiError(ERROR_CODES.CLIENT_NOT_FOUND, 404, "CLIENT_NOT_FOUND");
        }

        let customerId = client.asaas_customer_id;
        if (!customerId) {
          log(correlationId, "info", "Criando cliente no Asaas para NFS-e avulsa");
          const createResult = await asaasRequest(settings, "/customers", "POST", {
            name: client.name || "Cliente",
            cpfCnpj: client.document?.replace(/\D/g, ""),
            externalReference: client_id,
            notificationDisabled: true,
          }, correlationId);
          customerId = createResult.id;

          await supabase
            .from("clients")
            .update({ asaas_customer_id: customerId })
            .eq("id", client_id);
        }

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

        // 3. Create nfse_history record
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
            aliquota: aliquota || null,
            provider: "asaas",
            status: "processando",
            ambiente: settings.environment === "production" ? "producao" : "homologacao",
            municipal_service_id: municipalServiceId,
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

        // 4. Build and send invoice request
        const invoicePayload: Record<string, unknown> = {
          customer: customerId,
          serviceDescription: service_description,
          value: parseFloat(value),
          effectiveDate: new Date().toISOString().split("T")[0],
          externalReference: historyRecord.id,
        };

        if (municipalServiceId) {
          invoicePayload.municipalServiceId = municipalServiceId;
        }

        if (aliquota) {
          invoicePayload.taxes = {
            retainIss: false,
            iss: aliquota,
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
