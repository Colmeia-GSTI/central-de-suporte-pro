import { supabase } from "@/integrations/supabase/client";

type LogLevel = "debug" | "info" | "warn" | "error";

type LogModule = 
  | "Auth" 
  | "Billing" 
  | "Payment" 
  | "Nfse" 
  | "Integration" 
  | "ErrorBoundary" 
  | "General";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

interface ApplicationLogEntry {
  level: LogLevel;
  module: LogModule;
  action?: string;
  message: string;
  context?: Record<string, unknown>;
  error_details?: {
    message?: string;
    stack?: string;
    code?: string;
  };
  execution_id?: string;
  duration_ms?: number;
}

const LOG_STORAGE_KEY = "app_logs";
const MAX_LOGS = 100;

class Logger {
  private isDev = import.meta.env.DEV;

  private formatLog(entry: LogEntry): string {
    const prefix = entry.context ? `[${entry.context}]` : "";
    return `${entry.timestamp} ${entry.level.toUpperCase()} ${prefix} ${entry.message}`;
  }

  private persistLog(entry: LogEntry) {
    try {
      const stored = sessionStorage.getItem(LOG_STORAGE_KEY);
      const logs: LogEntry[] = stored ? JSON.parse(stored) : [];
      logs.push(entry);
      const trimmed = logs.slice(-MAX_LOGS);
      sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore storage errors
    }
  }

  private log(level: LogLevel, message: string, context?: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      context,
      data,
      timestamp: new Date().toISOString(),
    };

    this.persistLog(entry);

