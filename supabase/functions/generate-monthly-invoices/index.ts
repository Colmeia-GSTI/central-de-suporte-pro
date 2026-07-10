import { createClient } from "npm:@supabase/supabase-js@2";
import {
  formatCurrencyBRL,
  getEmailSettings,
  wrapInEmailLayout,
  applyNotificationMessage,
  buildPaymentSectionHtml,
} from "../_shared/email-helpers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Extrai a causa real de um erro de supabase.functions.invoke. Em erros non-2xx,
// FunctionsHttpError expõe `context` (a Response) — lê o corpo para achar a msg real,
// em vez de "Edge Function returned a non-2xx status code".
// deno-lint-ignore no-explicit-any
async function extractInvokeErrorMsg(error: any, fallback: string): Promise<string> {
  try {
    const body = await error?.context?.json();
    const real = body?.error || body?.message;
    if (real) return String(real);
  } catch { /* corpo indisponível/não-JSON: usa fallback */ }
  return error?.message || fallback;
}

interface Contract {
  id: string;
  client_id: string;
  name: string;
  monthly_value: number;
  billing_day: number | null;
  days_before_due: number | null;
  payment_preference: string | null;
  billing_provider: string | null;
  nfse_enabled: boolean | null;
  nfse_aliquota: number | null;
  nfse_iss_retido: boolean | null;
  notification_message: string | null;
  description: string | null;
  nfse_descricao_customizada: string | null;
  nfse_service_code: string | null;
  first_billing_month: string | null;
  billing_frequency: "monthly" | "bimonthly" | "quarterly" | "semiannual" | "yearly" | null;
  end_date: string | null;
  clients: {
    name: string;
    email: string | null;
    financial_email: string | null;
  } | null;
}

interface AdditionalCharge {
  id: string;
  description: string;
  amount: number;
}

interface ContractResult {
  contract_id: string;
  contract_name: string;
  status: "created" | "skipped" | "error";
  invoice_id: string | null;
  invoice_number: number | null;
  error: string | null;
  duration_ms: number;
}

interface ExecutionError {
  contract_id: string;
  contract_name: string;
  code: string;
  message: string;
  timestamp: string;
}

