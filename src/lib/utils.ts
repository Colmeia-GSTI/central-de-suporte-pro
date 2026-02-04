import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely extracts error message from unknown error type
 * Used in catch blocks to avoid using 'any' type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Erro desconhecido";
}

/**
 * Format phone number to Brazilian display format
 * Handles both landline (10 digits) and mobile (11 digits) formats
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const numbers = value.replace(/\D/g, "");
  
  if (numbers.length === 0) return "";
  if (numbers.length <= 2) return `(${numbers}`;
  if (numbers.length <= 6) return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
  
  if (numbers.length <= 10) {
    // Landline: (00) 0000-0000
    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6, 10)}`;
  }
  // Mobile: (00) 00000-0000
  return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7, 11)}`;
}

/**
 * Format CEP to Brazilian display format: 00000-000
 * Always shows formatted version, stores only 8 digits
 */
export function formatCEP(value: string | null | undefined): string {
  if (!value) return "";
  const numbers = value.replace(/\D/g, "");
  
  if (numbers.length === 0) return "";
  if (numbers.length <= 5) return numbers;
  
  // Format: 00000-000
  return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
}
