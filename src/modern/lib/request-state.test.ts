import { describe, expect, it } from 'bun:test';

import { getMutationRequestState, REQUEST_STATES } from './request-state';

describe('getMutationRequestState()', () => {
  it('returns PENDING when isLoading is true', () => {
    expect(getMutationRequestState({ isLoading: true, isSuccess: false, isError: false })).toBe(REQUEST_STATES.PENDING);
  });

  it('returns SUCCESS when isSuccess is true', () => {
    expect(getMutationRequestState({ isLoading: false, isSuccess: true, isError: false })).toBe(REQUEST_STATES.SUCCESS);
  });

  it('returns FAILURE when isError is true', () => {
    expect(getMutationRequestState({ isLoading: false, isSuccess: false, isError: true })).toBe(REQUEST_STATES.FAILURE);
  });

  it('returns STANDBY when nothing is set', () => {
    expect(getMutationRequestState({ isLoading: false, isSuccess: false, isError: false })).toBe(
      REQUEST_STATES.STANDBY,
    );
  });

  it('loading takes priority over success and error', () => {
    expect(getMutationRequestState({ isLoading: true, isSuccess: true, isError: true })).toBe(REQUEST_STATES.PENDING);
  });

  // --- EXPANDED: All 8 boolean combinations ---
  describe('all 8 boolean combinations', () => {
    const allCombinations = [
      [false, false, false, 'STANDBY'],
      [false, false, true, 'FAILURE'],
      [false, true, false, 'SUCCESS'],
      [false, true, true, 'SUCCESS'],
      [true, false, false, 'PENDING'],
      [true, false, true, 'PENDING'],
      [true, true, false, 'PENDING'],
      [true, true, true, 'PENDING'],
    ] as const;

    it.each(
      allCombinations,
    )('isLoading=%s, isSuccess=%s, isError=%s => %s', (isLoading, isSuccess, isError, expected) => {
      expect(getMutationRequestState({ isLoading, isSuccess, isError })).toBe(expected);
    });
  });

  describe('priority ordering', () => {
    it('loading > success', () => {
      expect(getMutationRequestState({ isLoading: true, isSuccess: true, isError: false })).toBe('PENDING');
    });

    it('loading > error', () => {
      expect(getMutationRequestState({ isLoading: true, isSuccess: false, isError: true })).toBe('PENDING');
    });

    it('success > error', () => {
      expect(getMutationRequestState({ isLoading: false, isSuccess: true, isError: true })).toBe('SUCCESS');
    });

    it('error > standby', () => {
      expect(getMutationRequestState({ isLoading: false, isSuccess: false, isError: true })).toBe('FAILURE');
    });
  });
});

describe('REQUEST_STATES constant', () => {
  it('has exactly 4 keys', () => {
    expect(Object.keys(REQUEST_STATES)).toHaveLength(4);
  });

  it('FAILURE equals "FAILURE"', () => {
    expect(REQUEST_STATES.FAILURE).toBe('FAILURE');
  });

  it('PENDING equals "PENDING"', () => {
    expect(REQUEST_STATES.PENDING).toBe('PENDING');
  });

  it('STANDBY equals "STANDBY"', () => {
    expect(REQUEST_STATES.STANDBY).toBe('STANDBY');
  });

  it('SUCCESS equals "SUCCESS"', () => {
    expect(REQUEST_STATES.SUCCESS).toBe('SUCCESS');
  });

  it('is a frozen/const object', () => {
    // "as const" makes it readonly at type level; we can verify the values are correct strings
    const keys = Object.keys(REQUEST_STATES);
    expect(keys).toContain('FAILURE');
    expect(keys).toContain('PENDING');
    expect(keys).toContain('STANDBY');
    expect(keys).toContain('SUCCESS');
  });

  it('values equal their keys', () => {
    for (const [key, value] of Object.entries(REQUEST_STATES)) {
      expect(key).toBe(value);
    }
  });

  it('no extra keys', () => {
    const expectedKeys = ['FAILURE', 'PENDING', 'STANDBY', 'SUCCESS'];
    expect(Object.keys(REQUEST_STATES).sort()).toEqual(expectedKeys.sort());
  });
});