interface GenerationResponse {
  success: boolean;
  message: string;
  timestamp: string;
  execution_id: string;
  reference_month: string;
  stats: {
    total_contracts: number;
    generated: number;
    skipped: number;
    failed: number;
  };
  results: ContractResult[];
  errors: ExecutionError[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logToDatabase(
  supabase: any,
  level: "info" | "warn" | "error",
  module: string,
  action: string,
  message: string,
  context?: Record<string, unknown>,
  errorDetails?: Record<string, unknown>,
  executionId?: string,
  durationMs?: number
) {
  try {
    await supabase.from("application_logs").insert({
      level,
      module,
      action,
      message,
      context,
      error_details: errorDetails,
      execution_id: executionId,
      duration_ms: durationMs,
    });
  } catch (e) {
    console.error("[LOG-DB] Failed to persist log:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const executionId = crypto.randomUUID();
  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Role guard: só barra usuários autenticados NÃO admin/financial.
    // Cron/service role não resolve para um user real (getUser retorna vazio) → PERMITE.
    // Nunca bloquear o cron.
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        // Token resolve para um usuário real → exigir admin/financial
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const userRoles = (roles || []).map((r: { role: string }) => r.role);
        if (!userRoles.includes("admin") && !userRoles.includes("financial")) {
          return new Response(
            JSON.stringify({ error: "Permissão negada. Requer admin ou financeiro." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // Sem user resolvível (service role/cron) → segue sem bloquear.
    }

    // Allow manual trigger with specific month/year or use current
    const body = await req.json().catch(() => ({}));
    const targetMonth = body.month || new Date().getMonth() + 1;
    const targetYear = body.year || new Date().getFullYear();
    const referenceMonth = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
    const manualContractId = body.contract_id || null;

    console.log(`[GEN-INVOICES] Execution ID: ${executionId}`);
    console.log(`[GEN-INVOICES] Gerando faturas para competência ${referenceMonth}${manualContractId ? ` (manual: ${manualContractId})` : ""}`);

    await logToDatabase(
      supabase,
      "info",
      "Billing",
      "generate-monthly-invoices",
      `Iniciando geração de faturas para ${referenceMonth}${manualContractId ? " (manual)" : ""}`,
      { reference_month: referenceMonth, contract_id: manualContractId },
      undefined,
      executionId
    );

    // Fetch active contracts with client info
    let contractsQuery = supabase
      .from("contracts")
      .select(`
        id,
        client_id,
        name,
        monthly_value,
        billing_day,
        days_before_due,
        payment_preference,
        billing_provider,
        nfse_enabled,
        notification_message,
        description,
        nfse_descricao_customizada,
        nfse_service_code,
        nfse_aliquota,
        nfse_iss_retido,
        first_billing_month,
        billing_frequency,
        end_date,
        clients (
          name,
          email,
          financial_email
        )
      `)
      .eq("status", "active")
      .gt("monthly_value", 0);

    // When contract_id is provided, filter to that specific contract
    if (manualContractId) {
      contractsQuery = contractsQuery.eq("id", manualContractId);
    }

    const { data: contracts, error: contractsError } = await contractsQuery;

    if (contractsError) {
      console.error("[GEN-INVOICES] Erro ao buscar contratos:", contractsError);
      
      await logToDatabase(
        supabase,
        "error",
        "Billing",
        "generate-monthly-invoices",
        "Erro ao buscar contratos ativos",
        { reference_month: referenceMonth },
        { message: contractsError.message, code: contractsError.code },
        executionId,
        Date.now() - startTime
      );

      const response: GenerationResponse = {
        success: false,
        message: `Erro ao buscar contratos: ${contractsError.message}`,
        timestamp: new Date().toISOString(),
        execution_id: executionId,
        reference_month: referenceMonth,
        stats: { total_contracts: 0, generated: 0, skipped: 0, failed: 0 },
        results: [],
        errors: [{
          contract_id: "",
          contract_name: "",
          code: contractsError.code || "DB_ERROR",
          message: contractsError.message,
          timestamp: new Date().toISOString(),
        }],
      };

      return new Response(JSON.stringify(response), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contracts || contracts.length === 0) {
      console.log("[GEN-INVOICES] Nenhum contrato ativo encontrado");
      
      await logToDatabase(
        supabase,
        "info",
        "Billing",
        "generate-monthly-invoices",
        "Nenhum contrato ativo encontrado",
        { reference_month: referenceMonth },
        undefined,
        executionId,
        Date.now() - startTime
      );

      const response: GenerationResponse = {
        success: true,
        message: "Nenhum contrato ativo encontrado",
        timestamp: new Date().toISOString(),
        execution_id: executionId,
        reference_month: referenceMonth,
        stats: { total_contracts: 0, generated: 0, skipped: 0, failed: 0 },
        results: [],
        errors: [],
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[GEN-INVOICES] ${contracts.length} contratos ativos encontrados`);

    let generated = 0;
    let skipped = 0;
    let failed = 0;
    const results: ContractResult[] = [];
    const errors: ExecutionError[] = [];

    // Check if billing provider is configured (Asaas only após migração 2026-05-07)
    const { data: asaasSettings } = await supabase
      .from("integration_settings")
      .select("is_active")
      .eq("integration_type", "asaas")
      .single();

    const asaasActive = asaasSettings?.is_active || false;

    for (const contract of contracts as unknown as Contract[]) {
      const contractStartTime = Date.now();

      try {
        // Check if invoice already exists for this contract and month.
        // Excluir só 'cancelled': alinhado ao enum invoice_status e ao índice
        // idx_invoices_contract_month_unique ('voided' não existe no enum e
        // fazia a query falhar com 22P02; o erro engolido cegava o dedup e o
        // gate de frequência — trimestrais cobrados todo mês até 2026-07-10).
        const { data: existingInvoice, error: existingError } = await supabase
          .from("invoices")
          .select("id")
          .eq("contract_id", contract.id)
          .eq("reference_month", referenceMonth)
          .neq("status", "cancelled")
          .limit(1);

        // Fail-closed: sem resposta confiável, não arriscar fatura duplicada.
        if (existingError) {
          throw new Error(`Dedup check falhou: ${existingError.message}`);
        }

        if (existingInvoice && existingInvoice.length > 0) {
          console.log(`[GEN-INVOICES] Fatura já existe para contrato ${contract.name} (${referenceMonth})`);
          skipped++;
          results.push({
            contract_id: contract.id,
            contract_name: contract.name,
            status: "skipped",
            invoice_id: existingInvoice[0].id,
            invoice_number: null,
            error: null,
            duration_ms: Date.now() - contractStartTime,
          });
          continue;
        }

        // End date guard (2026-05-07): protege contra contratos active com end_date
        // no passado (cenário: alguém esqueceu de mudar status para 'expired'/'cancelled').
        // Hoje todos os 31 contratos têm end_date NULL — esta guarda é preventiva.
        if (contract.end_date) {
          const endDate = new Date(contract.end_date);
          const today = new Date();
          today.setHours(0, 0, 0, 0); // comparar só por dia
          if (endDate < today) {
            console.log(`[GEN-INVOICES] Pulando ${contract.name}: end_date ${contract.end_date} no passado (status active mas vencido)`);
            await logToDatabase(
              supabase,
              "warn",
              "Billing",
              "generate-monthly-invoices",
              `Contrato ${contract.name} tem status='active' mas end_date no passado — pulado`,
              {
                contract_id: contract.id,
                contract_name: contract.name,
                end_date: contract.end_date,
                action_required: "Mudar status para 'cancelled'/'expired' em /contracts ou estender end_date",
              },
              null,
              executionId,
              0
            );
            skipped++;
            results.push({
              contract_id: contract.id,
              contract_name: contract.name,
              status: "skipped",
              invoice_id: null,
              invoice_number: null,
              error: null,
              duration_ms: Date.now() - contractStartTime,
            });
            continue;
          }
        }

        // Frequency check (PR-C 2026-05-07): se contrato não é mensal,
        // só gera se passou o intervalo desde a última invoice.
        // Default 'monthly' preserva comportamento anterior.
        const FREQUENCY_INTERVAL_MONTHS: Record<string, number> = {
          monthly: 1,
          bimonthly: 2,
          quarterly: 3,
          semiannual: 6,
          yearly: 12,
        };
        const frequency = contract.billing_frequency ?? "monthly";
        const intervalMonths = FREQUENCY_INTERVAL_MONTHS[frequency] ?? 1;

        if (intervalMonths > 1) {
          // Buscar última invoice deste contrato (qualquer mês)
          const { data: lastInvoiceRows, error: lastInvoiceError } = await supabase
            .from("invoices")
            .select("reference_month")
            .eq("contract_id", contract.id)
            .neq("status", "cancelled")
            .order("reference_month", { ascending: false })
            .limit(1);

          // Fail-closed: sem resposta confiável, não arriscar cobrança fora do ciclo.
          if (lastInvoiceError) {
            throw new Error(`Gate de frequência falhou: ${lastInvoiceError.message}`);
          }

          const lastReference = lastInvoiceRows?.[0]?.reference_month as string | undefined;

          if (lastReference) {
            // Calcular meses entre lastReference (YYYY-MM) e referenceMonth (YYYY-MM)
            const [lastY, lastM] = lastReference.split("-").map(Number);
            const [curY, curM] = referenceMonth.split("-").map(Number);
            const monthsSince = (curY - lastY) * 12 + (curM - lastM);

            if (monthsSince < intervalMonths) {
              console.log(`[GEN-INVOICES] Pulando ${contract.name} (frequência ${frequency}): última fatura em ${lastReference}, faltam ${intervalMonths - monthsSince} mês(es) para a próxima`);
              skipped++;
              results.push({
                contract_id: contract.id,
                contract_name: contract.name,
                status: "skipped",
                invoice_id: null,
                invoice_number: null,
                error: null,
                duration_ms: Date.now() - contractStartTime,
              });
              continue;
            }
          }
          // Se nunca gerou (lastReference undefined), permite gerar agora
        }

        // Calculate due date based on billing_day
        const billingDay = contract.billing_day || 10;
        let currentTargetMonth = targetMonth;
        let currentTargetYear = targetYear;
        let currentReferenceMonth = referenceMonth;

        const lastDayOfMonth = new Date(currentTargetYear, currentTargetMonth, 0).getDate();
        const actualBillingDay = Math.min(billingDay, lastDayOfMonth);
        let dueDate = `${currentReferenceMonth}-${String(actualBillingDay).padStart(2, "0")}`;

        // Check if due date is in the past — if so, advance to next month
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        if (dueDate < todayStr) {
          let nextMonth = currentTargetMonth + 1;
          let nextYear = currentTargetYear;
          if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
          }
          const nextReferenceMonth = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;

          console.log(`[GEN-INVOICES] Vencimento ${dueDate} já passou para ${contract.name}. Avançando para ${nextReferenceMonth}`);

          await logToDatabase(
            supabase,
            "info",
            "Billing",
            "generate-monthly-invoices",
            `Vencimento retroativo detectado para ${contract.name}. Fatura avançada para ${nextReferenceMonth}`,
            { contract_id: contract.id, original_due: dueDate, new_reference: nextReferenceMonth },
            undefined,
            executionId
          );

          // Check if invoice already exists for the next month
          const { data: nextExisting, error: nextExistingError } = await supabase
            .from("invoices")
            .select("id")
            .eq("contract_id", contract.id)
            .eq("reference_month", nextReferenceMonth)
            .neq("status", "cancelled")
            .limit(1);

          if (nextExistingError) {
            throw new Error(`Dedup check (competência avançada) falhou: ${nextExistingError.message}`);
          }

          if (nextExisting && nextExisting.length > 0) {
            console.log(`[GEN-INVOICES] Fatura já existe para ${contract.name} em ${nextReferenceMonth}, pulando`);
            skipped++;
            results.push({
              contract_id: contract.id,
              contract_name: contract.name,
              status: "skipped",
              invoice_id: nextExisting[0].id,
              invoice_number: null,
              error: null,
              duration_ms: Date.now() - contractStartTime,
            });
            continue;
          }

          // Recalculate for next month
          currentTargetMonth = nextMonth;
          currentTargetYear = nextYear;
          currentReferenceMonth = nextReferenceMonth;
          const nextLastDay = new Date(currentTargetYear, currentTargetMonth, 0).getDate();
          const nextActualBillingDay = Math.min(billingDay, nextLastDay);
          dueDate = `${currentReferenceMonth}-${String(nextActualBillingDay).padStart(2, "0")}`;
        }

        // ── Verificar first_billing_month ──
        if ((contract as Contract).first_billing_month && currentReferenceMonth < (contract as Contract).first_billing_month!) {
          console.log(
            `[GEN-INVOICES] Contrato ${contract.name}: faturamento inicia em ${(contract as Contract).first_billing_month}. Competência ${currentReferenceMonth} anterior, pulando.`
          );

          await logToDatabase(
            supabase,
            "info",
            "Billing",
            "generate-monthly-invoices",
            `Contrato ${contract.name} ainda não atingiu first_billing_month (${(contract as Contract).first_billing_month}). Competência: ${currentReferenceMonth}`,
            {
              contract_id: contract.id,
              first_billing_month: (contract as Contract).first_billing_month,
              reference_month: currentReferenceMonth,
            },
            undefined,
            executionId
          );

          skipped++;
          results.push({
            contract_id: contract.id,
            contract_name: contract.name,
            status: "skipped",
            invoice_id: null,
            invoice_number: null,
            error: null,
            duration_ms: Date.now() - contractStartTime,
          });
          continue;
        }

        // ── Verificar janela de geração antecipada (days_before_due) ──
        if (!manualContractId) {
          const daysBeforeDue = contract.days_before_due ?? 5;
          const dueDateObj = new Date(dueDate + "T12:00:00");
          const generateAfterDate = new Date(dueDateObj);
          generateAfterDate.setDate(generateAfterDate.getDate() - daysBeforeDue);

          const todayDate = new Date();
          todayDate.setHours(12, 0, 0, 0);

          if (todayDate < generateAfterDate) {
            const generateAfterStr = generateAfterDate.toISOString().split("T")[0];
            console.log(
              `[GEN-INVOICES] Contrato ${contract.name}: vencimento ${dueDate}, geração a partir de ${generateAfterStr}. Fora da janela, pulando.`
            );

            await logToDatabase(
              supabase,
              "info",
              "Billing",
              "generate-monthly-invoices",
              `Contrato ${contract.name} fora da janela de geração (days_before_due=${daysBeforeDue}). Vencimento: ${dueDate}, geração a partir de: ${generateAfterStr}`,
              {
                contract_id: contract.id,
                due_date: dueDate,
                generate_after: generateAfterStr,
                days_before_due: daysBeforeDue,
              },
              undefined,
              executionId
            );

            skipped++;
            results.push({
              contract_id: contract.id,
              contract_name: contract.name,
              status: "skipped",
              invoice_id: null,
              invoice_number: null,
              error: null,
              duration_ms: Date.now() - contractStartTime,
            });
            continue;
          }
        }

        // Fetch additional charges for this contract and month
        const { data: additionalCharges } = await supabase
          .from("contract_additional_charges")
          .select("id, description, amount")
          .eq("contract_id", contract.id)
          .eq("reference_month", currentReferenceMonth)
          .eq("applied", false);

        const charges = (additionalCharges || []) as AdditionalCharge[];
        const additionalTotal = charges.reduce((sum, c) => sum + c.amount, 0);
        // FIX cobrança por frequência: o valor recorrente do contrato é MENSAL.
        // Para frequências > mensal (bimonthly=2, quarterly=3, semiannual=6, yearly=12),
        // a fatura cobre `intervalMonths` meses de uma vez, então o valor recorrente
        // é multiplicado pelo intervalo. Charges adicionais NÃO multiplicam (têm valor
        // próprio por competência). Antes: cobrava só 1 mês mesmo em contrato trimestral.
        const recurringAmount = contract.monthly_value * intervalMonths;
        const totalAmount = recurringAmount + additionalTotal;

        // Descrição da competência cobrada (período, quando > 1 mês)
        const periodoLabel = intervalMonths > 1
          ? `${intervalMonths} meses (${frequency})`
          : "mensal";

        // Build invoice notes with contract info and additional charges
        let invoiceNotes = `Fatura ${periodoLabel} - Contrato: ${contract.name} - Competência: ${currentReferenceMonth}`;
        if (intervalMonths > 1) {
          invoiceNotes += `\nValor recorrente: ${intervalMonths}x R$ ${contract.monthly_value.toFixed(2)} = R$ ${recurringAmount.toFixed(2)}`;
        }
        if (charges.length > 0) {
          invoiceNotes += `\n\nValores adicionais:`;
          for (const charge of charges) {
            invoiceNotes += `\n- ${charge.description}: R$ ${charge.amount.toFixed(2)}`;
          }
        }

        // Create the invoice with reference_month and billing_provider
        const { data: newInvoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            client_id: contract.client_id,
            contract_id: contract.id,
            amount: totalAmount,
            due_date: dueDate,
            reference_month: currentReferenceMonth,
            status: "pending",
            payment_method: contract.payment_preference || "boleto",
            notes: invoiceNotes,
            auto_payment_generated: false,
            billing_provider: contract.billing_provider || null,
          })
          .select("id, invoice_number")
          .single();

        if (invoiceError) {
          console.error(`[GEN-INVOICES] Erro ao criar fatura para ${contract.name}:`, invoiceError);
          failed++;
          results.push({
            contract_id: contract.id,
            contract_name: contract.name,
            status: "error",
            invoice_id: null,
            invoice_number: null,
            error: invoiceError.message,
            duration_ms: Date.now() - contractStartTime,
          });
          errors.push({
            contract_id: contract.id,
            contract_name: contract.name,
            code: invoiceError.code || "INSERT_ERROR",
            message: invoiceError.message,
            timestamp: new Date().toISOString(),
          });

          // Log the failure
          await supabase.from("invoice_generation_log").insert({
            contract_id: contract.id,
            reference_month: currentReferenceMonth,
            status: "error",
            error_message: invoiceError.message,
          });

          continue;
        }

        console.log(`[GEN-INVOICES] Fatura #${newInvoice.invoice_number} criada para ${contract.name} - R$ ${totalAmount.toFixed(2)}`);
        generated++;
        results.push({
          contract_id: contract.id,
          contract_name: contract.name,
          status: "created",
          invoice_id: newInvoice.id,
          invoice_number: newInvoice.invoice_number,
          error: null,
          duration_ms: Date.now() - contractStartTime,
        });

        // Mark additional charges as applied
        if (charges.length > 0) {
          await supabase
            .from("contract_additional_charges")
            .update({
              applied: true,
              applied_invoice_id: newInvoice.id,
            })
            .in("id", charges.map((c) => c.id));

          console.log(`[GEN-INVOICES] ${charges.length} cobranças adicionais vinculadas à fatura`);
        }

        // Generate invoice_items from contract_services (Review 1.2)
        try {
          const { data: services } = await supabase
            .from("contract_services")
            .select("name, description, quantity, unit_value, value")
            .eq("contract_id", contract.id);

          if (services && services.length > 0) {
            const items = services.map((s: Record<string, unknown>) => ({
              invoice_id: newInvoice.id,
              description: (s.description as string) || (s.name as string) || "Serviço",
              quantity: (s.quantity as number) || 1,
              unit_value: (s.unit_value as number) || (s.value as number) || 0,
              total_value: (s.value as number) || 0,
            }));
            await supabase.from("invoice_items").insert(items);
            console.log(`[GEN-INVOICES] ${items.length} invoice_items criados a partir de contract_services`);
          }
        } catch (itemsError) {
          console.error(`[GEN-INVOICES] Erro ao criar invoice_items para ${contract.name}:`, itemsError);
        }

        // Log success
        await supabase.from("invoice_generation_log").insert({
          contract_id: contract.id,
          invoice_id: newInvoice.id,
          reference_month: currentReferenceMonth,
          status: "success",
        });

        // Auto-generate payment - SEMPRE via Asaas (migração 2026-05-07)
        // Banco Inter desativado: não usar mais. Boletos Inter legados continuam
        // ativos até liquidarem (webhook-banco-inter mantém-se funcional para receber
        // PAYMENT_CONFIRMED dos boletos já emitidos antes desta migração).
        const provider = "asaas" as const;
        const providerActive = asaasActive;

        if (providerActive && contract.payment_preference) {
          const paymentTypes = contract.payment_preference === "both"
            ? ["boleto", "pix"]
            : [contract.payment_preference];
          let lastPaymentType: string | null = null;

          try {
            for (const paymentType of paymentTypes) {
              lastPaymentType = paymentType;
              console.log(`[GEN-INVOICES] Gerando ${paymentType} via ${provider} para fatura #${newInvoice.invoice_number}`);

              const invokeResult = provider === "asaas"
                ? await supabase.functions.invoke("asaas-nfse", {
                    body: {
                      action: "create_payment",
                      invoice_id: newInvoice.id,
                      billing_type: paymentType === "pix" ? "PIX" : "BOLETO",
                    },
                  })
                : await supabase.functions.invoke("banco-inter", {
                    body: {
                      invoice_id: newInvoice.id,
                      payment_type: paymentType,
                    },
                  });

              if (invokeResult.error) {
                const realMsg = await extractInvokeErrorMsg(
                  invokeResult.error,
                  invokeResult.error.message || JSON.stringify(invokeResult.error),
                );
                throw new Error(
                  `Erro ao gerar ${paymentType} via ${provider}: ${realMsg}`
                );
              }

              const responseData = invokeResult.data as unknown as Record<string, unknown> | null;
              if (responseData?.error) {
                throw new Error(
                  `Provedor ${provider} retornou erro: ${String(responseData.error)}`
                );
              }
            }

            // Update invoice to mark payment as generated - NÃO sobrescrever boleto_status
            // O status correto é definido pela função banco-inter/asaas baseado no resultado real
            await supabase
              .from("invoices")
              .update({
                auto_payment_generated: true,
              })
              .eq("id", newInvoice.id);

            console.log(`[GEN-INVOICES] Pagamento gerado para fatura #${newInvoice.invoice_number} (status definido pelo provedor)`);
          } catch (paymentError) {
            const errMsg = paymentError instanceof Error ? paymentError.message : "Erro ao gerar pagamento";
            console.error(`[GEN-INVOICES] Erro ao gerar ${lastPaymentType ?? "pagamento"} para ${contract.name}:`, paymentError);

            if (lastPaymentType === "boleto" || lastPaymentType === null) {
              // Falha ao gerar boleto (ou catch antes do loop iniciar): marcar campo correto
              await supabase
                .from("invoices")
                .update({
                  boleto_status: "erro",
                  boleto_error_msg: errMsg,
                })
                .eq("id", newInvoice.id);
            } else if (lastPaymentType === "pix") {
              // Falha de PIX: NÃO tocar em boleto_status (boleto da iter anterior pode estar OK).
              // Registrar em application_logs (sem alterar schema, sem sobrescrever notes do Inter).
              await supabase.from("application_logs").insert({
                module: "billing",
                level: "error",
                message: `Falha ao gerar PIX para fatura #${newInvoice.invoice_number}`,
                context: {
                  invoice_id: newInvoice.id,
                  invoice_number: newInvoice.invoice_number,
                  contract_id: contract.id,
                  contract_name: contract.name,
                  payment_type: "pix",
                  error_message: errMsg,
                  execution_id: executionId,
                },
              });
              console.warn(`[GEN-INVOICES] PIX falhou para fatura #${newInvoice.invoice_number}, boleto preservado: ${errMsg}`);
            }
          }
        } else if (!providerActive && contract.payment_preference) {
          // Asaas inativo mas contrato pede cobrança: dar visibilidade em vez de fatura "muda".
          const inactiveMsg = "Provedor de cobrança (Asaas) inativo — nenhum boleto/PIX foi gerado. Ative a integração Asaas e regenere a cobrança.";
          console.warn(`[GEN-INVOICES] ${inactiveMsg} (fatura #${newInvoice.invoice_number})`);
          await supabase
            .from("invoices")
            .update({ boleto_status: "erro", boleto_error_msg: inactiveMsg })
            .eq("id", newInvoice.id);
        }

        // Auto-emit NFS-e if contract has nfse_enabled.
        // holdForNfse: quando a NFS-e é emitida OK (agendada no Asaas), o e-mail de
        // fatura NÃO é enviado agora — sai UM e-mail consolidado (boleto + nota) quando
        // a NFS-e autorizar (via webhook-asaas-nfse ou poll-services). Fallback: se a
        // nota falhar/demorar, poll-services libera o boleto por resend-payment-notification.
        let holdForNfse = false;
        if (contract.nfse_enabled) {
          // ── Validar alíquota ISS antes de emitir NFS-e ──
          if (!contract.nfse_aliquota || contract.nfse_aliquota <= 0) {
            const aliquotaErrorMsg = `Alíquota ISS não configurada no contrato "${contract.name}" (valor atual: ${contract.nfse_aliquota ?? "null"}). Configure em Contratos > Editar antes de emitir NFS-e.`;
            console.error(`[GEN-INVOICES] ${aliquotaErrorMsg}`);

            await supabase
              .from("invoices")
              .update({
                nfse_status: "erro",
                nfse_error_msg: aliquotaErrorMsg,
              })
              .eq("id", newInvoice.id);

            await logToDatabase(
              supabase,
              "error",
              "Nfse",
              "validate-aliquota",
              aliquotaErrorMsg,
              { contract_id: contract.id, invoice_id: newInvoice.id, nfse_aliquota: contract.nfse_aliquota },
              { message: aliquotaErrorMsg, code: "MISSING_ISS_RATE" },
              executionId
            );
          } else {
          try {
            const serviceDescription = contract.nfse_descricao_customizada
              || contract.description
              || `Prestação de serviços - ${contract.name}`;

            const { data: nfseResult, error: nfseError } = await supabase.functions.invoke("asaas-nfse", {
              body: {
                action: "emit",
                client_id: contract.client_id,
                invoice_id: newInvoice.id,
                contract_id: contract.id,
                value: totalAmount,
                service_description: serviceDescription,
                municipal_service_code: contract.nfse_service_code || undefined,
                iss_rate: contract.nfse_aliquota || 0,
                retain_iss: contract.nfse_iss_retido || false,
              },
            });

            if (nfseError) {
              console.error(`[GEN-INVOICES] Erro ao emitir NFS-e para ${contract.name}:`, nfseError);

              const nfseRealMsg = await extractInvokeErrorMsg(nfseError, "Erro ao emitir NFS-e");

              // Record NFS-e error in invoice status
              await supabase
                .from("invoices")
                .update({
                  nfse_status: "erro",
                  nfse_error_msg: nfseRealMsg,
                })
                .eq("id", newInvoice.id);
            } else {
              const nfseSuccess = nfseResult?.success === true;
              console.log(`[GEN-INVOICES] NFS-e emitida para fatura #${newInvoice.invoice_number}:`, nfseSuccess ? "OK" : nfseResult?.error || "sem resposta");

              // NFS-e agendada com sucesso → segurar o e-mail para envio consolidado.
              if (nfseSuccess) holdForNfse = true;

              // Só gravar em erro. Em sucesso NÃO reescrever: o asaas-nfse já pode
              // ter avançado nfse_status (ex.: 'gerada'); "pendente" rebaixaria.
              if (!nfseSuccess) {
                await supabase
                  .from("invoices")
                  .update({
                    nfse_status: "erro",
                    nfse_error_msg: nfseResult?.error || "Resposta inesperada da API NFS-e",
                  })
                  .eq("id", newInvoice.id);
              }
            }
          } catch (nfseErr) {
            console.error(`[GEN-INVOICES] Exceção ao emitir NFS-e para ${contract.name}:`, nfseErr);

            // Record NFS-e exception in invoice status
            await supabase
              .from("invoices")
              .update({
                nfse_status: "erro",
                nfse_error_msg: nfseErr instanceof Error ? nfseErr.message : "Exceção ao emitir NFS-e",
              })
              .eq("id", newInvoice.id);
          }
          } // end else (alíquota válida)
        }

        // Send notification to client if email is available
        const clientEmail = contract.clients?.financial_email || contract.clients?.email;
        if (clientEmail && holdForNfse) {
          // E-mail retido: sairá UM e-mail consolidado (boleto + nota) quando a NFS-e
          // autorizar (webhook-asaas-nfse / poll-services). Evita 2 e-mails separados.
          await supabase.from("invoices").update({
            email_status: "aguardando_nfse",
            email_error_msg: null,
          }).eq("id", newInvoice.id);
          console.log(`[GEN-INVOICES] E-mail retido (aguardando NFS-e) p/ fatura #${newInvoice.invoice_number}`);
        } else if (clientEmail) {
          try {
            const { data: resendSettings } = await supabase
              .from("integration_settings")
              .select("is_active")
              .eq("integration_type", "resend")
              .maybeSingle();

            if (!resendSettings?.is_active) {
              // Fail-loud: sem Resend ativo, dar visibilidade em vez de pular em silêncio.
              console.error(`[GEN-INVOICES] Integração Resend inativa/ausente — e-mail pulado para ${clientEmail}`);
              await supabase.from("invoices").update({
                email_status: "erro",
                email_error_msg: "Integração Resend inativa/ausente",
              }).eq("id", newInvoice.id);
            } else {
              const emailSettings = await getEmailSettings(supabase);
              // Re-fetch invoice to get boleto data (may have been set by banco-inter/asaas)
              const { data: updatedInvoice } = await supabase
                .from("invoices")
                .select("boleto_url, boleto_barcode, pix_code")
                .eq("id", newInvoice.id)
                .single();

              // Generate signed URL for boleto PDF if available
              let boletoSignedUrl = "";
              if (updatedInvoice?.boleto_url) {
                const storedPath = updatedInvoice.boleto_url;
                if (!storedPath.startsWith("http")) {
                  const bucketName = storedPath.startsWith("invoice-documents/") ? "invoice-documents" : "nfse-files";
                  const objectPath = storedPath.startsWith("invoice-documents/") 
                    ? storedPath.replace("invoice-documents/", "") 
                    : storedPath;
                  const { data: signedData } = await supabase.storage
                    .from(bucketName)
                    .createSignedUrl(objectPath, 604800); // 7 dias
                  boletoSignedUrl = signedData?.signedUrl || "";
                } else {
                  boletoSignedUrl = storedPath;
                }
              }

              // Fetch NFS-e number for {nota} variable (only if contract has a custom message)
              let nfseNumber = "Pendente";
              if (contract.notification_message) {
                try {
                  const { data: nfseData } = await supabase
                    .from("nfse_history")
                    .select("numero_nfse")
                    .eq("invoice_id", newInvoice.id)
                    .eq("status", "autorizada")
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();
                  if (nfseData?.numero_nfse) {
                    nfseNumber = String(nfseData.numero_nfse);
                  }
                } catch (nfseQueryErr) {
                  console.error("[GEN-INVOICES] Erro ao buscar NFS-e para variável {nota}:", nfseQueryErr);
                }
              }

              // Build payment section for email (fonte única: buildPaymentSectionHtml)
              const paymentSection = buildPaymentSectionHtml({
                boletoUrl: boletoSignedUrl,
                boletoBarcode: updatedInvoice?.boleto_barcode,
                pixCode: updatedInvoice?.pix_code,
              });

              const contentHtml = `
                    <h2>Nova Fatura Disponível</h2>
                    <p>Olá,</p>
                    <p>Uma nova fatura foi gerada para o contrato <strong>${contract.name}</strong>.</p>
                    <table style="border-collapse: collapse; margin: 20px 0;">
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Número:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">#${newInvoice.invoice_number}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Competência:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${referenceMonth}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Valor:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${formatCurrencyBRL(totalAmount)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px; border: 1px solid #ddd;"><strong>Vencimento:</strong></td>
                        <td style="padding: 8px; border: 1px solid #ddd;">${new Date(dueDate).toLocaleDateString("pt-BR")}</td>
                      </tr>
                    </table>
                    ${paymentSection || "<p>Em breve você receberá os dados para pagamento.</p>"}
                  `;

              // Envolve com o layout da empresa (logo/cores/footer). {competencia} não é
              // suportado por applyNotificationMessage, então é pré-substituído aqui.
              let emailHtml = wrapInEmailLayout(contentHtml, emailSettings);
              const notifMsg = contract.notification_message
                ? contract.notification_message.replace(/{competencia}/g, referenceMonth)
                : null;
              emailHtml = applyNotificationMessage(emailHtml, notifMsg, {
                cliente: contract.clients?.name || "Cliente",
                valor: formatCurrencyBRL(totalAmount),
                vencimento: new Date(dueDate).toLocaleDateString("pt-BR"),
                fatura: `#${newInvoice.invoice_number}`,
                contrato: contract.name,
                nota: nfseNumber,
                boleto: boletoSignedUrl || "",
                pix: updatedInvoice?.pix_code || "",
              });

              const { data: emailRes, error: emailErr } = await supabase.functions.invoke("send-email-resend", {
                body: {
                  to: clientEmail,
                  subject: `Nova Fatura #${newInvoice.invoice_number} - ${referenceMonth}`,
                  related_type: "invoice",
                  related_id: newInvoice.id,
                  user_id: contract.client_id,
                  html: emailHtml,
                },
              });

              const emailOk = !emailErr && emailRes?.success === true;
              const emailErrMsg = emailErr?.message || emailRes?.error || null;

              if (emailOk) {
                console.log(`[GEN-INVOICES] Email enviado para ${clientEmail}`);
                await supabase.from("invoices").update({
                  email_status: "enviado",
                  email_sent_at: new Date().toISOString(),
                  email_error_msg: null,
                }).eq("id", newInvoice.id);
              } else {
                console.error(`[GEN-INVOICES] Falha email ${clientEmail}: ${emailErrMsg}`);
                await supabase.from("invoices").update({
                  email_status: "erro",
                  email_error_msg: String(emailErrMsg || "Falha desconhecida").slice(0, 500),
                }).eq("id", newInvoice.id);
              }

              await supabase.from("invoice_notification_logs").insert({
                invoice_id: newInvoice.id,
                notification_type: "invoice_created",
                channel: "email",
                recipient: clientEmail,
                success: emailOk,
                error_message: emailOk ? null : String(emailErrMsg || "").slice(0, 1000),
                sent_at: new Date().toISOString(),
              });
            }
          } catch (emailError) {
            console.error(`[GEN-INVOICES] Erro ao enviar email para ${clientEmail}:`, emailError);
            const msg = emailError instanceof Error ? emailError.message : "Erro ao enviar email";
            await supabase.from("invoices").update({
              email_status: "erro",
              email_error_msg: msg.slice(0, 500),
            }).eq("id", newInvoice.id);
            await supabase.from("invoice_notification_logs").insert({
              invoice_id: newInvoice.id,
              notification_type: "invoice_created",
              channel: "email",
              recipient: clientEmail,
              success: false,
              error_message: msg.slice(0, 1000),
              sent_at: new Date().toISOString(),
            });
          }
        }

        // Create notification for staff
        const { data: staffUsers } = await supabase
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "financial"]);

        if (staffUsers && staffUsers.length > 0) {
          const notifications = staffUsers.map((user) => ({
            user_id: user.user_id,
            type: "info",
            title: "Fatura Gerada Automaticamente",
            message: `Fatura #${newInvoice.invoice_number} gerada para ${contract.clients?.name || contract.name} - R$ ${totalAmount.toFixed(2)}${charges.length > 0 ? ` (inclui ${charges.length} adicional(is))` : ""}`,
            related_type: "invoice",
            related_id: newInvoice.id,
          }));

          await supabase.from("notifications").insert(notifications);
        }
      } catch (contractError) {
        console.error(`[GEN-INVOICES] Erro ao processar contrato ${contract.name}:`, contractError);
        failed++;
        results.push({
          contract_id: contract.id,
          contract_name: contract.name,
          status: "error",
          invoice_id: null,
          invoice_number: null,
          error: contractError instanceof Error ? contractError.message : "Erro desconhecido",
          duration_ms: Date.now() - contractStartTime,
        });
        errors.push({
          contract_id: contract.id,
          contract_name: contract.name,
          code: "PROCESSING_ERROR",
          message: contractError instanceof Error ? contractError.message : "Erro desconhecido",
          timestamp: new Date().toISOString(),
        });
      }
    }

    // ============ RETRY: Re-emitir NFS-e para faturas com erro no mês corrente ============
    let nfseRetried = 0;
    try {
      // Incluir TODAS as faturas com NFS-e em erro (contratos E avulsas)
      const { data: failedNfseInvoices } = await supabase
        .from("invoices")
        .select("id, client_id, contract_id, amount, invoice_number")
        .eq("reference_month", referenceMonth)
        .eq("nfse_status", "erro");

      if (failedNfseInvoices && failedNfseInvoices.length > 0) {
        console.log(`[GEN-INVOICES] RETRY: ${failedNfseInvoices.length} fatura(s) com NFS-e em erro para reprocessar`);

        for (const inv of failedNfseInvoices) {
          try {
            let serviceDescription: string | undefined;
            let serviceCode: string | undefined;

            if (inv.contract_id) {
              // Faturas de contrato: buscar código de serviço do contrato
              const { data: retryContract } = await supabase
                .from("contracts")
                .select("nfse_service_code, nfse_descricao_customizada, description, name, nfse_enabled, nfse_aliquota, nfse_iss_retido")
                .eq("id", inv.contract_id)
                .single();

              if (!retryContract?.nfse_enabled) {
                console.log(`[GEN-INVOICES] RETRY: Contrato ${inv.contract_id} não tem NFS-e habilitada, pulando`);
                continue;
              }

              serviceDescription = retryContract.nfse_descricao_customizada
                || retryContract.description
                || `Prestação de serviços - ${retryContract.name}`;
              serviceCode = retryContract.nfse_service_code || undefined;
            } else {
              // Faturas avulsas: buscar código do nfse_history (codigo_tributacao)
              const { data: lastHistory } = await supabase
                .from("nfse_history")
                .select("codigo_tributacao, descricao_servico")
                .eq("invoice_id", inv.id)
                .eq("status", "erro")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              serviceCode = lastHistory?.codigo_tributacao || undefined;
              serviceDescription = lastHistory?.descricao_servico || "Serviços de TI";
            }

            // Marcar nfse_history antigos sem asaas_invoice_id como 'substituida'
            await supabase
              .from("nfse_history")
              .update({ status: "substituida", updated_at: new Date().toISOString() })
              .eq("invoice_id", inv.id)
              .is("asaas_invoice_id", null)
              .eq("status", "erro");

            // Reemitir (o auto-resolve da asaas-nfse cuida do código caso não tenha)
            // Buscar aliquota/iss_retido do contrato para retry
            let retryIssRate = 0;
            let retryRetainIss = false;
            if (inv.contract_id) {
              const { data: retryContractTax } = await supabase
                .from("contracts")
                .select("nfse_aliquota, nfse_iss_retido")
                .eq("id", inv.contract_id)
                .single();
              retryIssRate = retryContractTax?.nfse_aliquota || 0;
              retryRetainIss = retryContractTax?.nfse_iss_retido || false;
            }

            const { error: retryError } = await supabase.functions.invoke("asaas-nfse", {
              body: {
                action: inv.contract_id ? "emit" : "emit_standalone",
                client_id: inv.client_id,
                invoice_id: inv.id,
                contract_id: inv.contract_id || undefined,
                value: inv.amount,
                service_description: serviceDescription,
                municipal_service_code: serviceCode,
                service_code: serviceCode,
                iss_rate: retryIssRate,
                retain_iss: retryRetainIss,
              },
            });

            if (!retryError) {
              await supabase
                .from("invoices")
                .update({ nfse_status: "pendente", nfse_error_msg: null })
                .eq("id", inv.id);
              nfseRetried++;
              console.log(`[GEN-INVOICES] RETRY: NFS-e reemitida para fatura #${inv.invoice_number}${inv.contract_id ? '' : ' (avulsa)'}`);
            } else {
              console.error(`[GEN-INVOICES] RETRY: Erro ao reemitir NFS-e para fatura #${inv.invoice_number}:`, retryError);
            }
          } catch (retryErr) {
            console.error(`[GEN-INVOICES] RETRY: Exceção ao reprocessar fatura ${inv.id}:`, retryErr);
          }
        }

        console.log(`[GEN-INVOICES] RETRY: ${nfseRetried} NFS-e(s) reemitida(s) com sucesso`);
      }
    } catch (retryBlockError) {
      console.error("[GEN-INVOICES] RETRY: Erro no bloco de retry:", retryBlockError);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[GEN-INVOICES] Concluído - Geradas: ${generated}, Ignoradas: ${skipped}, Falhas: ${failed}, NFS-e Retry: ${nfseRetried}`);

    // Log final result
    await logToDatabase(
      supabase,
      failed > 0 ? "warn" : "info",
      "Billing",
      "generate-monthly-invoices",
      `Geração concluída: ${generated} criadas, ${skipped} ignoradas, ${failed} falhas`,
      {
        reference_month: referenceMonth,
        total_contracts: contracts.length,
        generated,
        skipped,
        failed,
      },
      failed > 0 ? { errors } : undefined,
      executionId,
      totalDuration
    );

    const response: GenerationResponse = {
      success: failed === 0,
      message: `Geração de faturas concluída para ${referenceMonth}`,
      timestamp: new Date().toISOString(),
      execution_id: executionId,
      reference_month: referenceMonth,
      stats: {
        total_contracts: contracts.length,
        generated,
        skipped,
        failed,
      },
      results,
      errors,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[GEN-INVOICES] Erro geral:", error);
    
    const response: GenerationResponse = {
      success: false,
      message: error instanceof Error ? error.message : "Erro interno",
      timestamp: new Date().toISOString(),
      execution_id: executionId,
      reference_month: "",
      stats: { total_contracts: 0, generated: 0, skipped: 0, failed: 0 },
      results: [],
      errors: [{
        contract_id: "",
        contract_name: "",
        code: "GENERAL_ERROR",
        message: error instanceof Error ? error.message : "Erro interno",
        timestamp: new Date().toISOString(),
      }],
    };

    return new Response(JSON.stringify(response), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
