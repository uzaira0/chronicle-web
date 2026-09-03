import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { validIsoDateArb } from '../test/arbitraries';
import { formatDisplayDate, formatDisplayDateTime, getEndOfDayIso, getStartOfDayIso, isSentinelDate } from './format';

const validDateArb = validIsoDateArb;
const yearMonthDayArb = validIsoDateArb;

describe('format properties', () => {
  it('formatDisplayDate never throws for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = formatDisplayDate(input);
        expect(typeof result).toBe('string');
      }),
    );
  });

  it('getStartOfDayIso always ends with T00:00:00.000Z for valid YYYY-MM-DD dates', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getStartOfDayIso(dateStr)).toEndWith('T00:00:00.000Z');
      }),
    );
  });

  it('getEndOfDayIso always ends with T23:59:59.999Z for valid YYYY-MM-DD dates', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getEndOfDayIso(dateStr)).toEndWith('T23:59:59.999Z');
      }),
    );
  });

  it('isSentinelDate is a pure function (same input, same output)', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(isSentinelDate(input)).toBe(isSentinelDate(input));
      }),
    );
  });

  // --- New properties ---

  it('formatDisplayDate never returns empty string for valid ISO dates', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const result = formatDisplayDate(dateStr);
        expect(result.length).toBeGreaterThan(0);
      }),
    );
  });

  it('formatDisplayDate is deterministic (same input produces same output)', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        expect(formatDisplayDate(dateStr)).toBe(formatDisplayDate(dateStr));
      }),
    );
  });

  it('formatDisplayDateTime is deterministic (same input produces same output)', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        expect(formatDisplayDateTime(dateStr)).toBe(formatDisplayDateTime(dateStr));
      }),
    );
  });

  it('formatDisplayDateTime never throws for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = formatDisplayDateTime(input);
        expect(typeof result).toBe('string');
      }),
    );
  });

  it('isSentinelDate returns false for any standard 4-digit year date', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(isSentinelDate(dateStr)).toBe(false);
      }),
    );
  });

  it('isSentinelDate returns true for dates starting with 5+ digit year', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10000, max: 999999999 }), (year) => {
        expect(isSentinelDate(`${year}-01-01`)).toBe(true);
      }),
    );
  });

  it('isSentinelDate returns true for +prefixed 5+ digit year', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10000, max: 999999999 }), (year) => {
        expect(isSentinelDate(`+${year}-12-31`)).toBe(true);
      }),
    );
  });

  it('isSentinelDate returns true for -prefixed 5+ digit year', () => {
    fc.assert(
      fc.property(fc.integer({ min: 10000, max: 999999999 }), (year) => {
        expect(isSentinelDate(`-${year}-01-01`)).toBe(true);
      }),
    );
  });

  it('isSentinelDate calling twice yields same result (purity)', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const first = isSentinelDate(input);
        const second = isSentinelDate(input);
        expect(first).toBe(second);
      }),
    );
  });

  it('getStartOfDayIso result is always <= getEndOfDayIso for same input', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        const start = getStartOfDayIso(dateStr);
        const end = getEndOfDayIso(dateStr);
        expect(start <= end).toBe(true);
      }),
    );
  });

  it('getStartOfDayIso parses back to a valid Date for valid dates', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        const result = getStartOfDayIso(dateStr);
        const parsed = new Date(result);
        expect(Number.isNaN(parsed.getTime())).toBe(false);
      }),
    );
  });

  it('getEndOfDayIso parses back to a valid Date for valid dates', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        const result = getEndOfDayIso(dateStr);
        const parsed = new Date(result);
        expect(Number.isNaN(parsed.getTime())).toBe(false);
      }),
    );
  });

  it('formatDisplayDate of empty string returns empty string', () => {
    fc.assert(
      fc.property(fc.constant(''), (input) => {
        expect(formatDisplayDate(input)).toBe('');
      }),
    );
  });

  it('formatDisplayDate output contains the year number for valid dates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2000, max: 2099 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        (year, month, day) => {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const result = formatDisplayDate(dateStr);
          expect(result).toContain(String(year));
        },
      ),
    );
  });

  it('formatDisplayDate output length is between 5 and 30 chars for valid dates', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const result = formatDisplayDate(dateStr);
        expect(result.length).toBeGreaterThanOrEqual(5);
        expect(result.length).toBeLessThanOrEqual(30);
      }),
    );
  });

  it('formatDisplayDateTime output length is between 5 and 40 chars for valid dates', () => {
    fc.assert(
      fc.property(validDateArb, (dateStr) => {
        const result = formatDisplayDateTime(dateStr);
        expect(result.length).toBeGreaterThanOrEqual(5);
        expect(result.length).toBeLessThanOrEqual(40);
      }),
    );
  });

  it('getStartOfDayIso is deterministic', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getStartOfDayIso(dateStr)).toBe(getStartOfDayIso(dateStr));
      }),
    );
  });

  it('getEndOfDayIso is deterministic', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getEndOfDayIso(dateStr)).toBe(getEndOfDayIso(dateStr));
      }),
    );
  });

  it('getStartOfDayIso always starts with the date portion', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getStartOfDayIso(dateStr)).toStartWith(dateStr);
      }),
    );
  });

  it('getEndOfDayIso always starts with the date portion', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getEndOfDayIso(dateStr)).toStartWith(dateStr);
      }),
    );
  });

  it('getStartOfDayIso result is always a valid ISO string', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        const result = getStartOfDayIso(dateStr);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }),
    );
  });

  it('getEndOfDayIso result is always a valid ISO string', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        const result = getEndOfDayIso(dateStr);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      }),
    );
  });

  it('isSentinelDate returns a boolean for any string', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(typeof isSentinelDate(input)).toBe('boolean');
      }),
    );
  });

  it('formatDisplayDate returns the original value for non-date strings', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => Number.isNaN(new Date(s).getTime())),
        (input) => {
          expect(formatDisplayDate(input)).toBe(input);
        },
      ),
    );
  });

  it('formatDisplayDateTime returns the original value for non-date strings', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => Number.isNaN(new Date(s).getTime())),
        (input) => {
          expect(formatDisplayDateTime(input)).toBe(input);
        },
      ),
    );
  });

  it('getStartOfDayIso and getEndOfDayIso produce different results for same date', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getStartOfDayIso(dateStr)).not.toBe(getEndOfDayIso(dateStr));
      }),
    );
  });

  it('getStartOfDayIso result length is always 24', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getStartOfDayIso(dateStr).length).toBe(24);
      }),
    );
  });

  it('getEndOfDayIso result length is always 24', () => {
    fc.assert(
      fc.property(yearMonthDayArb, (dateStr) => {
        expect(getEndOfDayIso(dateStr).length).toBe(24);
      }),
    );
  });
});
