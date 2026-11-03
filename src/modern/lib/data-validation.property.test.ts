import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';
import { validEmailArb } from '../test/arbitraries';
import { isValidEmail } from './data-validation';

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
