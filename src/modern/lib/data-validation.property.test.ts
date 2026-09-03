import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { validEmailArb, validIsoDateArb, validIsoDateTimeArb, validUuidArb } from '../test/arbitraries';
import { isValidEmail, isValidIsoDate, isValidIsoDateTime, isValidUUID } from './data-validation';

// ---------------------------------------------------------------------------
// UUID validation properties
// ---------------------------------------------------------------------------

describe('isValidUUID properties', () => {
  it('accepts all well-formed UUIDs (lowercase hex)', () => {
    fc.assert(
      fc.property(validUuidArb, (uuid) => {
        expect(isValidUUID(uuid)).toBe(true);
      }),
    );
  });

  it('is case-insensitive', () => {
    fc.assert(
      fc.property(validUuidArb, (uuid) => {
        expect(isValidUUID(uuid.toUpperCase())).toBe(true);
        expect(isValidUUID(uuid.toLowerCase())).toBe(true);
      }),
    );
  });

  it('rejects strings without hyphens in the right places', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9a-f]{32}$/), (hex) => {
        // A 32-char hex string without hyphens should be rejected
        expect(isValidUUID(hex)).toBe(false);
      }),
    );
  });

  it('always returns a boolean', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = isValidUUID(input);
        expect(typeof result).toBe('boolean');
      }),
    );
  });

  it('is idempotent (calling twice gives the same result)', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(isValidUUID(input)).toBe(isValidUUID(input));
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ISO date validation properties
// ---------------------------------------------------------------------------

describe('isValidIsoDate properties', () => {
  it('accepts all well-formed YYYY-MM-DD dates', () => {
    fc.assert(
      fc.property(validIsoDateArb, (date) => {
        expect(isValidIsoDate(date)).toBe(true);
      }),
    );
  });

  it('rejects dates with time components appended', () => {
    fc.assert(
      fc.property(validIsoDateArb, (date) => {
        expect(isValidIsoDate(`${date}T00:00:00`)).toBe(false);
      }),
    );
  });

  it('rejects arbitrary strings overwhelmingly', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 5 }), (input) => {
        // Short strings can never match YYYY-MM-DD (10 chars)
        expect(isValidIsoDate(input)).toBe(false);
      }),
    );
  });

  it('always returns a boolean', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(typeof isValidIsoDate(input)).toBe('boolean');
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// ISO datetime validation properties
// ---------------------------------------------------------------------------

describe('isValidIsoDateTime properties', () => {
  it('accepts all well-formed ISO datetime strings', () => {
    fc.assert(
      fc.property(validIsoDateTimeArb, (dateTime) => {
        expect(isValidIsoDateTime(dateTime)).toBe(true);
      }),
    );
  });

  it('rejects plain dates (no time component)', () => {
    fc.assert(
      fc.property(validIsoDateArb, (date) => {
        expect(isValidIsoDateTime(date)).toBe(false);
      }),
    );
  });

  it('always returns a boolean', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(typeof isValidIsoDateTime(input)).toBe('boolean');
      }),
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(isValidIsoDateTime(input)).toBe(isValidIsoDateTime(input));
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Email validation properties
// ---------------------------------------------------------------------------

describe('isValidEmail properties', () => {
  it('accepts well-formed email addresses', () => {
    fc.assert(
      fc.property(validEmailArb, (email) => {
        expect(isValidEmail(email)).toBe(true);
      }),
    );
  });

  it('rejects strings without an @ sign', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !s.includes('@')),
        (input) => {
          expect(isValidEmail(input)).toBe(false);
        },
      ),
    );
  });

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false);
  });

  it('always returns a boolean', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(typeof isValidEmail(input)).toBe('boolean');
      }),
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(isValidEmail(input)).toBe(isValidEmail(input));
      }),
    );
  });
});
