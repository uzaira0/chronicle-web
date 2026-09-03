import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { getErrorMessage } from './errors';

const errorArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.record({ data: fc.oneof(fc.string(), fc.record({ message: fc.string() })) }),
  fc.record({ error: fc.string() }),
  fc.record({ message: fc.string() }),
  fc.record({ status: fc.oneof(fc.integer(), fc.string()) }),
);

const fallbackArb = fc.string({ minLength: 1, maxLength: 100 });
const displayableMessageArb = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:;!?_-'), {
    maxLength: 199,
  })
  .map((characters) => `E${characters.join('')}`);

describe('getErrorMessage properties', () => {
  it('always returns a string', () => {
    fc.assert(
      fc.property(errorArb, fallbackArb, (error, fallback) => {
        const result = getErrorMessage(error, fallback);
        expect(typeof result).toBe('string');
      }),
    );
  });

  it('never returns undefined', () => {
    fc.assert(
      fc.property(errorArb, fallbackArb, (error, fallback) => {
        expect(getErrorMessage(error, fallback)).toBeDefined();
      }),
    );
  });

  it('result length is finite', () => {
    fc.assert(
      fc.property(errorArb, fallbackArb, (error, fallback) => {
        const result = getErrorMessage(error, fallback);
        expect(Number.isFinite(result.length)).toBe(true);
      }),
    );
  });

  it('returns fallback for null input', () => {
    fc.assert(
      fc.property(fallbackArb, (fallback) => {
        expect(getErrorMessage(null, fallback)).toBe(fallback);
      }),
    );
  });

  it('returns fallback for undefined input', () => {
    fc.assert(
      fc.property(fallbackArb, (fallback) => {
        expect(getErrorMessage(undefined, fallback)).toBe(fallback);
      }),
    );
  });

  it('returns fallback for numeric input', () => {
    fc.assert(
      fc.property(fc.integer(), fallbackArb, (error, fallback) => {
        expect(getErrorMessage(error, fallback)).toBe(fallback);
      }),
    );
  });

  it('returns fallback for boolean input', () => {
    fc.assert(
      fc.property(fc.boolean(), fallbackArb, (error, fallback) => {
        expect(getErrorMessage(error, fallback)).toBe(fallback);
      }),
    );
  });

  it('returns fallback for string input', () => {
    fc.assert(
      fc.property(fc.string(), fallbackArb, (error, fallback) => {
        expect(getErrorMessage(error, fallback)).toBe(fallback);
      }),
    );
  });

  it('for {data: displayableString}, returns that string', () => {
    fc.assert(
      fc.property(displayableMessageArb, fallbackArb, (data, fallback) => {
        expect(getErrorMessage({ data }, fallback)).toBe(data);
      }),
    );
  });

  it('for {data: {message: displayableString}}, returns that message', () => {
    fc.assert(
      fc.property(displayableMessageArb, fallbackArb, (msg, fallback) => {
        expect(getErrorMessage({ data: { message: msg } }, fallback)).toBe(msg);
      }),
    );
  });

  it('for {error: displayableString}, returns that error string', () => {
    fc.assert(
      fc.property(displayableMessageArb, fallbackArb, (err, fallback) => {
        expect(getErrorMessage({ error: err }, fallback)).toBe(err);
      }),
    );
  });

  it('for {message: displayableString}, returns that message', () => {
    fc.assert(
      fc.property(displayableMessageArb, fallbackArb, (msg, fallback) => {
        expect(getErrorMessage({ message: msg }, fallback)).toBe(msg);
      }),
    );
  });

  it('for {status: number}, result contains that number as substring', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 599 }), fallbackArb, (status, fallback) => {
        const result = getErrorMessage({ status }, fallback);
        expect(result).toContain(String(status));
      }),
    );
  });

  it('for {status: string}, result contains that string as substring', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 30 }), fallbackArb, (status, fallback) => {
        const result = getErrorMessage({ status }, fallback);
        expect(result).toContain(status);
      }),
    );
  });

  it('is a pure function (same input produces same output)', () => {
    fc.assert(
      fc.property(errorArb, fallbackArb, (error, fallback) => {
        expect(getErrorMessage(error, fallback)).toBe(getErrorMessage(error, fallback));
      }),
    );
  });

  it('does not mutate the fallback string', () => {
    fc.assert(
      fc.property(errorArb, fallbackArb, (error, fallback) => {
        const original = fallback;
        getErrorMessage(error, fallback);
        expect(fallback).toBe(original);
      }),
    );
  });

  it('for empty object {}, returns fallback', () => {
    fc.assert(
      fc.property(fallbackArb, (fallback) => {
        expect(getErrorMessage({}, fallback)).toBe(fallback);
      }),
    );
  });

  it('for {data: ""}, returns fallback (empty data string not used)', () => {
    fc.assert(
      fc.property(fallbackArb, (fallback) => {
        expect(getErrorMessage({ data: '' }, fallback)).toBe(fallback);
      }),
    );
  });

  it('for {data: {message: ""}}, returns fallback (empty message not used)', () => {
    fc.assert(
      fc.property(fallbackArb, (fallback) => {
        expect(getErrorMessage({ data: { message: '' } }, fallback)).toBe(fallback);
      }),
    );
  });

  it('data field takes priority over error field', () => {
    fc.assert(
      fc.property(displayableMessageArb, displayableMessageArb, fallbackArb, (data, error, fallback) => {
        const result = getErrorMessage({ data, error }, fallback);
        expect(result).toBe(data);
      }),
    );
  });

  it('data.message takes priority over error field', () => {
    fc.assert(
      fc.property(displayableMessageArb, displayableMessageArb, fallbackArb, (msg, error, fallback) => {
        const result = getErrorMessage({ data: { message: msg }, error }, fallback);
        expect(result).toBe(msg);
      }),
    );
  });

  it('error field takes priority over message field', () => {
    fc.assert(
      fc.property(displayableMessageArb, displayableMessageArb, fallbackArb, (error, message, fallback) => {
        const result = getErrorMessage({ error, message }, fallback);
        expect(result).toBe(error);
      }),
    );
  });

  it('error field takes priority over status field', () => {
    fc.assert(
      fc.property(displayableMessageArb, fc.integer(), fallbackArb, (error, status, fallback) => {
        const result = getErrorMessage({ error, status }, fallback);
        expect(result).toBe(error);
      }),
    );
  });

  it('message field takes priority over status field', () => {
    fc.assert(
      fc.property(displayableMessageArb, fc.integer(), fallbackArb, (message, status, fallback) => {
        const result = getErrorMessage({ message, status }, fallback);
        expect(result).toBe(message);
      }),
    );
  });

  it('never returns an HTML document supplied as response data', () => {
    fc.assert(
      fc.property(fallbackArb, (fallback) => {
        const html = '<!doctype html><html><body>proxy fallback</body></html>';
        expect(getErrorMessage({ data: html }, fallback)).toBe(fallback);
      }),
    );
  });

  it('never returns oversized response data', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1_001, max: 2_000 }), fallbackArb, (length, fallback) => {
        expect(getErrorMessage({ data: 'x'.repeat(length) }, fallback)).toBe(fallback);
      }),
    );
  });

  it('result is always a valid non-null string type', () => {
    fc.assert(
      fc.property(fc.anything(), fallbackArb, (error, fallback) => {
        const result = getErrorMessage(error, fallback);
        expect(result !== null && result !== undefined && typeof result === 'string').toBe(true);
      }),
    );
  });
});
