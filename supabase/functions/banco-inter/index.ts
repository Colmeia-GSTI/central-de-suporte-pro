import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BoletoRequest {
  invoice_id?: string;
  payment_type?: "boleto" | "pix";
  action?: "test" | "cancel";
  motivo_cancelamento?: string;
}

interface InterSettings {
  client_id: string;
  client_secret: string;
  pix_key: string;
  certificate_crt?: string;
  certificate_key?: string;
  certificate_base64?: string; // Legacy support
  environment: "sandbox" | "production";
}

// Create HTTP client with mTLS certificates
function createMtlsClient(certBase64: string, keyBase64: string): Deno.HttpClient {
  const cert = atob(certBase64);
  const key = atob(keyBase64);
  
  return Deno.createHttpClient({
    caCerts: [], // Use system CA certs
    cert: cert,
    key: key,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get settings from database
    const { data: settingsData, error: settingsError } = await supabase
      .from("integration_settings")
      .select("settings, is_active")
      .eq("integration_type", "banco_inter")
      .single();

    if (settingsError || !settingsData) {
      return new Response(
        JSON.stringify({ 
          error: "Integração Banco Inter não configurada",
          configured: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settingsData.is_active) {
      return new Response(
        JSON.stringify({ 
          error: "Integração Banco Inter desativada",
          configured: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const settings = settingsData.settings as InterSettings;

    if (!settings.client_id || !settings.client_secret) {
      return new Response(
        JSON.stringify({ 
          error: "Credenciais Banco Inter incompletas",
          configured: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if certificates are configured (new format or legacy)
    const hasCertificates = (settings.certificate_crt && settings.certificate_key) || settings.certificate_base64;
    if (!hasCertificates) {
      return new Response(
        JSON.stringify({ 
          error: "Certificados do Banco Inter não configurados. Faça upload dos arquivos .crt e .key.",
          configured: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[BANCO-INTER] Certificados configurados:", settings.certificate_crt ? "CRT+KEY" : "Base64 Legacy");
    console.log("[BANCO-INTER] Ambiente:", settings.environment);

    // Create mTLS client
    let httpClient: Deno.HttpClient | undefined;
    try {
      if (settings.certificate_crt && settings.certificate_key) {
        httpClient = createMtlsClient(settings.certificate_crt, settings.certificate_key);
        console.log("[BANCO-INTER] Cliente mTLS criado com sucesso");
      }
    } catch (certError) {
      console.error("[BANCO-INTER] Erro ao criar cliente mTLS:", certError);
      return new Response(
        JSON.stringify({ 
          error: "Erro ao processar certificados. Verifique se os arquivos .crt e .key estão corretos.",
          details: String(certError)
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { invoice_id, payment_type, action, motivo_cancelamento }: BoletoRequest = await req.json();

    const baseUrl = settings.environment === "production" 
      ? "https://cdpj.partners.bancointer.com.br"
      : "https://cdpj-sandbox.partners.bancointer.com.br";

    console.log("[BANCO-INTER] Base URL:", baseUrl);

    // Helper function for fetch with mTLS
    const mtlsFetch = async (url: string, options: RequestInit) => {
      const fetchOptions = httpClient ? { ...options, client: httpClient } : options;
      return await fetch(url, fetchOptions as RequestInit);
    };

    // Helper to try getting a token with specific scope
    const tryGetToken = async (scope: string): Promise<{ access_token?: string; error?: string }> => {
      try {
        const response = await mtlsFetch(`${baseUrl}/oauth/v2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: settings.client_id,
            client_secret: settings.client_secret,
            grant_type: "client_credentials",
            scope,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[BANCO-INTER] Token error for scope "${scope}":`, errorText);
          
          if (errorText.includes("No registered scope value")) {
            return { error: `Escopo "${scope}" não está habilitado para este Client ID no portal do Banco Inter.` };
          }
          
          return { error: errorText };
        }

        const data = await response.json();
        return { access_token: data.access_token };
      } catch (err) {
        const msg = String((err as any)?.message ?? err);
        if (settings.environment === "sandbox" && msg.includes("failed to lookup address")) {
          return { error: "Sandbox do Banco Inter indisponível. Use ambiente Produção." };
        }
        return { error: msg };
      }
    };

    // Helper: try individual scope first, then combined as fallback
    const tryGetTokenWithFallback = async (
      primaryScope: string,
      fallbackScope: string
    ): Promise<{ access_token?: string; error?: string; usedScope?: string }> => {
      console.log(`[BANCO-INTER] Tentando escopo individual: "${primaryScope}"`);
      const primary = await tryGetToken(primaryScope);
      if (primary.access_token) {
        return { ...primary, usedScope: primaryScope };
      }
      console.log(`[BANCO-INTER] Escopo individual falhou, tentando combinado: "${fallbackScope}"`);
      const fallback = await tryGetToken(fallbackScope);
      if (fallback.access_token) {
        return { ...fallback, usedScope: fallbackScope };
      }
      return { error: `Falha em ambos os escopos. Individual: ${primary.error}. Combinado: ${fallback.error}` };
    };

    // Test action - verify credentials and check which scopes are available
    if (action === "test") {
      console.log("[BANCO-INTER] Testando conexão e verificando escopos...");

      const availableScopes: string[] = [];
      let boletoError: string | undefined;
      let pixError: string | undefined;

      // Test boleto scopes individually
      const boletoWriteResult = await tryGetToken("boleto-cobranca.write");
      if (boletoWriteResult.access_token) {
        console.log("[BANCO-INTER] Escopo boleto-cobranca.write OK");
        availableScopes.push("boleto-cobranca.write");
      } else {
        console.log("[BANCO-INTER] boleto-cobranca.write falhou:", boletoWriteResult.error);
      }

      const boletoReadResult = await tryGetToken("boleto-cobranca.read");
      if (boletoReadResult.access_token) {
        console.log("[BANCO-INTER] Escopo boleto-cobranca.read OK");
        availableScopes.push("boleto-cobranca.read");
      } else {
        console.log("[BANCO-INTER] boleto-cobranca.read falhou:", boletoReadResult.error);
      }

      // If individual scopes failed, try combined as fallback
      if (!availableScopes.includes("boleto-cobranca.write") && !availableScopes.includes("boleto-cobranca.read")) {
        const boletoCombined = await tryGetToken("boleto-cobranca.read boleto-cobranca.write");
        if (boletoCombined.access_token) {
          console.log("[BANCO-INTER] Escopos de boleto combinados OK");
          availableScopes.push("boleto-cobranca.read", "boleto-cobranca.write");
        } else {
          boletoError = boletoCombined.error;
        }
      }

      // Test PIX scopes individually
      const pixWriteResult = await tryGetToken("cob.write");
      if (pixWriteResult.access_token) {
        console.log("[BANCO-INTER] Escopo cob.write OK");
        availableScopes.push("cob.write");
      } else {
        console.log("[BANCO-INTER] cob.write falhou:", pixWriteResult.error);
      }

      const pixReadResult = await tryGetToken("cob.read");
      if (pixReadResult.access_token) {
        console.log("[BANCO-INTER] Escopo cob.read OK");
        availableScopes.push("cob.read");
      } else {
        console.log("[BANCO-INTER] cob.read falhou:", pixReadResult.error);
      }

      // If individual PIX scopes failed, try combined
      if (!availableScopes.includes("cob.write") && !availableScopes.includes("cob.read")) {
        const pixCombined = await tryGetToken("cob.read cob.write");
        if (pixCombined.access_token) {
          console.log("[BANCO-INTER] Escopos PIX combinados OK");
          availableScopes.push("cob.read", "cob.write");
        } else {
          pixError = pixCombined.error;
        }
      }

      // Return results
      if (availableScopes.length > 0) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Conexão válida - ${availableScopes.length} escopos disponíveis`,
            available_scopes: availableScopes,
            boleto_error: boletoError,
            pix_error: pixError,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Both failed - return detailed error
      console.error("[BANCO-INTER] Todas as tentativas de autenticação falharam");
      return new Response(
        JSON.stringify({
          error: "Falha na autenticação com Banco Inter",
          details: "Nenhum escopo OAuth está configurado corretamente para este Client ID.",
          hint: "Acesse o portal do Banco Inter e habilite os escopos: 'boleto-cobranca.read', 'boleto-cobranca.write' para boletos ou 'cob.read', 'cob.write' para PIX.",
          available_scopes: [],
          boleto_error: boletoError,
          pix_error: pixError,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cancel action - cancel an existing boleto
    if (action === "cancel") {
      if (!invoice_id) {
        return new Response(
          JSON.stringify({ error: "invoice_id é obrigatório para cancelar" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get the invoice to find the codigoSolicitacao
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, invoice_number, notes, boleto_barcode")
        .eq("id", invoice_id)
        .single();

      if (invoiceError || !invoice) {
        return new Response(
          JSON.stringify({ error: "Fatura não encontrada" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract codigoSolicitacao from notes or use a different identifier
      const match = invoice.notes?.match(/codigoSolicitacao:([a-f0-9-]+)/i);
      let codigoSolicitacao = match ? match[1] : null;

      // If no codigoSolicitacao in notes, we need to query by seuNumero
      if (!codigoSolicitacao) {
        console.log("[BANCO-INTER] Buscando boleto por seuNumero para cancelamento...");
        
        // Get token first
        const tokenResponse = await mtlsFetch(`${baseUrl}/oauth/v2/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: settings.client_id,
            client_secret: settings.client_secret,
            grant_type: "client_credentials",
            scope: "boleto-cobranca.write",
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error("Erro ao autenticar: " + errorText);
        }

        const { access_token } = await tokenResponse.json();

        // Search for the boleto by seuNumero
        const searchResponse = await mtlsFetch(
          `${baseUrl}/cobranca/v3/cobrancas?filtrarPor=TODOS&seuNumero=${invoice.invoice_number}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${access_token}` },
          }
        );

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          if (searchData.cobrancas && searchData.cobrancas.length > 0) {
            codigoSolicitacao = searchData.cobrancas[0].codigoSolicitacao;
          }
        }
      }

      if (!codigoSolicitacao) {
        return new Response(
          JSON.stringify({ error: "Não foi possível encontrar o boleto no banco" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[BANCO-INTER] Cancelando boleto:", codigoSolicitacao);

      // Get token for cancellation
      const tokenResponse = await mtlsFetch(`${baseUrl}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: settings.client_id,
          client_secret: settings.client_secret,
          grant_type: "client_credentials",
          scope: "boleto-cobranca.write",
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        throw new Error("Erro ao autenticar: " + errorText);
      }

      const { access_token } = await tokenResponse.json();

      // Cancel the boleto
      const cancelResponse = await mtlsFetch(
        `${baseUrl}/cobranca/v3/cobrancas/${codigoSolicitacao}/cancelar`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            motivoCancelamento: motivo_cancelamento || "ACERTOS",
          }),
        }
      );

      if (!cancelResponse.ok) {
        const errorText = await cancelResponse.text();
        console.error("[BANCO-INTER] Cancel error:", errorText);
        throw new Error("Erro ao cancelar boleto: " + errorText);
      }

      console.log("[BANCO-INTER] Boleto cancelado com sucesso");

      // Update invoice - remove boleto info
      const currentNotes = invoice.notes || "";
      const cleanNotes = currentNotes
        .replace(/\s*codigoSolicitacao:[a-f0-9-]+/gi, "")
        .trim();

      await supabase
        .from("invoices")
        .update({
          boleto_barcode: null,
          boleto_url: null,
          payment_method: null,
          notes: cleanNotes ? `${cleanNotes} [Boleto cancelado em ${new Date().toLocaleDateString("pt-BR")}]` : `[Boleto cancelado em ${new Date().toLocaleDateString("pt-BR")}]`,
        })
        .eq("id", invoice_id);

      return new Response(
        JSON.stringify({ success: true, message: "Boleto cancelado com sucesso" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!invoice_id || !payment_type) {
      return new Response(
        JSON.stringify({ error: "invoice_id e payment_type são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch invoice with client info
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        client:clients(name, document, email, address, city, state, zip_code)
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      throw new Error("Fatura não encontrada");
    }

    console.log("[BANCO-INTER] Fatura encontrada:", invoice.invoice_number);

    // Get OAuth token from Banco Inter
    // NOTE: for expected auth/scope issues, we return 200 with { error } so the UI can show a friendly message
    // Use individual scope first, fallback to combined
    const primaryScope = payment_type === "boleto" ? "boleto-cobranca.write" : "cob.write";
    const fallbackScope = payment_type === "boleto"
      ? "boleto-cobranca.read boleto-cobranca.write"
      : "cob.read cob.write";

    const tokenResult = await tryGetTokenWithFallback(primaryScope, fallbackScope);

    if (!tokenResult.access_token) {
      const friendlyError =
        tokenResult.error?.includes("Escopo")
          ? tokenResult.error
          : `Falha ao autenticar com Banco Inter para ${payment_type.toUpperCase()}.`;

      console.error("[BANCO-INTER] Token error:", tokenResult.error);

      return new Response(
        JSON.stringify({
          error:
            `${friendlyError}\n\n` +
            `Habilite no portal do Banco Inter o escopo "${primaryScope}" e tente novamente.`,
          configured: true,
          required_scopes: [primaryScope],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const access_token = tokenResult.access_token;
    console.log("[BANCO-INTER] Token obtido para", payment_type);

    let result;

    if (payment_type === "boleto") {
      // Generate Boleto
      const dueDate = new Date(invoice.due_date);
      const boletoPayload = {
        seuNumero: invoice.invoice_number.toString(),
        valorNominal: invoice.amount,
        dataVencimento: dueDate.toISOString().split("T")[0],
        numDiasAgenda: 60,
        pagador: {
          cpfCnpj: invoice.client?.document?.replace(/\D/g, "") || "",
          tipoPessoa: (invoice.client?.document?.replace(/\D/g, "").length || 0) > 11 ? "JURIDICA" : "FISICA",
          nome: invoice.client?.name || "Cliente",
          endereco: invoice.client?.address || "",
          cidade: invoice.client?.city || "",
          uf: invoice.client?.state || "",
          cep: invoice.client?.zip_code?.replace(/\D/g, "") || "",
          email: invoice.client?.email || "",
        },
        mensagem: {
          linha1: `Fatura #${invoice.invoice_number}`,
        },
      };

      console.log("[BANCO-INTER] Gerando boleto...");

      const boletoResponse = await mtlsFetch(`${baseUrl}/cobranca/v3/cobrancas`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(boletoPayload),
      });

      if (!boletoResponse.ok) {
        const errorText = await boletoResponse.text();
        console.error("[BANCO-INTER] Boleto error:", errorText);
        throw new Error("Erro ao gerar boleto: " + errorText);
      }

      result = await boletoResponse.json();
      console.log("[BANCO-INTER] Boleto gerado:", JSON.stringify(result));

      // Update invoice with boleto info
      // API v3 returns codigoSolicitacao for async processing - implement polling
      const updateData: Record<string, any> = {
        payment_method: "boleto",
      };

      if (result.codigoBarras && result.linhaDigitavel) {
        // Immediate response with barcode (rare but handle it)
        updateData.boleto_barcode = result.linhaDigitavel;
        updateData.boleto_url = result.pdfUrl;
        updateData.boleto_status = "enviado";
        console.log("[BANCO-INTER] Boleto com dados completos imediatos");
      } else if (result.codigoSolicitacao) {
        // Async processing - POLLING para obter dados completos
        console.log("[BANCO-INTER] Boleto criado async, iniciando polling para codigoSolicitacao:", result.codigoSolicitacao);
        
        const { data: currentInvoice } = await supabase
          .from("invoices")
          .select("notes")
          .eq("id", invoice_id)
          .single();
        
        const existingNotes = currentInvoice?.notes || "";
        
        let boletoCompleto = false;
        const maxTentativas = 12; // 60 segundos (5 segundos cada)
        
        for (let tentativa = 1; tentativa <= maxTentativas && !boletoCompleto; tentativa++) {
          await new Promise(r => setTimeout(r, 5000)); // Aguarda 5 segundos
          console.log(`[BANCO-INTER] Polling tentativa ${tentativa}/${maxTentativas}...`);
          
          try {
            const detailsResponse = await mtlsFetch(
              `${baseUrl}/cobranca/v3/cobrancas/${result.codigoSolicitacao}`,
              { 
                method: "GET",
                headers: { Authorization: `Bearer ${access_token}` }
              }
            );
            
            if (detailsResponse.ok) {
              const details = await detailsResponse.json();
              console.log("[BANCO-INTER] Polling response:", JSON.stringify(details).slice(0, 200));
              
              if (details.codigoBarras && details.linhaDigitavel) {
                console.log("[BANCO-INTER] Dados do boleto obtidos com sucesso via polling");
                
                updateData.boleto_barcode = details.linhaDigitavel;
                updateData.boleto_url = details.pdfUrl || `https://inter.co/boleto/${details.codigoBarras}`;
                updateData.boleto_status = "enviado";
                updateData.notes = `${existingNotes} codigoSolicitacao:${result.codigoSolicitacao} nossoNumero:${details.nossoNumero || ""}`.trim();
                
                boletoCompleto = true;
                break;
              }
            } else {
              const errorText = await detailsResponse.text();
              console.warn(`[BANCO-INTER] Polling tentativa ${tentativa} resposta não-OK:`, errorText);
            }
          } catch (pollError) {
            console.warn(`[BANCO-INTER] Polling tentativa ${tentativa} falhou:`, pollError);
          }
        }
        
        if (!boletoCompleto) {
          // Se não conseguiu dados após polling, salvar codigoSolicitacao e status pendente
          console.warn("[BANCO-INTER] Timeout no polling - boleto ainda pendente de processamento no Banco Inter");
          updateData.notes = `${existingNotes} codigoSolicitacao:${result.codigoSolicitacao}`.trim();
          updateData.boleto_status = "pendente"; // NÃO "enviado" - aguardando dados completos
        }
      }

      await supabase
        .from("invoices")
        .update(updateData)
        .eq("id", invoice_id);

    } else {
      // Generate PIX
      const pixPayload = {
        calendario: {
          expiracao: 86400 * 3, // 3 days
        },
        valor: {
          original: invoice.amount.toFixed(2),
        },
        chave: settings.pix_key || "",
        infoAdicionais: [
          { nome: "Fatura", valor: `#${invoice.invoice_number}` },
        ],
      };

      console.log("[BANCO-INTER] Gerando PIX...");

      const pixResponse = await mtlsFetch(`${baseUrl}/pix/v2/cob`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pixPayload),
      });

      if (!pixResponse.ok) {
        const errorText = await pixResponse.text();
        console.error("[BANCO-INTER] PIX error:", errorText);
        throw new Error("Erro ao gerar PIX: " + errorText);
      }

      result = await pixResponse.json();
      console.log("[BANCO-INTER] PIX gerado");

      // Update invoice with PIX info
      await supabase
        .from("invoices")
        .update({
          pix_code: result.pixCopiaECola,
          payment_method: "pix",
        })
        .eq("id", invoice_id);
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[BANCO-INTER] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});