import { describe, expect, it } from 'bun:test';

import { formatDisplayDate, formatDisplayDateTime } from './format';

describe('formatDisplayDate()', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDisplayDate('2024-03-15');
    // Intl formatting varies by locale, but should contain "2024" and "15"
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });

  it('returns the original value for an invalid date', () => {
    expect(formatDisplayDate('not-a-date')).toBe('not-a-date');
    expect(formatDisplayDate('')).toBe('');
  });

  it('formats an ISO datetime string', () => {
    const result = formatDisplayDate('2024-01-01T12:00:00Z');
    expect(result).toContain('2024');
  });
});

describe('formatDisplayDateTime()', () => {
  it('formats a valid ISO datetime string with time component', () => {
    const result = formatDisplayDateTime('2024-06-15T14:30:00Z');
    expect(result).toContain('2024');
    expect(result).toContain('15');
  });

  it('returns the original value for an invalid datetime', () => {
    expect(formatDisplayDateTime('garbage')).toBe('garbage');
  });
});

// === EXPANDED EXHAUSTIVE TESTS ===

describe('formatDisplayDate() — exhaustive edge cases', () => {
  const validDateCases: [string, string][] = [
    ['2024-01-01', '2024'],
    ['2024-12-31', '2024'],
    ['2000-01-01', '2000'],
    ['1999-12-31', '1999'],
    ['2024-02-29', '2024'], // leap year
    ['2023-02-28', '2023'], // non-leap year last day of Feb
    ['2024-06-30', '2024'], // month end
    ['2024-07-01', '2024'], // month start
    ['1970-01-01', '1970'], // Unix epoch
    ['2024-03-15T00:00:00Z', '2024'],
    ['2024-03-15T23:59:59Z', '2024'],
    ['2024-03-15T12:00:00+05:30', '2024'],
    ['2024-03-15T00:00:00-08:00', '2024'],
    ['2024-11-30', '2024'],
    ['2024-04-30', '2024'],
    ['2100-01-01', '2100'],
    ['1900-01-01', '1900'],
    ['2024-08-15', '2024'],
    ['2024-09-01', '2024'],
    ['2024-10-31', '2024'],
  ];

  it.each(validDateCases)('formats "%s" and result contains "%s"', (input, yearExpected) => {
    const result = formatDisplayDate(input);
    expect(result).toContain(yearExpected);
  });

  const invalidDateCases = [
    'not-a-date',
    '',
    'abc',
    'hello world',
    '----',
    'YYYY-MM-DD',
    '2024-13-01', // invalid month
    '2024-00-01', // zero month
  ];

  it.each(invalidDateCases)('returns original value for invalid "%s"', (input) => {
    expect(formatDisplayDate(input)).toBe(input);
  });
});

describe('formatDisplayDateTime() — exhaustive edge cases', () => {
  const validCases: [string, string][] = [
    ['2024-06-15T14:30:00Z', '2024'],
    ['2024-01-01T12:00:00Z', '2024'], // noon UTC keeps the year in either zone
    ['2024-06-15T12:00:00Z', '2024'], // noon UTC
    ['2024-12-31T12:00:00Z', '2024'], // noon UTC
    ['2024-03-15T08:30:00+05:30', '2024'], // positive offset
    ['2024-03-15T08:30:00-07:00', '2024'], // negative offset
    ['2024-07-04T16:00:00Z', '2024'],
    ['1970-01-01T12:00:00Z', '1970'],
    ['2024-02-29T12:00:00Z', '2024'], // leap day
    ['2024-11-01T23:00:00Z', '2024'],
    ['2024-03-10T02:00:00-05:00', '2024'], // DST transition area
    ['2024-01-15T06:45:00Z', '2024'],
    ['2024-09-30T18:15:00Z', '2024'],
    ['2000-06-15T10:00:00Z', '2000'],
    ['2099-12-31T12:00:00Z', '2099'],
  ];

  it.each(validCases)('formats "%s" and result contains "%s"', (input, yearExpected) => {
    const result = formatDisplayDateTime(input);
    expect(result).toContain(yearExpected);
  });

  const invalidCases = ['garbage', '', 'not a datetime', '::::', 'T12:00:00Z'];

  it.each(invalidCases)('returns original value for invalid "%s"', (input) => {
    expect(formatDisplayDateTime(input)).toBe(input);
  });
});
