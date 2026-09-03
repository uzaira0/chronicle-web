import { describe, expect, it } from 'bun:test';

import { formatDisplayDate, formatDisplayDateTime, getEndOfDayIso, getStartOfDayIso, isSentinelDate } from './format';

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

describe('isSentinelDate()', () => {
  it('detects Java LocalDateTime.MAX sentinel', () => {
    expect(isSentinelDate('+999999999-12-31T23:59:59.999999999')).toBe(true);
  });

  it('detects Java LocalDateTime.MIN sentinel', () => {
    expect(isSentinelDate('-999999999-01-01T00:00:00')).toBe(true);
  });

  it('detects unsigned large-year dates', () => {
    expect(isSentinelDate('99999-12-31')).toBe(true);
  });

  it('rejects normal 4-digit year dates', () => {
    expect(isSentinelDate('2024-03-15')).toBe(false);
    expect(isSentinelDate('1999-01-01')).toBe(false);
  });

  it('rejects non-date strings', () => {
    expect(isSentinelDate('hello')).toBe(false);
    expect(isSentinelDate('')).toBe(false);
  });
});

describe('getStartOfDayIso()', () => {
  it('returns the start of day in ISO format', () => {
    expect(getStartOfDayIso('2024-03-15')).toBe('2024-03-15T00:00:00.000Z');
  });

  it('throws RangeError for invalid date', () => {
    expect(() => getStartOfDayIso('not-a-date')).toThrow(RangeError);
  });
});

describe('getEndOfDayIso()', () => {
  it('returns the end of day in ISO format', () => {
    expect(getEndOfDayIso('2024-03-15')).toBe('2024-03-15T23:59:59.999Z');
  });

  it('throws RangeError for invalid date', () => {
    expect(() => getEndOfDayIso('invalid')).toThrow(RangeError);
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
    ['2024-01-01T00:00:00Z', '2024'], // midnight UTC
    ['2024-06-15T12:00:00Z', '2024'], // noon UTC
    ['2024-12-31T23:59:59Z', '2024'], // end of day
    ['2024-03-15T08:30:00+05:30', '2024'], // positive offset
    ['2024-03-15T08:30:00-07:00', '2024'], // negative offset
    ['2024-07-04T16:00:00Z', '2024'],
    ['1970-01-01T00:00:00Z', '1970'], // epoch
    ['2024-02-29T12:00:00Z', '2024'], // leap day
    ['2024-11-01T23:00:00Z', '2024'],
    ['2024-03-10T02:00:00-05:00', '2024'], // DST transition area
    ['2024-01-15T06:45:00Z', '2024'],
    ['2024-09-30T18:15:00Z', '2024'],
    ['2000-06-15T10:00:00Z', '2000'],
    ['2099-12-31T23:59:59Z', '2099'],
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

describe('isSentinelDate() — exhaustive edge cases', () => {
  const trueCases: [string, string][] = [
    ['+999999999-12-31T23:59:59.999999999', 'Java MAX'],
    ['-999999999-01-01T00:00:00', 'Java MIN'],
    ['99999-12-31', 'unsigned 5-digit year'],
    ['10000-01-01', '5-digit year boundary'],
    ['100000-01-01', '6-digit year'],
    ['+10000-01-01', 'signed 5-digit year'],
    ['-10000-01-01', 'negative 5-digit year'],
    ['12345-06-15', '5-digit year'],
    ['99999999-01-01', '8-digit year'],
    ['+12345', 'signed digits only'],
    ['-12345', 'negative digits only'],
    ['12345', 'bare 5 digits'],
    ['123456789', 'bare 9 digits'],
    ['+99999-12-31T23:59:59', 'signed sentinel with time'],
  ];

  it('rejects sentinel date with invalid trailing content (e.g. SQL injection attempt)', () => {
    expect(isSentinelDate('99999-01-01; DROP TABLE users;')).toBe(false);
  });

  it.each(trueCases)('detects sentinel: "%s" (%s)', (input) => {
    expect(isSentinelDate(input)).toBe(true);
  });

  const falseCases: [string, string][] = [
    ['2024-03-15', 'normal 4-digit date'],
    ['1999-01-01', 'normal year'],
    ['0001-01-01', '4-digit year with leading zeros'],
    ['9999-12-31', '4-digit max year'],
    ['hello', 'alphabetic string'],
    ['', 'empty string'],
    ['abc12345', 'alpha before digits'],
    ['date:12345', 'colon before digits'],
    ['2024', '4 bare digits'],
    ['12', '2 digits'],
    ['1234', '4 digits'],
    [' 12345', 'leading space before 5 digits'],
  ];

  it.each(falseCases)('rejects non-sentinel: "%s" (%s)', (input) => {
    expect(isSentinelDate(input)).toBe(false);
  });
});

describe('getStartOfDayIso() — exhaustive edge cases', () => {
  const validCases: [string, string][] = [
    ['2024-03-15', '2024-03-15T00:00:00.000Z'],
    ['2024-01-01', '2024-01-01T00:00:00.000Z'],
    ['2024-12-31', '2024-12-31T00:00:00.000Z'],
    ['2024-02-29', '2024-02-29T00:00:00.000Z'], // leap day
    ['2023-02-28', '2023-02-28T00:00:00.000Z'], // last Feb non-leap
    ['2024-06-30', '2024-06-30T00:00:00.000Z'], // month end
    ['2024-07-01', '2024-07-01T00:00:00.000Z'], // month start
    ['1970-01-01', '1970-01-01T00:00:00.000Z'], // epoch
    ['2000-01-01', '2000-01-01T00:00:00.000Z'],
    ['2024-11-30', '2024-11-30T00:00:00.000Z'],
  ];

  it.each(validCases)('getStartOfDayIso("%s") => "%s"', (input, expected) => {
    expect(getStartOfDayIso(input)).toBe(expected);
  });

  const invalidCases = ['not-a-date', 'invalid', 'abc', '', '----'];

  it.each(invalidCases)('throws RangeError for "%s"', (input) => {
    expect(() => getStartOfDayIso(input)).toThrow(RangeError);
  });
});

describe('getEndOfDayIso() — exhaustive edge cases', () => {
  const validCases: [string, string][] = [
    ['2024-03-15', '2024-03-15T23:59:59.999Z'],
    ['2024-01-01', '2024-01-01T23:59:59.999Z'],
    ['2024-12-31', '2024-12-31T23:59:59.999Z'],
    ['2024-02-29', '2024-02-29T23:59:59.999Z'], // leap day
    ['2023-02-28', '2023-02-28T23:59:59.999Z'],
    ['2024-06-30', '2024-06-30T23:59:59.999Z'],
    ['2024-07-01', '2024-07-01T23:59:59.999Z'],
    ['1970-01-01', '1970-01-01T23:59:59.999Z'],
    ['2000-01-01', '2000-01-01T23:59:59.999Z'],
    ['2024-11-30', '2024-11-30T23:59:59.999Z'],
  ];

  it.each(validCases)('getEndOfDayIso("%s") => "%s"', (input, expected) => {
    expect(getEndOfDayIso(input)).toBe(expected);
  });

  const invalidCases = ['not-a-date', 'invalid', 'abc', '', '----'];

  it.each(invalidCases)('throws RangeError for "%s"', (input) => {
    expect(() => getEndOfDayIso(input)).toThrow(RangeError);
  });
});
