import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { getStatusVariant } from './participant-status';

const KNOWN_STATUSES = ['ENROLLED', 'PAUSED', 'COLLECTION_COMPLETED', 'NOT_ENROLLED'] as const;
const EXPECTED_VARIANTS = ['success', 'warning', 'default', 'destructive', 'muted'] as const;

const knownStatusArb = fc.constantFrom(...KNOWN_STATUSES);
const knownStatusSet = new Set<string>(KNOWN_STATUSES);
const unknownStatusArb = fc.string().filter((status) => !knownStatusSet.has(status));

describe('getStatusVariant properties', () => {
  it('always returns one of the known variant strings for known statuses', () => {
    fc.assert(
      fc.property(knownStatusArb, (status) => {
        const variant = getStatusVariant(status);
        expect(EXPECTED_VARIANTS).toContain(variant);
      }),
    );
  });

  it('returns "muted" for any unknown status string', () => {
    fc.assert(
      fc.property(unknownStatusArb, (status) => {
        const variant = getStatusVariant(status);
        expect(variant).toBe('muted');
      }),
    );
  });

  it('is a pure function (same input always gives same output)', () => {
    fc.assert(
      fc.property(knownStatusArb, (status) => {
        expect(getStatusVariant(status)).toBe(getStatusVariant(status));
      }),
    );
  });

  it('maps each known status to a distinct variant', () => {
    const variants = KNOWN_STATUSES.map((s) => getStatusVariant(s));
    const unique = new Set(variants);
    expect(unique.size).toBe(KNOWN_STATUSES.length);
  });

  it('never returns "muted" for known statuses', () => {
    fc.assert(
      fc.property(knownStatusArb, (status) => {
        expect(getStatusVariant(status)).not.toBe('muted');
      }),
    );
  });
});
