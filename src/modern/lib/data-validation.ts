/**
 * Regular expressions for common data formats.
 */

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601 datetime regex: YYYY-MM-DDTHH:mm:ss[.SSS][Z|(+|-)HH:mm]
export const ISO_DATETIME_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

/**
 * Validates if a string is a valid UUID.
 */
export function isValidUUID(uuid: string): boolean {
  return UUID_REGEX.test(uuid);
}

/**
 * Validates if a string is a valid ISO date (YYYY-MM-DD).
 */
export function isValidIsoDate(date: string): boolean {
  return ISO_DATE_REGEX.test(date);
}

/**
 * Validates if a string is a valid ISO datetime (full string must match YYYY-MM-DDTHH:mm:ss).
 */
export function isValidIsoDateTime(dateTime: string): boolean {
  return ISO_DATETIME_REGEX.test(dateTime);
}

/**
 * Validates if a string is a valid email address.
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
