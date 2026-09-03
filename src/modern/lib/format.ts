const mediumDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const mediumDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const MAX_CACHE_SIZE = 1000;
const dateCache = new Map<string, string>();
const dateTimeCache = new Map<string, string>();
const startOfDayCache = new Map<string, string>();
const endOfDayCache = new Map<string, string>();

/**
 * Memoizes results to avoid expensive operations.
 * Uses a bounded cache to prevent memory leaks in long-running sessions.
 */
function memoize<T>(value: string, op: (v: string) => T, cache: Map<string, T>): T {
  const cached = cache.get(value);
  if (cached !== undefined) return cached;

  const result = op(value);

  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(value, result);
  return result;
}

export function formatDisplayDate(value: string) {
  return memoize(
    value,
    (v) => {
      const parsed = new Date(v);
      return Number.isNaN(parsed.getTime()) ? v : mediumDateFormatter.format(parsed);
    },
    dateCache,
  );
}

export function formatDisplayDateTime(value: string) {
  return memoize(
    value,
    (v) => {
      const parsed = new Date(v);
      return Number.isNaN(parsed.getTime()) ? v : mediumDateTimeFormatter.format(parsed);
    },
    dateTimeCache,
  );
}

const SENTINEL_DATE_REGEX = /^[+-]?\d{5,}[0-9T:Z.+-]*$/;

/**
 * Detects Java sentinel dates (LocalDateTime.MAX/MIN) that the backend uses
 * for "no end date" or "no start date". These are unparseable by JS Date
 * and look like "+999999999-12-31T23:59:59..." or "-999999999-01-01T00:00:00...".
 */
export function isSentinelDate(value: string): boolean {
  return SENTINEL_DATE_REGEX.test(value);
}

function toValidDate(iso: string): Date {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Invalid date value: "${iso}"`);
  }
  return parsed;
}

export function getStartOfDayIso(dateValue: string) {
  return memoize(dateValue, (v) => toValidDate(`${v}T00:00:00.000Z`).toISOString(), startOfDayCache);
}

export function getEndOfDayIso(dateValue: string) {
  return memoize(dateValue, (v) => toValidDate(`${v}T23:59:59.999Z`).toISOString(), endOfDayCache);
}
