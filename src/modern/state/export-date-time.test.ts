import { describe, expect, test } from 'bun:test';
import { isCalendarDay, toExportDateTime } from './study-operations-api';

describe('study calendar boundaries', () => {
  test.each([
    ['UTC', '2026-09-06', '2026-09-06T00:00:00.000Z', '2026-09-07T00:00:00.000Z'],
    ['America/Santiago', '2026-09-05', '2026-09-05T00:00:00.000-04:00', '2026-09-06T00:00:00.000-04:00'],
    ['America/Santiago', '2026-09-06', '2026-09-06T01:00:00.000-03:00', '2026-09-07T00:00:00.000-03:00'],
    ['Asia/Kolkata', '2026-09-06', '2026-09-06T00:00:00.000+05:30', '2026-09-07T00:00:00.000+05:30'],
  ])('resolves %s without consulting the browser zone', (zone, day, start, end) => {
    expect(toExportDateTime(day, false, zone)).toBe(start);
    expect(toExportDateTime(day, true, zone)).toBe(end);
  });

  test('treats a URL day that is not on the calendar as invalid instead of throwing', () => {
    for (const day of ['2026-99-99', '2026-02-30', '2026-13-01']) {
      expect(isCalendarDay(day)).toBe(false);
      expect(() => toExportDateTime(day, false, 'UTC')).not.toThrow();
    }
    expect(isCalendarDay('2028-02-29')).toBe(true);
  });

  test('keeps an existing instant unchanged', () => {
    expect(toExportDateTime('2026-09-01T00:00:00Z', false, 'America/Chicago')).toBe('2026-09-01T00:00:00Z');
  });
});

test('skipped-midnight exclusive bounds preserve both instant and diagnostic calendar day', () => {
  const end = toExportDateTime('2026-09-05', true, 'America/Santiago');
  expect(new Date(end).toISOString()).toBe('2026-09-06T04:00:00.000Z');
  expect(end.slice(0, 19)).toBe('2026-09-06T00:00:00');
});
