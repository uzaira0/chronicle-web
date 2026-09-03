import { describe, expect, it } from 'bun:test';

import { getStatusVariant } from './participant-status';

describe('getStatusVariant()', () => {
  it('returns "success" for ENROLLED', () => {
    expect(getStatusVariant('ENROLLED')).toBe('success');
  });

  it('returns "warning" for PAUSED', () => {
    expect(getStatusVariant('PAUSED')).toBe('warning');
  });

  it('returns "default" for COLLECTION_COMPLETED', () => {
    expect(getStatusVariant('COLLECTION_COMPLETED')).toBe('default');
  });

  it('returns "destructive" for NOT_ENROLLED', () => {
    expect(getStatusVariant('NOT_ENROLLED')).toBe('destructive');
  });

  it('returns "muted" for UNKNOWN', () => {
    expect(getStatusVariant('UNKNOWN')).toBe('muted');
  });

  it('returns "muted" for any unrecognized status', () => {
    expect(getStatusVariant('SOME_NEW_STATUS')).toBe('muted');
  });

  // --- EXPANDED EDGE CASES ---

  describe('all 5 known statuses explicitly', () => {
    const knownStatuses = [
      ['ENROLLED', 'success'],
      ['PAUSED', 'warning'],
      ['COLLECTION_COMPLETED', 'default'],
      ['NOT_ENROLLED', 'destructive'],
      ['UNKNOWN', 'muted'],
    ] as const;

    it.each(knownStatuses)('%s => %s', (status, expected) => {
      expect(getStatusVariant(status)).toBe(expected);
    });
  });

  describe('invalid/edge-case inputs', () => {
    it('returns "muted" for empty string', () => {
      expect(getStatusVariant('')).toBe('muted');
    });

    it('returns "muted" for null cast as any', () => {
      expect(getStatusVariant(null)).toBe('muted');
    });

    it('returns "muted" for undefined', () => {
      expect(getStatusVariant(undefined)).toBe('muted');
    });

    it('returns "muted" for number 0', () => {
      expect(getStatusVariant(0)).toBe('muted');
    });

    it('returns "muted" for number 1', () => {
      expect(getStatusVariant(1)).toBe('muted');
    });

    it('returns "muted" for lowercase "enrolled"', () => {
      expect(getStatusVariant('enrolled')).toBe('muted');
    });

    it('returns "muted" for lowercase "paused"', () => {
      expect(getStatusVariant('paused')).toBe('muted');
    });

    it('returns "muted" for mixed case "Enrolled"', () => {
      expect(getStatusVariant('Enrolled')).toBe('muted');
    });

    it('returns "muted" for mixed case "Not_Enrolled"', () => {
      expect(getStatusVariant('Not_Enrolled')).toBe('muted');
    });

    it('returns "muted" for random string', () => {
      expect(getStatusVariant('ACTIVE')).toBe('muted');
    });

    it('returns "muted" for string with spaces', () => {
      expect(getStatusVariant(' ENROLLED ')).toBe('muted');
    });

    it('returns "muted" for boolean true', () => {
      expect(getStatusVariant(true)).toBe('muted');
    });

    it('returns "muted" for boolean false', () => {
      expect(getStatusVariant(false)).toBe('muted');
    });
  });
});
