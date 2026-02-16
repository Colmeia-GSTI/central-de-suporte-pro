/**
 * Invoice Validation Rules
 * Comprehensive validation for invoice creation and updates
 */

import { z } from "zod";

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface InvoiceValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface InvoiceItemData {
  description: string;
  quantity: number;
  unit_value: number;
  total_value: number;
}

export interface InvoiceData {
  client_id: string;
  contract_id?: string;
  amount: number;
  due_date: string;
  items?: InvoiceItemData[];
  billing_provider?: "banco_inter" | "asaas" | "default";
  notes?: string;
}

export interface ClientData {
  name: string;
  document: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

// Zod Schemas
export const invoiceItemSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória").max(255),
  quantity: z.number().min(1, "Quantidade deve ser maior que zero"),
  unit_value: z.number().min(0.01, "Valor unitário deve ser maior que zero"),
  total_value: z.number().min(0.01, "Valor total deve ser maior que zero"),
});

export const invoiceDataSchema = z.object({
  client_id: z.string().min(1, "ID do cliente é obrigatório"),
  contract_id: z.string().optional(),
  amount: z
    .number()
    .min(0.01, "Valor deve ser maior que zero")
    .max(999999999.99, "Valor excede o limite máximo"),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  items: z.array(invoiceItemSchema).optional(),
  billing_provider: z.enum(["banco_inter", "asaas", "default"]).optional(),
  notes: z.string().optional(),
});

export type InvoiceFormData = z.infer<typeof invoiceDataSchema>;

/**
 * Validates amount value
 */
export function validateAmount(amount: number): ValidationError[] {
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
export function validateDueDate(
  dueDate: string | Date
): ValidationError[] & ValidationWarning[] {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!dueDate) {
    errors.push({
      field: "due_date",
      message: "Data de vencimento é obrigatória",
      code: "DUE_DATE_REQUIRED",
    });
    return errors;
  }

  const date = typeof dueDate === "string" ? new Date(dueDate) : dueDate;

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
  } else if (date < today) {
    // Already covered above, but keeping for clarity
  } else {
    // Check if date is too far in the future (more than 180 days)
    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + 180);

    if (date > maxDate) {
      warnings.push({
        field: "due_date",
        message:
          "Data de vencimento é mais de 6 meses no futuro (aviso de conformidade)",
      });
    }
  }

  return [...errors, ...warnings];
}

/**
 * Validates invoice items
 */
export function validateInvoiceItems(
  items: InvoiceItemData[] | undefined,
  totalAmount: number
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!items || items.length === 0) {
    // Items are optional, but if provided, must have at least one
    return errors;
  }

  let itemsSum = 0;

  items.forEach((item, index) => {
    // Validate description
    if (!item.description || item.description.trim().length === 0) {
      errors.push({
        field: `items[${index}].description`,
        message: "Descrição do item é obrigatória",
        code: "ITEM_DESCRIPTION_REQUIRED",
      });
    } else if (item.description.length > 255) {
      errors.push({
        field: `items[${index}].description`,
        message: "Descrição do item não pode exceder 255 caracteres",
        code: "ITEM_DESCRIPTION_TOO_LONG",
      });
    }

    // Validate quantity
    if (item.quantity <= 0) {
      errors.push({
        field: `items[${index}].quantity`,
        message: "Quantidade deve ser maior que zero",
        code: "ITEM_QUANTITY_INVALID",
      });
    }

    // Validate unit_value
    if (item.unit_value <= 0) {
      errors.push({
        field: `items[${index}].unit_value`,
        message: "Valor unitário deve ser maior que zero",
        code: "ITEM_UNIT_VALUE_INVALID",
      });
    }

    // Validate total_value matches quantity * unit_value
    const expectedTotal = item.quantity * item.unit_value;
    if (Math.abs(item.total_value - expectedTotal) > 0.01) {
      errors.push({
        field: `items[${index}].total_value`,
        message: `Valor total deve ser quantidade (${item.quantity}) × valor unitário (${item.unit_value.toFixed(2)}) = ${expectedTotal.toFixed(2)}`,
        code: "ITEM_TOTAL_MISMATCH",
      });
    }

    itemsSum += item.total_value;
  });

  // Validate sum of items matches invoice amount
  if (items.length > 0 && Math.abs(itemsSum - totalAmount) > 0.01) {
    errors.push({
      field: "items",
      message: `Soma dos itens (${itemsSum.toFixed(2)}) deve corresponder ao valor total da fatura (${totalAmount.toFixed(2)})`,
      code: "ITEMS_SUM_MISMATCH",
    });
  }

  return errors;
}

