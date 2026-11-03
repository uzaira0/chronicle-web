const mediumDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const mediumDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const MAX_CACHE_SIZE = 1000;
const dateCache = new Map<string, string>();
const dateTimeCache = new Map<string, string>();

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

export function parseDisplayDate(value: string): Date {
  // Date-only values are local calendar dates; offset date-times remain instants.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
}

/** A medium date in the browser's locale, or in [locale] when a page renders in the picked language. */
export function formatDisplayDate(value: string, locale?: string) {
  return memoize(
    `${locale ?? ''}|${value}`,
    () => {
      const parsed = parseDisplayDate(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return (locale ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }) : mediumDateFormatter).format(parsed);
    },
    dateCache,
  );
}

export function formatDisplayDateTime(value: string) {
  return memoize(
    value,
    (v) => {
      const parsed = parseDisplayDate(v);
      return Number.isNaN(parsed.getTime()) ? v : mediumDateTimeFormatter.format(parsed);
    },
    dateTimeCache,
  );
}

/** `YYYY-MM-DD` in the viewer's time zone, the format date inputs use. */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export function isReversedDateRange(start: string, end: string): boolean {
  return Boolean(start && end && start > end);
}
