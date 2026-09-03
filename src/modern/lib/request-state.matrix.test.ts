import { describe, expect, it } from 'bun:test';
import { getMutationRequestState, REQUEST_STATES } from './request-state';

function expectedRequestState({
  isError,
  isLoading,
  isSuccess,
}: {
  isError: boolean;
  isLoading: boolean;
  isSuccess: boolean;
}) {
  if (isLoading) return REQUEST_STATES.PENDING;
  if (isSuccess) return REQUEST_STATES.SUCCESS;
  if (isError) return REQUEST_STATES.FAILURE;
  return REQUEST_STATES.STANDBY;
}

// ─── getMutationRequestState — all boolean combinations ──────
// 2 x 2 x 2 = 8 tests
describe('getMutationRequestState — all boolean combinations', () => {
  const bools = [true, false];
  for (const isLoading of bools) {
    for (const isSuccess of bools) {
      for (const isError of bools) {
        it(`isLoading=${isLoading} isSuccess=${isSuccess} isError=${isError}`, () => {
          const result = getMutationRequestState({ isLoading, isSuccess, isError });
          expect(result).toBe(expectedRequestState({ isError, isLoading, isSuccess }));
        });
      }
    }
  }
});

// ─── REQUEST_STATES values ───────────────────────────────────
// 4 tests
describe('REQUEST_STATES constant values', () => {
  const expected = [
    ['FAILURE', 'FAILURE'],
    ['PENDING', 'PENDING'],
    ['STANDBY', 'STANDBY'],
    ['SUCCESS', 'SUCCESS'],
  ] as const;
  for (const [key, value] of expected) {
    it(`REQUEST_STATES.${key} = "${value}"`, () => {
      expect(REQUEST_STATES[key]).toBe(value);
    });
  }
});
