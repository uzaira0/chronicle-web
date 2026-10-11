import { afterEach, expect, test } from 'bun:test';
import { cleanup, renderHook } from '@testing-library/react';
import { useSubmissionKey } from './use-submission-key';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

test('retains pending submission keys across remounts, isolates resources, and rotates only after acknowledgement', () => {
  const resource = ['study', 'participant', 'TIME_USE_DIARY', '2026-10-07'];
  const first = renderHook(() => useSubmissionKey(resource));
  const key = first.result.current.currentKey();
  expect(first.result.current.currentKey()).toBe(key);
  first.unmount();

  const next = renderHook(({ scope }) => useSubmissionKey(scope), { initialProps: { scope: resource } });
  expect(next.result.current.currentKey()).toBe(key);
  for (const scope of [
    ['study', 'participant', 'TIME_USE_DIARY', '2026-10-08'],
    ['study', 'other-participant', 'TIME_USE_DIARY', '2026-10-07'],
    ['other-study', 'participant', 'TIME_USE_DIARY', '2026-10-07'],
    ['study', 'participant', 'QUESTIONNAIRE', 'questionnaire'],
    ['study', 'participant', 'QUESTIONNAIRE', 'other-questionnaire'],
    ['study', 'participant', 'APP_USAGE', '2026-10-07'],
  ]) {
    next.rerender({ scope });
    const otherKey = next.result.current.currentKey();
    expect(otherKey).not.toBe(key);
    expect(next.result.current.currentKey()).toBe(otherKey);
  }
  next.rerender({ scope: resource });
  expect(next.result.current.currentKey()).toBe(key);
  next.result.current.rotateKey();
  expect(next.result.current.currentKey()).not.toBe(key);
});
