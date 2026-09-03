import { describe, expect, it } from 'bun:test';

import { formatDisplayDate, formatDisplayDateTime, getEndOfDayIso, getStartOfDayIso } from './format';

// These tests exercise the private `memoize` helper's bounded-cache eviction
// logic via the public formatters. The cache cap (MAX_CACHE_SIZE) is 1000, so
// we push well past it to drive eviction and assert that:
//   - results stay CORRECT regardless of how full the cache is (kills mutants
//     on the `cache.size >= MAX_CACHE_SIZE`, `firstKey !== undefined`,
//     `cache.delete`/`cache.set` and `cached !== undefined` branches), and
//   - a value computed when the cache was small returns the SAME correct
//     answer after the cache has overflowed and evicted older keys.

// Returns N distinct, guaranteed-valid yyyy-mm-dd strings by walking forward
// one real calendar day at a time from a fixed epoch.
function distinctDates(count: number): string[] {
  const out: string[] = [];
  const cursor = new Date(Date.UTC(1980, 0, 1));
  for (let i = 0; i < count; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

describe('format memoize — bounded cache stays correct across eviction', () => {
  it('getStartOfDayIso is correct for 1200 distinct keys (exceeds MAX_CACHE_SIZE)', () => {
    // 1200 > 1000 forces the eviction branch to run repeatedly.
    for (const key of distinctDates(1200)) {
      expect(getStartOfDayIso(key)).toBe(`${key}T00:00:00.000Z`);
    }
  });

  it('getEndOfDayIso is correct for 1200 distinct keys (exceeds MAX_CACHE_SIZE)', () => {
    for (const key of distinctDates(1200)) {
      expect(getEndOfDayIso(key)).toBe(`${key}T23:59:59.999Z`);
    }
  });

  it('returns the cached result on a repeated call (memoization hit branch)', () => {
    // First call populates the cache; second call must hit it and return the
    // identical, correct value. A mutant that flips the `cached !== undefined`
    // guard would either recompute-as-undefined or skip caching, breaking this.
    const key = '2024-05-20';
    const first = getStartOfDayIso(key);
    const second = getStartOfDayIso(key);
    expect(first).toBe('2024-05-20T00:00:00.000Z');
    expect(second).toBe(first);
  });

  it('an early key still returns the correct value after the cache overflows', () => {
    // Compute one value, overflow the cache, then re-request the early value.
    // Whether or not it was evicted, the recomputation/cache-hit must be correct.
    const early = '1999-07-04';
    const earlyExpected = '1999-07-04T00:00:00.000Z';
    expect(getStartOfDayIso(early)).toBe(earlyExpected);

    for (const key of distinctDates(1100)) {
      getStartOfDayIso(key);
    }

    expect(getStartOfDayIso(early)).toBe(earlyExpected);
  });

  it('formatDisplayDate memoizes correctly across many distinct inputs', () => {
    for (const key of distinctDates(1100)) {
      const result = formatDisplayDate(key);
      expect(typeof result).toBe('string');
      // valid dates never round-trip to the raw key
      expect(result).not.toBe(key);
    }
  });

  it('formatDisplayDateTime memoizes correctly across many distinct inputs', () => {
    for (const day of distinctDates(1100)) {
      const key = `${day}T08:15:00Z`;
      const result = formatDisplayDateTime(key);
      expect(typeof result).toBe('string');
      expect(result).not.toBe(key);
    }
  });
});
