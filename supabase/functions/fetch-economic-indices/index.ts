import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Busca índices econômicos (IGPM, IPCA, INPC) da API do Banco Central do Brasil
 * 
 * API: https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados?formato=json
 * Séries:
 *   IGPM = 189 (variação mensal)
 *   IPCA = 433 (variação mensal)
 *   INPC = 188 (variação mensal)
 */

const BCB_SERIES: Record<string, number> = {
  IGPM: 189,
  IPCA: 433,
  INPC: 188,
};

interface BCBDataPoint {
  data: string; // dd/mm/yyyy
  valor: string;
}

async function fetchBCBSeries(serieCode: number, months: number = 13): Promise<BCBDataPoint[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  
  const formatDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serieCode}/dados?formato=json&dataInicial=${formatDate(startDate)}&dataFinal=${formatDate(endDate)}`;
  
  console.log(`[FETCH-INDICES] Buscando série ${serieCode}: ${url}`);
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`BCB API error: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

function parseBCBDate(dateStr: string): string {
  // dd/mm/yyyy -> yyyy-mm-dd
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const indexTypes = body.index_types || ["IGPM", "IPCA", "INPC"];
    const months = body.months || 13;

    console.log(`[FETCH-INDICES] Buscando índices: ${indexTypes.join(", ")} (${months} meses)`);

    const results: Record<string, { fetched: number; inserted: number; latest?: { date: string; value: number } }> = {};

    for (const indexType of indexTypes) {
      const serieCode = BCB_SERIES[indexType];
      if (!serieCode) {
        console.warn(`[FETCH-INDICES] Série desconhecida: ${indexType}`);
        continue;
      }

      try {
        const data = await fetchBCBSeries(serieCode, months);
        console.log(`[FETCH-INDICES] ${indexType}: ${data.length} pontos recebidos`);

        let inserted = 0;
        let latestPoint: { date: string; value: number } | undefined;

        // Calculate accumulated 12 months
        for (let i = 0; i < data.length; i++) {
          const point = data[i];
          const refDate = parseBCBDate(point.data);
          const value = parseFloat(point.valor);

          // Calculate accumulated 12m (product of last 12 monthly factors)
          let accumulated12m: number | null = null;
          if (i >= 11) {
            let product = 1;
            for (let j = i - 11; j <= i; j++) {
              product *= (1 + parseFloat(data[j].valor) / 100);
            }
            accumulated12m = Math.round((product - 1) * 10000) / 100; // percentage with 2 decimals
          }

          const { error } = await supabase
            .from("economic_indices")
            .upsert({
              index_type: indexType,
              reference_date: refDate,
              value,
              accumulated_12m: accumulated12m,
              source: "BCB",
              fetched_at: new Date().toISOString(),
            }, {
              onConflict: "index_type,reference_date",
            });

          if (!error) {
            inserted++;
            latestPoint = { date: refDate, value };
          }
        }

        results[indexType] = { fetched: data.length, inserted, latest: latestPoint };
        console.log(`[FETCH-INDICES] ${indexType}: ${inserted} registros salvos`);
      } catch (serieError) {
        console.error(`[FETCH-INDICES] Erro ao buscar ${indexType}:`, serieError);
        results[indexType] = { fetched: 0, inserted: 0 };
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[FETCH-INDICES] Erro:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
