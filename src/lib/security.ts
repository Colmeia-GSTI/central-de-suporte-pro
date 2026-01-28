/**
 * Security utilities for input sanitization and validation
 * Provides centralized functions for XSS prevention, input validation, and data sanitization
 */

// HTML entities to escape for XSS prevention
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Escapes HTML entities to prevent XSS attacks
 * Use this when displaying user-generated content
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitizes a string by removing potentially dangerous characters
 * Removes: script tags, event handlers, javascript: protocol
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    // Remove script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove on* event handlers
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '')
    // Remove data: protocol in certain contexts
    .replace(/data:text\/html/gi, '')
    // Trim whitespace
    .trim();
}

/**
 * Validates and sanitizes an email address
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') return '';
  const sanitized = email.toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(sanitized) ? sanitized : '';
}

/**
 * Sanitizes a phone number (removes non-digits)
 */
export function sanitizePhone(phone: string): string {
  if (typeof phone !== 'string') return '';
  return phone.replace(/\D/g, '').slice(0, 15);
}

/**
 * Sanitizes a URL by validating protocol
 * Only allows http, https protocols
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

/**
 * Validates CNPJ format (Brazilian company ID)
 */
export function validateCNPJ(cnpj: string): boolean {
  const numbers = cnpj.replace(/\D/g, '');
  if (numbers.length !== 14) return false;
  
  // Check for known invalid patterns
  if (/^(\d)\1+$/.test(numbers)) return false;
  
  // Validate check digits
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  
  const calcDigit = (nums: string, weights: number[]) => {
    const sum = weights.reduce((acc, weight, i) => acc + parseInt(nums[i]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  
  const digit1 = calcDigit(numbers, weights1);
  const digit2 = calcDigit(numbers, weights2);
  
  return parseInt(numbers[12]) === digit1 && parseInt(numbers[13]) === digit2;
}

/**
 * Validates CPF format (Brazilian personal ID)
 */
export function validateCPF(cpf: string): boolean {
  const numbers = cpf.replace(/\D/g, '');
  if (numbers.length !== 11) return false;
  
  // Check for known invalid patterns
  if (/^(\d)\1+$/.test(numbers)) return false;
  
  // Validate check digits
  const calcDigit = (nums: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < factor - 1; i++) {
      sum += parseInt(nums[i]) * (factor - i);
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  
  const digit1 = calcDigit(numbers, 10);
  const digit2 = calcDigit(numbers, 11);
  
  return parseInt(numbers[9]) === digit1 && parseInt(numbers[10]) === digit2;
}

/**
 * Rate limiting helper - tracks request counts per key
 * Use this in Edge Functions to prevent abuse
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(key: string, config: RateLimitConfig): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + config.windowMs });
    return { allowed: true, remaining: config.maxRequests - 1 };
  }
  
  if (record.count >= config.maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: config.maxRequests - record.count };
}

/**
 * Masks sensitive data for logging/display
 * Shows only last 4 characters
 */
export function maskSensitiveData(data: string, visibleChars = 4): string {
  if (typeof data !== 'string' || data.length <= visibleChars) {
    return '*'.repeat(Math.max(data?.length || 0, 4));
  }
  return '*'.repeat(data.length - visibleChars) + data.slice(-visibleChars);
}

/**
 * Validates that a value is a valid UUID
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Limits string length safely
 */
export function truncateString(str: string, maxLength: number): string {
  if (typeof str !== 'string') return '';
  return str.length > maxLength ? str.slice(0, maxLength) : str;
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Removes null bytes and other dangerous characters from strings
 */
export function sanitizeForDatabase(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove other control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

/**
 * Validates file extension against allowed list
 */
export function isAllowedFileExtension(filename: string, allowedExtensions: string[]): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? allowedExtensions.includes(ext) : false;
}

/**
 * Content Security Policy headers for Edge Functions
 */
export const CSP_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
