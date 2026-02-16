import { createClient } from "npm:@supabase/supabase-js@2";

interface ValidationRequest {
  client_id: string;
  action: "validate_sequence" | "detect_gaps" | "suggest_recovery";
}

interface SequenceGap {
  missing_numbers: number[];
  gap_size: number;
}

interface ValidationResponse {
  success: boolean;
  action: string;
  result?: Record<string, unknown>;
  error?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Detects gaps in invoice number sequence
 */
async function detectSequenceGaps(clientId: string): Promise<SequenceGap> {
  const { data: invoices, error } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("client_id", clientId)
    .neq("status", "cancelled")
    .order("invoice_number");

  if (error) {
    throw new Error(`Error fetching invoices: ${error.message}`);
  }

  const numbers = (invoices || [])
    .filter((inv) => inv.invoice_number !== null)
    .map((inv) => inv.invoice_number as number)
    .sort((a, b) => a - b);

  const gaps: number[] = [];

  for (let i = 0; i < numbers.length - 1; i++) {
    const gap = numbers[i + 1] - numbers[i];
    if (gap > 1 && gap <= 10) {
      for (let j = numbers[i] + 1; j < numbers[i + 1]; j++) {
        gaps.push(j);
      }
    }
  }

  return {
    missing_numbers: gaps,
    gap_size: gaps.length,
  };
}

/**
 * Validates sequence consistency
 */
async function validateSequence(clientId: string): Promise<{
  is_valid: boolean;
  last_number: number;
  expected_next: number;
  gap_count: number;
}> {
  const { data: config } = await supabase
    .from("invoice_number_config")
    .select("current_sequence")
    .eq("client_id", clientId)
    .single();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("client_id", clientId)
    .neq("status", "cancelled")
    .order("invoice_number", { ascending: false })
    .limit(1);

  const lastNumber = invoices?.[0]?.invoice_number || 0;
  const expectedNext = (config?.current_sequence || 0) + 1;

  // Detect gaps
  const gapData = await detectSequenceGaps(clientId);

  return {
    is_valid: lastNumber === expectedNext - 1 && gapData.gap_size === 0,
    last_number: lastNumber,
    expected_next: expectedNext,
    gap_count: gapData.gap_size,
  };
}

/**
 * Suggests recovery action for gaps
 */
async function suggestRecovery(clientId: string): Promise<{
  suggested_number: number;
  reason: string;
}> {
  const gaps = await detectSequenceGaps(clientId);

  if (gaps.missing_numbers.length > 0) {
    return {
      suggested_number: gaps.missing_numbers[0],
      reason: `Use next missing number from gap: ${gaps.missing_numbers[0]}`,
    };
  }

  // Get config for next sequential
  const { data: config } = await supabase
    .from("invoice_number_config")
    .select("current_sequence")
    .eq("client_id", clientId)
    .single();

  const nextSeq = (config?.current_sequence || 0) + 1;

  return {
    suggested_number: nextSeq,
    reason: "No gaps detected. Use next sequential number.",
  };
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ValidationRequest;
    const { client_id, action } = body;

    if (!client_id || !action) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: client_id, action",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let result: Record<string, unknown>;

    switch (action) {
      case "validate_sequence":
        result = await validateSequence(client_id) as unknown as Record<string, unknown>;
        break;
      case "detect_gaps":
        result = await detectSequenceGaps(client_id) as unknown as Record<string, unknown>;
        break;
      case "suggest_recovery":
        result = await suggestRecovery(client_id) as unknown as Record<string, unknown>;
        break;
      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: `Unknown action: ${action}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }

    return new Response(
      JSON.stringify({
        success: true,
        action,
        result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[validate-invoice-numbering] Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
