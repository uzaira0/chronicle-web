import { afterEach, expect, test } from 'bun:test';
import { anySignal } from './request-timeout';

// happy-dom inherits AbortSignal.any; shadowing it with an own property simulates an older browser.
afterEach(() => {
  Reflect.deleteProperty(AbortSignal, 'any');
});

test.each([
  ['native', true],
  ['fallback', false],
])('anySignal aborts with the first signal’s reason (%s)', (_name, native) => {
  if (!native) Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
  expect(typeof AbortSignal.any === 'function').toBe(native);
  const first = new AbortController();
  const second = new AbortController();
  const combined = anySignal([first.signal, second.signal]);
  expect(combined.aborted).toBe(false);
  second.abort('second');
  first.abort('first');
  expect(combined.aborted).toBe(true);
  expect(combined.reason).toBe('second');
  expect(anySignal([AbortSignal.abort('done')]).reason).toBe('done');
});
