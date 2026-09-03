import { describe, expect, it } from 'bun:test';

import {
  EMAIL_REGEX,
  ISO_DATE_REGEX,
  ISO_DATETIME_REGEX,
  isValidEmail,
  isValidIsoDate,
  isValidIsoDateTime,
  isValidUUID,
  UUID_REGEX,
} from '@/lib/data-validation';
import { getErrorMessage } from '@/lib/errors';
import {
  formatDisplayDate,
  formatDisplayDateTime,
  getEndOfDayIso,
  getStartOfDayIso,
  isSentinelDate,
} from '@/lib/format';
import { getStatusVariant } from '@/lib/participant-status';
import { getMutationRequestState, REQUEST_STATES } from '@/lib/request-state';
import { ANDROID_SENSOR_TYPES, STUDY_FEATURES } from '@/lib/study-constants';
import { daysToStudyDuration, studyDurationToDays } from '@/lib/study-form-helpers';

// =============================================================================
// UUID validation
// =============================================================================

describe('UUID validation', () => {
  const validUUIDs = [
    '123e4567-e89b-12d3-a456-426614174000',
    '00000000-0000-0000-0000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'ABCDEF01-2345-6789-ABCD-EF0123456789',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    '550e8400-e29b-41d4-a716-446655440000',
    '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  ];
  const invalidUUIDs = [
    '',
    'not-a-uuid',
    '123e4567-e89b-12d3-a456',
    '123e4567-e89b-12d3-a456-426614174000-extra',
    '123e4567_e89b_12d3_a456_426614174000',
    'gggggggg-gggg-gggg-gggg-gggggggggggg',
    '123e4567-e89b-12d3-a456-42661417400',
    '123e4567e89b12d3a456426614174000',
    ' 123e4567-e89b-12d3-a456-426614174000',
    '123e4567-e89b-12d3-a456-426614174000 ',
    '{123e4567-e89b-12d3-a456-426614174000}',
    'null',
  ];

  for (const uuid of validUUIDs) {
    it(`accepts valid UUID: ${uuid}`, () => {
      expect(UUID_REGEX.test(uuid)).toBe(true);
      expect(isValidUUID(uuid)).toBe(true);
    });
  }
  for (const uuid of invalidUUIDs) {
    it(`rejects invalid UUID: "${uuid.slice(0, 40)}"`, () => {
      expect(UUID_REGEX.test(uuid)).toBe(false);
      expect(isValidUUID(uuid)).toBe(false);
    });
  }
});

// =============================================================================
// ISO date validation
// =============================================================================

describe('ISO date validation', () => {
  const validDates = [
    '2024-01-01',
    '2024-12-31',
    '2000-06-15',
    '1999-01-01',
    '2025-02-28',
    '2024-02-29',
    '2100-12-31',
    '1900-01-01',
    '2024-06-30',
    '2024-11-15',
  ];
  const invalidDates = [
    '',
    '2024',
    '2024-01',
    '01-01-2024',
    '2024/01/01',
    '2024-1-1',
    '24-01-01',
    '2024-01-01T00:00:00',
    'not-a-date',
    '20240101',
    '2024.01.01',
  ];

  for (const date of validDates) {
    it(`accepts valid ISO date: ${date}`, () => {
      expect(ISO_DATE_REGEX.test(date)).toBe(true);
      expect(isValidIsoDate(date)).toBe(true);
    });
  }
  for (const date of invalidDates) {
    it(`rejects invalid ISO date: "${date}"`, () => {
      expect(ISO_DATE_REGEX.test(date)).toBe(false);
      expect(isValidIsoDate(date)).toBe(false);
    });
  }
});

// =============================================================================
// Email validation
// =============================================================================

describe('Email validation', () => {
  const validEmails = [
    'test@example.com',
    'user.name@domain.co.uk',
    'first+last@sub.domain.org',
    '123@abc.com',
    'a@b.cd',
  ];
  const invalidEmails = [
    '',
    'not-an-email',
    '@domain.com',
    'user@',
    'user@domain',
    'user@.com',
    'user @domain.com',
    'user@domain..com',
  ];

  for (const email of validEmails) {
    it(`accepts valid email: ${email}`, () => {
      expect(EMAIL_REGEX.test(email)).toBe(true);
      expect(isValidEmail(email)).toBe(true);
    });
  }
  for (const email of invalidEmails) {
    it(`rejects invalid email: "${email}"`, () => {
      expect(EMAIL_REGEX.test(email)).toBe(false);
      expect(isValidEmail(email)).toBe(false);
    });
  }
});

// =============================================================================
// ISO datetime validation
// =============================================================================

describe('ISO datetime validation', () => {
  const validDateTimes = [
    '2024-01-01T00:00:00Z',
    '2024-06-15T12:30:45.123Z',
    '2024-12-31T23:59:59Z',
    '2024-01-01T00:00:00+00:00',
    '2024-01-01T00:00:00-05:00',
  ];
  const invalidDateTimes = [
    '',
    '2024-01-01',
    '2024-01-01 00:00:00',
    'not-a-datetime',
    '01/01/2024T00:00:00',
    '2024-01-01T00:00:00; DROP TABLE users;',
    '2024-01-01T00:00:00-5:00-extra',
  ];

  for (const dt of validDateTimes) {
    it(`accepts valid ISO datetime: ${dt}`, () => {
      expect(ISO_DATETIME_REGEX.test(dt)).toBe(true);
      expect(isValidIsoDateTime(dt)).toBe(true);
    });
  }
  for (const dt of invalidDateTimes) {
    it(`rejects invalid ISO datetime: "${dt}"`, () => {
      expect(ISO_DATETIME_REGEX.test(dt)).toBe(false);
      expect(isValidIsoDateTime(dt)).toBe(false);
    });
  }
});

// =============================================================================
// getStatusVariant shape
// =============================================================================

describe('getStatusVariant return values', () => {
  const cases = [
    ['ENROLLED', 'success'],
    ['PAUSED', 'warning'],
    ['COLLECTION_COMPLETED', 'default'],
    ['NOT_ENROLLED', 'destructive'],
    ['UNKNOWN', 'muted'],
  ] as const;

  for (const [status, expected] of cases) {
    it(`returns "${expected}" for status "${status}"`, () => {
      expect(getStatusVariant(status)).toBe(expected);
    });
  }

  it('returns a string for every status', () => {
    for (const status of ['ENROLLED', 'PAUSED', 'COLLECTION_COMPLETED', 'NOT_ENROLLED', 'UNKNOWN']) {
      expect(typeof getStatusVariant(status)).toBe('string');
    }
  });
});

// =============================================================================
// REQUEST_STATES shape
// =============================================================================

describe('REQUEST_STATES shape', () => {
  it('has FAILURE key', () => {
    expect(REQUEST_STATES.FAILURE).toBe('FAILURE');
  });
  it('has PENDING key', () => {
    expect(REQUEST_STATES.PENDING).toBe('PENDING');
  });
  it('has STANDBY key', () => {
    expect(REQUEST_STATES.STANDBY).toBe('STANDBY');
  });
  it('has SUCCESS key', () => {
    expect(REQUEST_STATES.SUCCESS).toBe('SUCCESS');
  });
  it('has exactly 4 keys', () => {
    expect(Object.keys(REQUEST_STATES)).toHaveLength(4);
  });
  it('values are all strings', () => {
    for (const val of Object.values(REQUEST_STATES)) {
      expect(typeof val).toBe('string');
    }
  });
  it('keys match values', () => {
    for (const [key, val] of Object.entries(REQUEST_STATES)) {
      expect(key).toBe(val);
    }
  });
});

// =============================================================================
// getMutationRequestState shape
// =============================================================================

describe('getMutationRequestState return values', () => {
  it('returns PENDING when isLoading', () => {
    expect(getMutationRequestState({ isLoading: true, isSuccess: false, isError: false })).toBe('PENDING');
  });
  it('returns SUCCESS when isSuccess', () => {
    expect(getMutationRequestState({ isLoading: false, isSuccess: true, isError: false })).toBe('SUCCESS');
  });
  it('returns FAILURE when isError', () => {
    expect(getMutationRequestState({ isLoading: false, isSuccess: false, isError: true })).toBe('FAILURE');
  });
  it('returns STANDBY when all false', () => {
    expect(getMutationRequestState({ isLoading: false, isSuccess: false, isError: false })).toBe('STANDBY');
  });
  it('isLoading takes priority over isSuccess', () => {
    expect(getMutationRequestState({ isLoading: true, isSuccess: true, isError: false })).toBe('PENDING');
  });
  it('isLoading takes priority over isError', () => {
    expect(getMutationRequestState({ isLoading: true, isSuccess: false, isError: true })).toBe('PENDING');
  });
  it('isSuccess takes priority over isError', () => {
    expect(getMutationRequestState({ isLoading: false, isSuccess: true, isError: true })).toBe('SUCCESS');
  });
  it('all true returns PENDING', () => {
    expect(getMutationRequestState({ isLoading: true, isSuccess: true, isError: true })).toBe('PENDING');
  });
});

// =============================================================================
// STUDY_FEATURES shape
// =============================================================================

describe('STUDY_FEATURES shape', () => {
  it('is an array', () => {
    expect(Array.isArray(STUDY_FEATURES)).toBe(true);
  });
  it('has 3 entries', () => {
    expect(STUDY_FEATURES).toHaveLength(3);
  });

  const expectedValues = ['CHRONICLE_DATA_COLLECTION', 'CHRONICLE_SURVEYS', 'TIME_USE_DIARY'];
  for (const value of expectedValues) {
    it(`contains feature "${value}"`, () => {
      expect(STUDY_FEATURES.some((f) => f.value === value)).toBe(true);
    });
  }

  it('every entry has label string', () => {
    for (const f of STUDY_FEATURES) {
      expect(typeof f.label).toBe('string');
      expect(f.label.length).toBeGreaterThan(0);
    }
  });

  it('every entry has value string', () => {
    for (const f of STUDY_FEATURES) {
      expect(typeof f.value).toBe('string');
      expect(f.value.length).toBeGreaterThan(0);
    }
  });

  it('values are unique', () => {
    const values = STUDY_FEATURES.map((f) => f.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('labels are unique', () => {
    const labels = STUDY_FEATURES.map((f) => f.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// =============================================================================
// ANDROID_SENSOR_TYPES shape
// =============================================================================

describe('ANDROID_SENSOR_TYPES shape', () => {
  it('is an array', () => {
    expect(Array.isArray(ANDROID_SENSOR_TYPES)).toBe(true);
  });
  it('has 12 entries (2 Samsung vendor sensors retired)', () => {
    expect(ANDROID_SENSOR_TYPES).toHaveLength(12);
  });

  const expectedSensors = [
    'accelerometer',
    'gyroscope',
    'magnetometer',
    'gravity',
    'linearAcceleration',
    'rotationVector',
    'stepCounter',
    'light',
    'proximity',
    'significantMotion',
    'tiltDetector',
    'screenOrientation',
  ];
  for (const sensor of expectedSensors) {
    it(`contains sensor "${sensor}"`, () => {
      expect(ANDROID_SENSOR_TYPES.some((s) => s.value === sensor)).toBe(true);
    });
  }

  it('every entry has label string', () => {
    for (const s of ANDROID_SENSOR_TYPES) {
      expect(typeof s.label).toBe('string');
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it('every entry has value string', () => {
    for (const s of ANDROID_SENSOR_TYPES) {
      expect(typeof s.value).toBe('string');
      expect(s.value.length).toBeGreaterThan(0);
    }
  });

  it('values are unique', () => {
    const values = ANDROID_SENSOR_TYPES.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

// =============================================================================
// studyDurationToDays / daysToStudyDuration round-trip
// =============================================================================

describe('studyDurationToDays shape', () => {
  const cases: [{ years: number; months: number; days: number }, number][] = [
    [{ years: 0, months: 0, days: 0 }, 0],
    [{ years: 1, months: 0, days: 0 }, 365],
    [{ years: 0, months: 1, days: 0 }, 30],
    [{ years: 0, months: 0, days: 1 }, 1],
    [{ years: 1, months: 6, days: 15 }, 365 + 180 + 15],
    [{ years: 2, months: 0, days: 0 }, 730],
    [{ years: 0, months: 12, days: 0 }, 360],
    [{ years: 0, months: 0, days: 365 }, 365],
    [{ years: 10, months: 0, days: 0 }, 3650],
  ];

  for (const [duration, expectedDays] of cases) {
    it(`converts ${JSON.stringify(duration)} to ${expectedDays} days`, () => {
      expect(studyDurationToDays(duration)).toBe(expectedDays);
    });
  }
});

describe('daysToStudyDuration shape', () => {
  it('returns object with years, months, days', () => {
    const result = daysToStudyDuration(365);
    expect(typeof result.years).toBe('number');
    expect(typeof result.months).toBe('number');
    expect(typeof result.days).toBe('number');
  });

  it('0 days returns all zeros', () => {
    expect(daysToStudyDuration(0)).toEqual({ years: 0, months: 0, days: 0 });
  });

  it('365 days returns 1 year', () => {
    expect(daysToStudyDuration(365)).toEqual({ years: 1, months: 0, days: 0 });
  });

  it('30 days returns 1 month', () => {
    expect(daysToStudyDuration(30)).toEqual({ years: 0, months: 1, days: 0 });
  });

  it('1 day returns 1 day', () => {
    expect(daysToStudyDuration(1)).toEqual({ years: 0, months: 0, days: 1 });
  });

  it('395 days decomposes correctly', () => {
    const result = daysToStudyDuration(395);
    expect(result.years).toBe(1);
    expect(result.months).toBe(1);
    expect(result.days).toBe(0);
  });
});

// =============================================================================
// getErrorMessage shape
// =============================================================================

describe('getErrorMessage return type', () => {
  it('always returns a string', () => {
    expect(typeof getErrorMessage(null, 'fallback')).toBe('string');
    expect(typeof getErrorMessage(undefined, 'fallback')).toBe('string');
    expect(typeof getErrorMessage({}, 'fallback')).toBe('string');
    expect(typeof getErrorMessage({ data: 'err' }, 'fallback')).toBe('string');
  });

  it('returns fallback for null', () => {
    expect(getErrorMessage(null, 'default')).toBe('default');
  });
  it('returns fallback for undefined', () => {
    expect(getErrorMessage(undefined, 'default')).toBe('default');
  });
  it('returns fallback for empty string', () => {
    expect(getErrorMessage('', 'default')).toBe('default');
  });
  it('returns fallback for number', () => {
    expect(getErrorMessage(42, 'default')).toBe('default');
  });
  it('returns fallback for boolean', () => {
    expect(getErrorMessage(true, 'default')).toBe('default');
  });
  it('returns data string when present', () => {
    expect(getErrorMessage({ data: 'Server error' }, 'default')).toBe('Server error');
  });
  it('returns data.message when data is object', () => {
    expect(getErrorMessage({ data: { message: 'Detailed error' } }, 'default')).toBe('Detailed error');
  });
  it('returns error string for FETCH_ERROR', () => {
    expect(getErrorMessage({ status: 'FETCH_ERROR', error: 'Network failed' }, 'default')).toBe('Network failed');
  });
  it('returns message from Error-like object', () => {
    expect(getErrorMessage({ message: 'Something broke' }, 'default')).toBe('Something broke');
  });
  it('returns status-appended fallback for status-only', () => {
    expect(getErrorMessage({ status: 404 }, 'Not found')).toBe('Not found (status 404)');
  });
  it('returns fallback for empty data string', () => {
    expect(getErrorMessage({ data: '' }, 'default')).toBe('default');
  });
  it('returns fallback for empty message', () => {
    expect(getErrorMessage({ data: { message: '' } }, 'default')).toBe('default');
  });
});

// =============================================================================
// isSentinelDate
// =============================================================================

describe('isSentinelDate', () => {
  const sentinelValues = [
    '+999999999-12-31T23:59:59.999999999',
    '-999999999-01-01T00:00:00',
    '+99999-12-31T23:59:59',
    '99999-01-01T00:00:00',
    '+100000-01-01',
  ];

  for (const val of sentinelValues) {
    it(`detects sentinel date: "${val.slice(0, 30)}"`, () => {
      expect(isSentinelDate(val)).toBe(true);
    });
  }

  const normalValues = ['2024-01-01T00:00:00Z', '2024-12-31', '1999-06-15T12:00:00', '2000-01-01'];

  for (const val of normalValues) {
    it(`does not flag normal date: "${val}"`, () => {
      expect(isSentinelDate(val)).toBe(false);
    });
  }
});

// =============================================================================
// formatDisplayDate / formatDisplayDateTime
// =============================================================================

describe('formatDisplayDate return type', () => {
  it('returns a string for valid date', () => {
    expect(typeof formatDisplayDate('2024-01-15')).toBe('string');
  });
  it('returns the original string for invalid date', () => {
    expect(formatDisplayDate('not-a-date')).toBe('not-a-date');
  });
  it('returns a string for ISO datetime', () => {
    expect(typeof formatDisplayDate('2024-06-15T12:00:00Z')).toBe('string');
  });
  it('does not return empty string for valid input', () => {
    expect(formatDisplayDate('2024-01-01').length).toBeGreaterThan(0);
  });
});

describe('formatDisplayDateTime return type', () => {
  it('returns a string for valid datetime', () => {
    expect(typeof formatDisplayDateTime('2024-01-15T12:30:00Z')).toBe('string');
  });
  it('returns the original string for invalid datetime', () => {
    expect(formatDisplayDateTime('garbage')).toBe('garbage');
  });
  it('returns a string for date-only input', () => {
    expect(typeof formatDisplayDateTime('2024-06-15')).toBe('string');
  });
});

// =============================================================================
// getStartOfDayIso / getEndOfDayIso
// =============================================================================

describe('getStartOfDayIso', () => {
  it('returns ISO string ending in T00:00:00.000Z', () => {
    expect(getStartOfDayIso('2024-01-15')).toBe('2024-01-15T00:00:00.000Z');
  });
  it('works for year boundary', () => {
    expect(getStartOfDayIso('2024-12-31')).toBe('2024-12-31T00:00:00.000Z');
  });
  it('returns a string', () => {
    expect(typeof getStartOfDayIso('2024-06-15')).toBe('string');
  });
  it('throws for invalid date', () => {
    expect(() => getStartOfDayIso('not-a-date')).toThrow();
  });
});

describe('getEndOfDayIso', () => {
  it('returns ISO string ending in T23:59:59.999Z', () => {
    expect(getEndOfDayIso('2024-01-15')).toBe('2024-01-15T23:59:59.999Z');
  });
  it('works for year boundary', () => {
    expect(getEndOfDayIso('2024-12-31')).toBe('2024-12-31T23:59:59.999Z');
  });
  it('returns a string', () => {
    expect(typeof getEndOfDayIso('2024-06-15')).toBe('string');
  });
  it('throws for invalid date', () => {
    expect(() => getEndOfDayIso('garbage')).toThrow();
  });
});
