import { createClient } from "npm:@supabase/supabase-js@2";

interface ValidationRequest {
  invoice_id: string;
  client_id: string;
  amount: number;
  due_date: string;
  items?: Array<{
    description: string;
    quantity: number;
    unit_value: number;
    total_value: number;
  }>;
}

interface ValidationError {
  field: string;
  message: string;
  code: string;
}

interface ValidationResponse {
  success: boolean;
  is_valid: boolean;
  errors: ValidationError[];
  execution_id: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase credentials");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Validates invoice amount
 */
function validateAmount(amount: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!amount || amount <= 0) {
    errors.push({
      field: "amount",
      message: "Valor da fatura deve ser maior que zero",
      code: "AMOUNT_INVALID",
    });
  } else if (amount > 999999999.99) {
    errors.push({
      field: "amount",
      message: "Valor da fatura excede o limite máximo (R$ 999.999.999,99)",
      code: "AMOUNT_EXCEEDED",
    });
  }

  return errors;
}

/**
 * Validates due date
 */
function validateDueDate(dueDate: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!dueDate) {
    errors.push({
      field: "due_date",
      message: "Data de vencimento é obrigatória",
      code: "DUE_DATE_REQUIRED",
    });
    return errors;
  }

  const date = new Date(dueDate);

  if (isNaN(date.getTime())) {
    errors.push({
      field: "due_date",
      message: "Data de vencimento inválida",
      code: "DUE_DATE_INVALID",
    });
    return errors;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (date < today) {
    errors.push({
      field: "due_date",
      message: "Data de vencimento não pode ser no passado",
      code: "DUE_DATE_PAST",
    });
  }

  return errors;
}

/**
 * Validates invoice items
 */
function validateItems(
  items: ValidationRequest["items"] | undefined,
  totalAmount: number
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!items || items.length === 0) {
    return errors;
  }

  let itemsSum = 0;

  items.forEach((item, index) => {
    if (!item.description || item.description.trim().length === 0) {
      errors.push({
        field: `items[${index}].description`,
        message: "Descrição do item é obrigatória",
        code: "ITEM_DESCRIPTION_REQUIRED",
      });
    }

    if (item.quantity <= 0) {
      errors.push({
        field: `items[${index}].quantity`,
        message: "Quantidade deve ser maior que zero",
        code: "ITEM_QUANTITY_INVALID",
      });
    }

    if (item.unit_value <= 0) {
      errors.push({
        field: `items[${index}].unit_value`,
        message: "Valor unitário deve ser maior que zero",
        code: "ITEM_UNIT_VALUE_INVALID",
      });
    }

    const expectedTotal = item.quantity * item.unit_value;
    if (Math.abs(item.total_value - expectedTotal) > 0.01) {
      errors.push({
        field: `items[${index}].total_value`,
        message: `Valor total deve ser ${expectedTotal.toFixed(2)}`,
        code: "ITEM_TOTAL_MISMATCH",
      });
    }

    itemsSum += item.total_value;
  });

  if (items.length > 0 && Math.abs(itemsSum - totalAmount) > 0.01) {
    errors.push({
      field: "items",
      message: `Soma dos itens (${itemsSum.toFixed(2)}) deve corresponder ao valor total (${totalAmount.toFixed(2)})`,
      code: "ITEMS_SUM_MISMATCH",
    });
  }

  return errors;
}

/**
 * Main validation function
 */
async function validateInvoice(
  req: ValidationRequest,
  executionId: string
): Promise<ValidationResponse> {
  const errors: ValidationError[] = [];

  console.log(`[validate-invoice] Starting validation for invoice ${req.invoice_id}`);
  console.log(`[validate-invoice] Execution ID: ${executionId}`);

  // Validate amount
  errors.push(...validateAmount(req.amount));

  // Validate due date
  errors.push(...validateDueDate(req.due_date));

  // Validate items if provided
  if (req.items && req.items.length > 0) {
    errors.push(...validateItems(req.items, req.amount));
  }

  // Validate client exists
  const { data: clientData } = await supabase
    .from("clients")
    .select("id, is_active")
    .eq("id", req.client_id)
    .single();

  if (!clientData || !clientData.is_active) {
    errors.push({
      field: "client_id",
      message: "Cliente não existe ou está inativo",
      code: "CLIENT_INVALID",
    });
  }

  const isValid = errors.length === 0;

  console.log(
    `[validate-invoice] Validation complete: ${isValid ? "VALID" : "INVALID"}`
  );
  console.log(`[validate-invoice] Errors: ${errors.length}`);

  // Persist validation log to database
  try {
    await supabase.from("invoice_validation_logs").insert({
      execution_id: executionId,
      action: "validate",
      is_valid: isValid,
      error_count: errors.length,
      warning_count: 0,
      errors: errors.length > 0 ? errors : null,
    });

    console.log(`[validate-invoice] Validation log persisted successfully`);
  } catch (dbError) {
    console.error(
      `[validate-invoice] Error persisting validation log:`,
      dbError
    );
    // Don't fail the request, just log the error
  }

  return {
    success: true,
    is_valid: isValid,
    errors,
    execution_id: executionId,
  };
}

/**
 * Main function handler
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const {
      invoice_id,
      client_id,
      amount,
      due_date,
      items,
    } = body as ValidationRequest;

    // Generate execution ID
    const executionId = crypto.randomUUID();

    // Validate required fields
    if (!invoice_id || !client_id || amount === undefined || !due_date) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Perform validation
    const validationResult = await validateInvoice(
      { invoice_id, client_id, amount, due_date, items },
      executionId
    );

    return new Response(JSON.stringify(validationResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`[validate-invoice] Unexpected error:`, error);

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
