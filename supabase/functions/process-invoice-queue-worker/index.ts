import { createClient } from "npm:@supabase/supabase-js@2";

interface QueueItem {
  id: string;
  invoice_id: string;
  status: string;
  attempt_number: number;
  max_attempts: number;
  process_type: string;
  processing_options: Record<string, unknown>;
  next_retry_at: string;
}

interface ProcessingResult {
  queue_id: string;
  invoice_id: string;
  success: boolean;
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
 * Process a single queue item
 */
async function processQueueItem(item: QueueItem): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    queue_id: item.id,
    invoice_id: item.invoice_id,
    success: false,
  };

  try {
    console.log(
      `[queue-worker] Processing queue item ${item.id} (invoice: ${item.invoice_id}, attempt: ${item.attempt_number}/${item.max_attempts})`
    );

    // Call batch-process-invoices function with options from queue
    const { data, error } = await supabase.functions.invoke(
      "batch-process-invoices",
      {
        body: {
          invoice_ids: [item.invoice_id],
          generate_boleto: item.processing_options.generate_boleto || false,
          generate_pix: item.processing_options.generate_pix || false,
          emit_nfse: item.processing_options.emit_nfse || false,
          send_email: item.processing_options.send_email || false,
          send_whatsapp: item.processing_options.send_whatsapp || false,
        },
      }
    );

    if (error) {
      throw new Error(`Function error: ${error.message}`);
    }

    if (data?.results?.[0]?.success === false) {
      throw new Error(data.results[0].error || "Processing failed");
    }

    // Mark as completed
    const { error: updateError } = await supabase
      .from("invoice_processing_queue")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        last_error: null,
        error_code: null,
      })
      .eq("id", item.id);

    if (updateError) {
      throw updateError;
    }

    console.log(
      `[queue-worker] Queue item ${item.id} completed successfully`
    );
    result.success = true;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    console.error(
      `[queue-worker] Error processing queue item ${item.id}:`,
      error
    );

    // Call handle_processing_failure function
    const { error: failureError } = await supabase.rpc(
      "handle_processing_failure",
      {
        p_queue_id: item.id,
        p_error_message: error,
        p_error_code: "PROCESSING_ERROR",
      }
    );

    if (failureError) {
      console.error(
        `[queue-worker] Error updating failure state:`,
        failureError
      );
    }

    result.error = error;
  }

  return result;
}

/**
 * Main worker function
 */
async function processQueue() {
  console.log("[queue-worker] Starting queue processing");

  try {
    // Fetch pending items that are ready to retry
    const { data: queueItems, error } = await supabase
      .from("invoice_processing_queue")
      .select("*")
      .in("status", ["pending", "processing"])
      .lte("next_retry_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(10); // Process max 10 per execution

    if (error) {
      throw error;
    }

    const items = (queueItems || []) as QueueItem[];

    if (items.length === 0) {
      console.log("[queue-worker] No pending items to process");
      return {
        success: true,
        message: "No pending items",
        processed: 0,
      };
    }

    console.log(`[queue-worker] Found ${items.length} items to process`);

    // Mark items as processing
    const { error: markError } = await supabase
      .from("invoice_processing_queue")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .in(
        "id",
        items.map((i) => i.id)
      );

    if (markError) {
      throw markError;
    }

    // Process each item
    const results: ProcessingResult[] = [];
    for (const item of items) {
      const result = await processQueueItem(item);
      results.push(result);

      // Small delay between items to avoid overwhelming
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    console.log(
      `[queue-worker] Completed: ${successCount} success, ${failureCount} failures`
    );

    return {
      success: true,
      message: "Queue processing completed",
      processed: items.length,
      successful: successCount,
      failed: failureCount,
      results,
    };
  } catch (err) {
    console.error("[queue-worker] Fatal error:", err);

    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      processed: 0,
    };
  }
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // This function can be called via HTTP or Cron
  // If called via HTTP, check for authorization
  const authHeader = req.headers.get("authorization");
  if (authHeader && !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const result = await processQueue();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[queue-worker] Handler error:", error);

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
