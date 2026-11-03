import { describe, expect, it } from 'bun:test';
import { PARTICIPATION_STATUS, PARTICIPATION_STATUSES } from '@/generated/chronicle-contracts';
import { ENROLLMENT_TRANSITIONS, getStatusVariant } from './participant-status';

describe('getStatusVariant()', () => {
  it('returns "success" for ENROLLED', () => {
    expect(getStatusVariant(PARTICIPATION_STATUS.ENROLLED)).toBe('success');
  });

  it('returns "warning" for PAUSED', () => {
    expect(getStatusVariant(PARTICIPATION_STATUS.PAUSED)).toBe('warning');
  });

  it('returns "default" for COLLECTION_COMPLETED', () => {
    expect(getStatusVariant(PARTICIPATION_STATUS.COLLECTION_COMPLETED)).toBe('default');
  });

  // Not enrolled is an ordinary lifecycle state; the red channel is kept for loss.
  it('returns "outline" for NOT_ENROLLED', () => {
    expect(getStatusVariant(PARTICIPATION_STATUS.NOT_ENROLLED)).toBe('outline');
  });

  it('returns "muted" for UNKNOWN', () => {
    expect(getStatusVariant(PARTICIPATION_STATUS.UNKNOWN)).toBe('muted');
  });

  it('returns "muted" for any unrecognized status', () => {
    expect(getStatusVariant('SOME_NEW_STATUS')).toBe('muted');
  });

  // --- EXPANDED EDGE CASES ---

  describe('all 5 known statuses explicitly', () => {
    const knownStatuses = [
      [PARTICIPATION_STATUS.ENROLLED, 'success'],
      [PARTICIPATION_STATUS.PAUSED, 'warning'],
      [PARTICIPATION_STATUS.COLLECTION_COMPLETED, 'default'],
      [PARTICIPATION_STATUS.NOT_ENROLLED, 'outline'],
      [PARTICIPATION_STATUS.UNKNOWN, 'muted'],
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

it.each([...PARTICIPATION_STATUSES])('every enrollment transition has explicit consequences: %s', (status) => {
  const [primary, ...others] = ENROLLMENT_TRANSITIONS[status];
  for (const transition of [primary, ...others]) {
    expect(transition.target).not.toBe(status);
    if (transition.target === PARTICIPATION_STATUS.ENROLLED)
      expect(transition.consequenceKey).toBe('change_enrollment.resume_confirmation');
    if (transition.target === PARTICIPATION_STATUS.NOT_ENROLLED)
      expect(transition.consequenceKey).toBe('change_enrollment.not_enrolled_consequence');
  }
  if (status === PARTICIPATION_STATUS.ENROLLED) expect(primary.target).toBe(PARTICIPATION_STATUS.PAUSED);
});
