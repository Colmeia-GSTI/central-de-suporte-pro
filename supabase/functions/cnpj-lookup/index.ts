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

    // Call ReceitaWS API
    const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`, {
      headers: {
        "Accept": "application/json",
      },
    });

    const data = await response.json();

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
