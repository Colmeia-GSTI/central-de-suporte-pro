type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  timestamp: string;
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

  // Retrieve stored logs
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
