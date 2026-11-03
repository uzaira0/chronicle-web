import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { validIsoDateArb } from '../test/arbitraries';
import { formatDisplayDate, formatDisplayDateTime } from './format';

const validDateArb = validIsoDateArb;

describe('format properties', () => {
  it('formatDisplayDate never throws for any string input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = formatDisplayDate(input);
        expect(typeof result).toBe('string');
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
});