    // Only output to console in development
    if (this.isDev) {
      const formatted = this.formatLog(entry);
      const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      if (data) {
        consoleMethod(formatted, data);
      } else {
        consoleMethod(formatted);
      }
    }
  }

  debug(message: string, context?: string, data?: Record<string, unknown>) {
    this.log("debug", message, context, data);
  }

  info(message: string, context?: string, data?: Record<string, unknown>) {
    this.log("info", message, context, data);
  }

  warn(message: string, context?: string, data?: Record<string, unknown>) {
    this.log("warn", message, context, data);
  }

  error(message: string, context?: string, data?: Record<string, unknown>) {
    this.log("error", message, context, data);
  }

  // Auth-specific helpers
  authInit(userId?: string) {
    this.info(userId ? `Session restored for user ${userId}` : "No active session", "Auth");
  }

  authLogin(userId: string) {
    this.info(`User logged in: ${userId}`, "Auth");
  }

  authLogout() {
    this.info("User logged out", "Auth");
  }

  authError(error: Error | string) {
    this.error(typeof error === "string" ? error : error.message, "Auth");
  }

  // ErrorBoundary helper
  componentError(error: Error, componentStack?: string) {
    this.error(error.message, "ErrorBoundary", {
      stack: error.stack,
      componentStack,
    });
  }

  // ==========================================
  // BILLING-SPECIFIC LOGGING METHODS
  // ==========================================

  /**
   * Log billing operations with optional database persistence
   */
  async billingOperation(
    action: string,
    status: "start" | "success" | "error" | "retry",
    data: {
      execution_id: string;
      contract_count?: number;
      generated?: number;
      skipped?: number;
      failed?: number;
      error?: string;
      duration_ms?: number;
      details?: Record<string, unknown>;
    },
    persistToDb = false
  ) {
    const level: LogLevel = status === "error" ? "error" : status === "retry" ? "warn" : "info";
    const message = `Billing: ${action} - ${status}`;
    
    this.log(level, message, "Billing", { ...data, action, status });

    if (persistToDb) {
      await this.persistToDatabase({
        level,
        module: "Billing",
        action,
        message,
        context: { 
          status, 
          contract_count: data.contract_count,
          generated: data.generated,
          skipped: data.skipped,
          failed: data.failed,
          details: data.details 
        },
        error_details: data.error ? { message: data.error } : undefined,
        execution_id: data.execution_id,
        duration_ms: data.duration_ms,
      });
    }
  }

  /**
   * Log payment generation operations
   */
  async paymentOperation(
    invoiceId: string,
    action: "boleto" | "pix" | "nfse",
    provider: string,
    status: "start" | "success" | "error",
    error?: string,
    persistToDb = false
  ) {
    const level: LogLevel = status === "error" ? "error" : "info";
    const message = `Payment: ${action} via ${provider} - ${status}`;
    
    this.log(level, message, "Payment", { invoiceId, action, provider, status, error });

    if (persistToDb) {
      await this.persistToDatabase({
        level,
        module: "Payment",
        action: `${action}_${provider}`,
        message,
        context: { invoice_id: invoiceId, provider },
        error_details: error ? { message: error } : undefined,
      });
    }
  }

  /**
   * Log NFS-e operations
   */
  async nfseOperation(
    invoiceId: string | null,
    action: "emit" | "cancel" | "query" | "download",
    status: "start" | "success" | "error",
    data?: {
      nfse_number?: string;
      error?: string;
      provider?: string;
    },
    persistToDb = false
  ) {
    const level: LogLevel = status === "error" ? "error" : "info";
    const message = `NFS-e: ${action} - ${status}`;
    
    this.log(level, message, "Nfse", { invoiceId, action, status, ...data });

    if (persistToDb) {
      await this.persistToDatabase({
        level,
        module: "Nfse",
        action,
        message,
        context: { 
          invoice_id: invoiceId,
          nfse_number: data?.nfse_number,
          provider: data?.provider
        },
        error_details: data?.error ? { message: data.error } : undefined,
      });
    }
  }

  /**
   * Log integration operations (Banco Inter, Asaas, SMTP, etc)
   */
  async integrationOperation(
    integration: string,
    action: string,
    status: "start" | "success" | "error",
    data?: {
      error?: string;
      details?: Record<string, unknown>;
    },
    persistToDb = false
  ) {
    const level: LogLevel = status === "error" ? "error" : "info";
    const message = `Integration: ${integration} - ${action} - ${status}`;
    
    this.log(level, message, "Integration", { integration, action, status, ...data });

    if (persistToDb) {
      await this.persistToDatabase({
        level,
        module: "Integration",
        action: `${integration}_${action}`,
        message,
        context: data?.details,
        error_details: data?.error ? { message: data.error } : undefined,
      });
    }
  }

  // ==========================================
  // DATABASE PERSISTENCE
  // ==========================================

  /**
   * Persist log entry to database (application_logs table)
   */
  async persistToDatabase(entry: ApplicationLogEntry): Promise<void> {
    try {
      const { error } = await supabase.from("application_logs").insert({
        level: entry.level,
        module: entry.module,
        action: entry.action,
        message: entry.message,
        context: entry.context,
        error_details: entry.error_details,
        execution_id: entry.execution_id,
        duration_ms: entry.duration_ms,
      });

      if (error) {
        // Silently fail - don't break app flow due to logging
        if (this.isDev) {
          console.warn("[Logger] Failed to persist log to database:", error);
        }
      }
    } catch (err) {
      // Silently fail
      if (this.isDev) {
        console.warn("[Logger] Exception persisting log:", err);
      }
    }
  }

  // ==========================================
  // UTILITY METHODS
  // ==========================================

  /**
   * Generate a unique execution ID for tracking operations
   */
  generateExecutionId(): string {
    return crypto.randomUUID();
  }

  /**
   * Retrieve stored logs from sessionStorage
   */
  getLogs(): LogEntry[] {
    try {
      const stored = sessionStorage.getItem(LOG_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  clearLogs() {
    sessionStorage.removeItem(LOG_STORAGE_KEY);
  }
}

export const logger = new Logger();

// ==========================================
// RETRY UTILITY WITH EXPONENTIAL BACKOFF
// ==========================================

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

/**
 * Execute a function with retry logic using exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, onRetry } = options;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      
      if (isLastAttempt) {
        throw error;
      }

      const delayMs = Math.pow(2, attempt) * baseDelayMs;
      const err = error instanceof Error ? error : new Error(String(error));
      
      logger.warn(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms`, 
        "General",
        { error: err.message }
      );

      onRetry?.(attempt + 1, err, delayMs);
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error("Retry exhausted");
}

// Production-safe console wrapper - suppresses logs in production
export const devLog = {
  log: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.error(...args);
  },
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV) console.debug(...args);
  },
};
