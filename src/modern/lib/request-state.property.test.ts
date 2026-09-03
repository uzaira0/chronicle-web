import { describe, expect, it } from 'bun:test';
import fc from 'fast-check';

import { getMutationRequestState, REQUEST_STATES } from './request-state';

const boolTriple = fc.record({
  isError: fc.boolean(),
  isLoading: fc.boolean(),
  isSuccess: fc.boolean(),
});

const validStates = ['FAILURE', 'PENDING', 'STANDBY', 'SUCCESS'];

describe('request-state properties', () => {
  it('getMutationRequestState always returns one of the 4 valid states', () => {
    fc.assert(
      fc.property(boolTriple, (opts) => {
        const result = getMutationRequestState(opts);
        expect(validStates).toContain(result);
      }),
    );
  });

  it('loading always takes priority (isLoading=true yields PENDING)', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (isError, isSuccess) => {
        const result = getMutationRequestState({ isError, isLoading: true, isSuccess });
        expect(result).toBe('PENDING');
      }),
    );
  });

  it('success takes priority over error when not loading', () => {
    fc.assert(
      fc.property(fc.boolean(), (isError) => {
        const result = getMutationRequestState({ isError, isLoading: false, isSuccess: true });
        expect(result).toBe('SUCCESS');
      }),
    );
  });

  it('when nothing is true, result is STANDBY', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const result = getMutationRequestState({ isError: false, isLoading: false, isSuccess: false });
        expect(result).toBe('STANDBY');
      }),
    );
  });

  it('when only isError is true, result is FAILURE', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const result = getMutationRequestState({ isError: true, isLoading: false, isSuccess: false });
        expect(result).toBe('FAILURE');
      }),
    );
  });

  it('result is always a string', () => {
    fc.assert(
      fc.property(boolTriple, (opts) => {
        expect(typeof getMutationRequestState(opts)).toBe('string');
      }),
    );
  });

  it('result is always one of the keys in REQUEST_STATES', () => {
    fc.assert(
      fc.property(boolTriple, (opts) => {
        const result = getMutationRequestState(opts);
        expect(Object.keys(REQUEST_STATES)).toContain(result);
      }),
    );
  });

  it('REQUEST_STATES has exactly 4 keys', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(Object.keys(REQUEST_STATES).length).toBe(4);
      }),
    );
  });

  it('each key in REQUEST_STATES equals its value', () => {
    fc.assert(
      fc.property(fc.constantFrom(...(Object.keys(REQUEST_STATES) as (keyof typeof REQUEST_STATES)[])), (key) => {
        expect(REQUEST_STATES[key]).toBe(key);
      }),
    );
  });

  it('getMutationRequestState is deterministic', () => {
    fc.assert(
      fc.property(boolTriple, (opts) => {
        expect(getMutationRequestState(opts)).toBe(getMutationRequestState(opts));
      }),
    );
  });

  it('result is never an empty string', () => {
    fc.assert(
      fc.property(boolTriple, (opts) => {
        expect(getMutationRequestState(opts).length).toBeGreaterThan(0);
      }),
    );
  });

  it('result is always uppercase', () => {
    fc.assert(
      fc.property(boolTriple, (opts) => {
        const result = getMutationRequestState(opts);
        expect(result).toBe(result.toUpperCase() as typeof result);
      }),
    );
  });

  it('REQUEST_STATES values are all in the valid states set', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.values(REQUEST_STATES)), (value) => {
        expect(validStates).toContain(value);
      }),
    );
  });

  it('PENDING result implies isLoading was true', () => {
    fc.assert(
      fc.property(boolTriple, (opts) => {
        const result = getMutationRequestState(opts);
        if (result === 'PENDING') {
          expect(opts.isLoading).toBe(true);
        }
      }),
    );
  });

  it('FAILURE result implies isError was true and isLoading and isSuccess were false', () => {
    fc.assert(
      fc.property(boolTriple, (opts) => {
        const result = getMutationRequestState(opts);
        if (result === 'FAILURE') {
          expect(opts.isError).toBe(true);
          expect(opts.isLoading).toBe(false);
          expect(opts.isSuccess).toBe(false);
        }
      }),
    );
  });
});
