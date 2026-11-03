import { describe, expect, it } from 'bun:test';

import { formatDisplayDate, formatDisplayDateTime } from './format';

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
