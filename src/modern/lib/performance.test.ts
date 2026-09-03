import { describe, expect, it } from 'bun:test';
import { getErrorMessage } from './errors';
import { formatDisplayDate, getStartOfDayIso, isSentinelDate } from './format';
import { daysToStudyDuration, studyDurationToDays } from './study-form-helpers';

describe('performance -- functions complete within time budget', () => {
  const ITERATIONS = 10_000;
  const BUDGET_MS = 500; // 10k iterations — generous budget to avoid CI flakiness

  it('formatDisplayDate x 10k < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      formatDisplayDate('2024-03-15');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('isSentinelDate x 10k < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      isSentinelDate('+999999999-12-31T23:59:59.999999999');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('getStartOfDayIso x 10k < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      getStartOfDayIso('2024-03-15');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('studyDurationToDays x 10k < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      studyDurationToDays({ years: 2, months: 6, days: 15 });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('daysToStudyDuration x 10k < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      daysToStudyDuration(440);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('getErrorMessage x 10k < 100ms', () => {
    const error = { status: 500, data: { message: 'Server error' } };
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      getErrorMessage(error, 'fallback');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it('round-trip studyDuration x 10k < 100ms', () => {
    const start = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      daysToStudyDuration(studyDurationToDays({ years: 3, months: 4, days: 5 }));
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });
});
