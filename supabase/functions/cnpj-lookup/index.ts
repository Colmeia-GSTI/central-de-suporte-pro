import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cnpj } = await req.json();
    
    if (!cnpj) {
      return new Response(
        JSON.stringify({ status: "ERROR", message: "CNPJ não informado" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Remove non-numeric characters
    const cleanCnpj = cnpj.replace(/\D/g, "");
    
    if (cleanCnpj.length !== 14) {
      return new Response(
        JSON.stringify({ status: "ERROR", message: "CNPJ deve ter 14 dígitos" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Call ReceitaWS API (com timeout de 8s)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response: Response;
    try {
      response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
        headers: {
          "Accept": "application/json",
        },
        signal: controller.signal,
      });
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      return new Response(
        JSON.stringify({
          status: "ERROR",
          message: isAbort
            ? "Tempo de consulta esgotado, tente novamente"
            : "Falha ao conectar ao serviço de consulta de CNPJ",
        }),
        { status: 504, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    } finally {
      clearTimeout(timeout);
    }

    // Rate limit da ReceitaWS (3 consultas/min no plano gratuito)
    if (response.status === 429) {
      return new Response(
        JSON.stringify({ status: "ERROR", message: "Limite de consultas atingido, tente novamente em 1 minuto" }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({ status: "ERROR", message: "Serviço de consulta de CNPJ indisponível" }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Resposta pode não ser JSON válido (ex.: página de erro HTML)
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      return new Response(
        JSON.stringify({ status: "ERROR", message: "Resposta inválida do serviço de consulta de CNPJ" }),
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("Error fetching CNPJ:", error);
    return new Response(
      JSON.stringify({ status: "ERROR", message: "Erro ao consultar CNPJ" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
