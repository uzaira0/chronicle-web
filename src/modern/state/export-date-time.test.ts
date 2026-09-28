import { describe, expect, test } from 'bun:test';
import { exportRangeExceedsLimit, toExportDateTime } from './study-operations-api';

describe('toExportDateTime', () => {
  test('turns a start day into local midnight as an ISO date-time', () => {
    expect(toExportDateTime('2026-09-01')).toMatch(/^2026-09-01T00:00:00[+-]\d\d:\d\d$/);
  });

  test('turns an end day into the following local midnight so the day is included', () => {
    expect(toExportDateTime('2026-09-07', true)).toMatch(/^2026-09-08T00:00:00[+-]\d\d:\d\d$/);
  });

  test('passes an existing date-time through unchanged', () => {
    expect(toExportDateTime('2026-09-01T00:00:00Z')).toBe('2026-09-01T00:00:00Z');
  });

  test('rejects a 31-calendar-day range when autumn clock change makes it over 31 days', () => {
    const hasAutumnShift = new Date('2026-10-10T00:00:00').getTimezoneOffset() !==
      new Date('2026-11-10T00:00:00').getTimezoneOffset();
    expect(exportRangeExceedsLimit('2026-10-10', '2026-11-09')).toBe(hasAutumnShift);
  });

  test('preserves the selected local day and its offset', () => {
    const start = toExportDateTime('2026-09-08');
    const end = toExportDateTime('2026-09-08', true);
    expect(start).toMatch(/^2026-09-08T00:00:00[+-]\d\d:\d\d$/);
    expect(end).toMatch(/^2026-09-09T00:00:00[+-]\d\d:\d\d$/);
    expect(start.endsWith('Z')).toBe(false);
  });
});
