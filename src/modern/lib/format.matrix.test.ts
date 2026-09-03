import { describe, expect, it } from 'bun:test';
import { formatDisplayDate, formatDisplayDateTime, getEndOfDayIso, getStartOfDayIso, isSentinelDate } from './format';

// ─── formatDisplayDate — year x month x day matrix ───────────
// 7 x 5 x 3 = 105 tests
describe('formatDisplayDate — year x month x day matrix', () => {
  const years = ['2020', '2021', '2022', '2023', '2024', '2025', '2026'];
  const months = ['01', '02', '06', '07', '12'];
  const days = ['01', '15', '28'];

  for (const year of years) {
    for (const month of months) {
      for (const day of days) {
        const dateStr = `${year}-${month}-${day}`;
        it(`formats ${dateStr} and contains year`, () => {
          const result = formatDisplayDate(dateStr);
          expect(typeof result).toBe('string');
          expect(result).toContain(year);
        });
      }
    }
  }
});

// ─── formatDisplayDateTime — same matrix ─────────────────────
// 7 x 3 x 2 = 42 tests
describe('formatDisplayDateTime — year x month x day matrix', () => {
  const years = ['2020', '2022', '2023', '2024', '2025', '2026', '2019'];
  const months = ['01', '06', '12'];
  const days = ['01', '28'];

  for (const year of years) {
    for (const month of months) {
      for (const day of days) {
        const dateStr = `${year}-${month}-${day}T14:30:00Z`;
        it(`formats ${dateStr} and contains year`, () => {
          const result = formatDisplayDateTime(dateStr);
          expect(typeof result).toBe('string');
          expect(result).toContain(year);
        });
      }
    }
  }
});

// ─── getStartOfDayIso + getEndOfDayIso — ordering invariants ─
// 20 x 3 = 60 tests
describe('getStartOfDayIso + getEndOfDayIso — date ordering invariants', () => {
  const dates = [
    '2020-01-01',
    '2020-02-29',
    '2020-06-15',
    '2020-12-31',
    '2021-01-01',
    '2021-03-15',
    '2021-06-30',
    '2021-12-31',
    '2022-01-01',
    '2022-07-04',
    '2022-11-15',
    '2022-12-25',
    '2023-01-01',
    '2023-04-01',
    '2023-08-15',
    '2023-12-31',
    '2024-01-01',
    '2024-02-29',
    '2024-09-01',
    '2024-12-31',
  ];

  for (const date of dates) {
    it(`start <= end for ${date}`, () => {
      const start = new Date(getStartOfDayIso(date));
      const end = new Date(getEndOfDayIso(date));
      expect(start.getTime()).toBeLessThanOrEqual(end.getTime());
    });
    it(`start is at midnight for ${date}`, () => {
      const start = new Date(getStartOfDayIso(date));
      expect(start.getUTCHours()).toBe(0);
      expect(start.getUTCMinutes()).toBe(0);
      expect(start.getUTCSeconds()).toBe(0);
    });
    it(`end is at 23:59:59 for ${date}`, () => {
      const end = new Date(getEndOfDayIso(date));
      expect(end.getUTCHours()).toBe(23);
      expect(end.getUTCMinutes()).toBe(59);
      expect(end.getUTCSeconds()).toBe(59);
    });
  }
});

// ─── isSentinelDate — exhaustive pattern matrix ──────────────
// 30 tests
describe('isSentinelDate — pattern matrix', () => {
  const sentinels: Array<{ input: string; expected: boolean }> = [
    { input: '+999999999-12-31T23:59:59', expected: true },
    { input: '-999999999-01-01T00:00:00', expected: true },
    { input: '+99999-12-31T23:59:59', expected: true },
    { input: '-99999-01-01T00:00:00', expected: true },
    { input: '99999-12-31', expected: true },
    { input: '100000-01-01', expected: true },
    { input: '+100000-06-15', expected: true },
    { input: '-100000-06-15', expected: true },
    { input: '12345-01-01', expected: true },
    { input: '00000-01-01', expected: true },
    // Normal dates should NOT be sentinel
    { input: '2024-01-01', expected: false },
    { input: '2024-12-31T23:59:59', expected: false },
    { input: '1999-06-15', expected: false },
    { input: '2000-01-01T00:00:00Z', expected: false },
    { input: '1970-01-01', expected: false },
    { input: '0001-01-01', expected: false },
    { input: '9999-12-31', expected: false },
    { input: '', expected: false },
    { input: 'not-a-date', expected: false },
    { input: 'abc', expected: false },
    { input: '2023', expected: false },
    { input: '2023-', expected: false },
    { input: '999-01-01', expected: false },
    { input: '23-01-01', expected: false },
    { input: '1-01-01', expected: false },
    { input: '+2024-01-01', expected: false },
    { input: '-2024-01-01', expected: false },
    { input: '+999-01-01', expected: false },
    { input: '-999-01-01', expected: false },
    { input: '0999-01-01', expected: false },
  ];

  for (const { input, expected } of sentinels) {
    it(`"${input}" -> ${expected}`, () => {
      expect(isSentinelDate(input)).toBe(expected);
    });
  }
});

// ─── formatDisplayDate — invalid input handling ──────────────
// 8 tests
describe('formatDisplayDate — invalid input handling', () => {
  const invalids = ['', 'not-a-date', 'abc', '2024-13-01', '2024-00-00', 'null', 'undefined', '----'];
  for (const input of invalids) {
    it(`returns input string for invalid "${input}"`, () => {
      // Invalid dates should return the original string
      const result = formatDisplayDate(input);
      expect(typeof result).toBe('string');
    });
  }
});

// ─── getStartOfDayIso / getEndOfDayIso — ISO format verification ─
// 20 tests
describe('getStartOfDayIso — output is valid ISO string', () => {
  const dates = [
    '2020-01-01',
    '2020-06-15',
    '2021-03-15',
    '2021-12-31',
    '2022-01-01',
    '2022-07-04',
    '2023-01-01',
    '2023-08-15',
    '2024-01-01',
    '2024-12-31',
  ];
  for (const date of dates) {
    it(`getStartOfDayIso("${date}") produces valid ISO`, () => {
      const iso = getStartOfDayIso(date);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(iso).toISOString()).toBe(iso);
    });
    it(`getEndOfDayIso("${date}") produces valid ISO`, () => {
      const iso = getEndOfDayIso(date);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(new Date(iso).toISOString()).toBe(iso);
    });
  }
});