/**
 * Validates client data
 */
export function validateClientData(
  client: ClientData | null | undefined
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!client) {
    errors.push({
      field: "client",
      message: "Dados do cliente são obrigatórios",
      code: "CLIENT_REQUIRED",
    });
    return errors;
  }

  // Validate name
  if (!client.name || client.name.trim().length === 0) {
    errors.push({
      field: "client.name",
      message: "Nome do cliente é obrigatório",
      code: "CLIENT_NAME_REQUIRED",
    });
  }

  // Validate document (CNPJ/CPF)
  if (!client.document) {
    errors.push({
      field: "client.document",
      message: "CNPJ/CPF do cliente é obrigatório",
      code: "CLIENT_DOCUMENT_REQUIRED",
    });
  } else {
    const cleanDoc = client.document.replace(/\D/g, "");
    if (cleanDoc.length === 0) {
      errors.push({
        field: "client.document",
        message: "CNPJ/CPF inválido",
        code: "CLIENT_DOCUMENT_INVALID",
      });
    }
  }

  // Validate email
  if (!client.email || client.email.trim().length === 0) {
    errors.push({
      field: "client.email",
      message: "Email do cliente é obrigatório",
      code: "CLIENT_EMAIL_REQUIRED",
    });
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(client.email)) {
      errors.push({
        field: "client.email",
        message: "Email do cliente é inválido",
        code: "CLIENT_EMAIL_INVALID",
      });
    }
  }

  // Validate address fields for NFSe compliance
  if (!client.address || client.address.trim().length === 0) {
    errors.push({
      field: "client.address",
      message: "Endereço do cliente é obrigatório",
      code: "CLIENT_ADDRESS_REQUIRED",
    });
  }

  if (!client.city || client.city.trim().length === 0) {
    errors.push({
      field: "client.city",
      message: "Cidade do cliente é obrigatória",
      code: "CLIENT_CITY_REQUIRED",
    });
  }

  if (!client.state || client.state.trim().length === 0) {
    errors.push({
      field: "client.state",
      message: "Estado do cliente é obrigatório",
      code: "CLIENT_STATE_REQUIRED",
    });
  }

  if (!client.zip_code || client.zip_code.trim().length === 0) {
    errors.push({
      field: "client.zip_code",
      message: "CEP do cliente é obrigatório",
      code: "CLIENT_ZIP_CODE_REQUIRED",
    });
  }

  return errors;
}

/**
 * Main validation function
 */
export function validateInvoiceData(
  invoice: InvoiceData,
  client?: ClientData | null
): InvoiceValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Validate amount
  errors.push(...validateAmount(invoice.amount));

  // Validate due date
  const dueDateValidation = validateDueDate(invoice.due_date);
  dueDateValidation.forEach((issue) => {
    if ("code" in issue) {
      errors.push(issue as ValidationError);
    } else {
      warnings.push(issue as ValidationWarning);
    }
  });

  // Validate items if provided
  if (invoice.items && invoice.items.length > 0) {
    errors.push(...validateInvoiceItems(invoice.items, invoice.amount));
  }

  // Validate client if provided
  if (client) {
    errors.push(...validateClientData(client));
  }

  // Validate billing provider
  if (
    invoice.billing_provider &&
    !["banco_inter", "asaas", "default"].includes(invoice.billing_provider)
  ) {
    errors.push({
      field: "billing_provider",
      message: "Provedor de faturamento inválido",
      code: "PROVIDER_INVALID",
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates using Zod schema (for form validation)
 */
export function validateInvoiceWithZod(data: unknown) {
  return invoiceDataSchema.safeParse(data);
}
