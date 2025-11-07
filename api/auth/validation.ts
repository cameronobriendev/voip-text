/**
 * Input Validation Utilities
 * Common validation functions for security and data integrity
 */

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  // Accepts various formats, validates 10-15 digits
  const digitsOnly = phone.replace(/\D/g, '');
  return /^\+?[1-9]\d{9,14}$/.test(digitsOnly);
}

export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Sanitize HTML to prevent XSS attacks
 * For display in HTML contexts
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validate string length
 */
export function isValidLength(str: string, min: number, max: number): boolean {
  return str.length >= min && str.length <= max;
}

/**
 * Validate string contains only alphanumeric characters
 */
export function isAlphanumeric(str: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(str);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize input for SQL (note: always prefer parameterized queries!)
 * This is a fallback sanitizer only
 */
export function sanitizeForSQL(input: string): string {
  // Remove dangerous characters (but parameterized queries are still required!)
  return input.replace(/['";\\]/g, '');
}

/**
 * Check if string contains only safe characters (letters, numbers, spaces, basic punctuation)
 */
export function isSafeString(str: string): boolean {
  return /^[a-zA-Z0-9\s.,!?'-]+$/.test(str);
}
