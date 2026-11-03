import { describe, expect, test } from 'bun:test';

import type { AppUsageDayApp } from '@/state/study-operations-api';
import {
  buildHourlySubmission,
  getTimeRange,
  groupByHourly,
  HOURLY_SURVEY_USER,
  hourlyNextStep,
  hourlyPrevStep,
  isHourlyFinalStep,
  mergeSelections,
  remainingRanges,
  sortedBucketRanges,
} from './hourly-survey-core';

/** One app with a one-hour block starting at each of [starts] (UTC). */
const app = (pkg: string, label: string, ...starts: string[]): AppUsageDayApp => ({
  appLabel: label,
  appPackageName: pkg,
  blocks: starts.map((start) => ({ end: new Date(Date.parse(start) + 3_600_000).toISOString(), start })),
});

function must<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('expected a defined value');
  }
  return value;
}

describe('getTimeRange — hour-aligned, tz-aware bucket labels', () => {
  test('UTC mid-hour buckets to the hour window', () => {
    expect(getTimeRange('2024-01-15T09:30:00.000Z', 'UTC')).toBe('9am - 10am');
    expect(getTimeRange('2024-01-15T00:05:00.000Z', 'UTC')).toBe('12am - 1am');
    expect(getTimeRange('2024-01-15T23:15:00.000Z', 'UTC')).toBe('11pm - 12am');
  });

  test('the bucket is computed in the record timezone', () => {
    // 09:30 UTC is 04:30 in New York (EST, -05:00)
    expect(getTimeRange('2024-01-15T09:30:00.000Z', 'America/New_York')).toBe('4am - 5am');
  });

  test('a bad/missing timezone falls back to UTC rather than throwing', () => {
    expect(getTimeRange('2024-01-15T09:30:00.000Z', 'Not/AZone')).toBe('9am - 10am');
    expect(getTimeRange('2024-01-15T09:30:00.000Z', '')).toBe('9am - 10am');
  });
});

describe('groupByHourly + sortedBucketRanges', () => {
  test('groups by package, keeps the label, buckets by study-zone hour, and sorts chronologically', () => {
    const grouped = groupByHourly(
      [
        app('com.a', 'A', '2024-01-15T10:00:00.000Z', '2024-01-15T09:00:00.000Z'),
        app('com.b', 'B', '2024-01-15T21:00:00.000Z'),
      ],
      'UTC',
    );
    expect(Object.keys(grouped).sort()).toEqual(['com.a', 'com.b']);
    expect(grouped['com.a']?.appLabel).toBe('A');
    // chronological, not lexical ("10am" must not sort before "9am")
    expect(sortedBucketRanges(must(grouped['com.a']))).toEqual(['9am - 10am', '10am - 11am']);
    expect(sortedBucketRanges(must(grouped['com.b']))).toEqual(['9pm - 10pm']);
  });

  test('asks only unanswered blocks, and leaves out an app whose blocks are all answered', () => {
    const answered = app('com.a', 'A', '2024-01-15T09:00:00.000Z', '2024-01-15T10:00:00.000Z');
    const [first, second] = answered.blocks;
    const grouped = groupByHourly(
      [
        { ...answered, blocks: [{ ...must(first), users: [] }, must(second)] },
        {
          ...app('com.b', 'B', '2024-01-15T09:00:00.000Z'),
          blocks: [{ ...must(app('', '', '2024-01-15T09:00:00.000Z').blocks[0]), users: ['Target Child'] }],
        },
      ],
      'UTC',
    );
    expect(Object.keys(grouped)).toEqual(['com.a']);
    expect(sortedBucketRanges(must(grouped['com.a']))).toEqual(['10am - 11am']);
  });

  // America/Santiago leaves DST at 24:00 on 2026-04-04: 23:00-24:00 happens twice, and both hours are asked.
  test('a repeated hour on the DST day gets two distinguishable buckets', () => {
    const grouped = groupByHourly(
      [app('com.a', 'A', '2026-04-05T02:00:00.000Z', '2026-04-05T03:00:00.000Z')],
      'America/Santiago',
    );
    const ranges = sortedBucketRanges(must(grouped['com.a']));
    expect(ranges).toHaveLength(2);
    expect(new Set(ranges).size).toBe(2);
  });

  // A zone this browser's Intl does not know falls back to UTC hours; two blocks in one UTC hour are still both asked.
  test('an unknown zone still asks every block when two share an hour label', () => {
    const grouped = groupByHourly(
      [app('com.a', 'A', '2026-04-05T02:00:00.000Z', '2026-04-05T02:30:00.000Z')],
      'Not/AZone',
    );
    expect(Object.values(must(grouped['com.a']).buckets).sort()).toEqual([
      '2026-04-05T02:00:00.000Z',
      '2026-04-05T02:30:00.000Z',
    ]);
  });
});

describe('wizard step machine', () => {
  test('forward flow with shared apps walks every step then submits', () => {
    expect(hourlyNextStep('intro', true)).toBe('selectChildApps');
    expect(hourlyNextStep('selectChildApps', true)).toBe('selectSharedApps');
    expect(hourlyNextStep('selectSharedApps', true)).toBe('resolveSharedApps');
    expect(hourlyNextStep('resolveSharedApps', true)).toBe('resolveOtherApps');
    expect(hourlyNextStep('resolveOtherApps', true)).toBeNull();
  });

  test('no shared apps short-circuits to submit after the shared-apps step', () => {
    expect(hourlyNextStep('selectSharedApps', false)).toBeNull();
    expect(isHourlyFinalStep('selectSharedApps', false)).toBe(true);
    expect(isHourlyFinalStep('selectSharedApps', true)).toBe(false);
    expect(isHourlyFinalStep('intro', false)).toBe(false);
    expect(isHourlyFinalStep('resolveOtherApps', true)).toBe(true);
  });

  test('prev walks back and stops at intro', () => {
    expect(hourlyPrevStep('resolveOtherApps')).toBe('resolveSharedApps');
    expect(hourlyPrevStep('selectChildApps')).toBe('intro');
    expect(hourlyPrevStep('intro')).toBeNull();
  });
});

describe('mergeSelections + remainingRanges (primary + remaining passes)', () => {
  test('remainingRanges excludes buckets already chosen in the primary pass', () => {
    const grouped = groupByHourly(
      [app('com.a', 'A', '2024-01-15T09:00:00.000Z', '2024-01-15T10:00:00.000Z', '2024-01-15T11:00:00.000Z')],
      'UTC',
    );
    expect(remainingRanges(must(grouped['com.a']), new Set(['9am - 10am']))).toEqual(['10am - 11am', '11am - 12pm']);
  });

  test('mergeSelections unions per app', () => {
    const merged = mergeSelections(
      { 'com.a': new Set(['9am - 10am']) },
      { 'com.a': new Set(['10am - 11am']), 'com.b': new Set(['1pm - 2pm']) },
    );
    expect([...must(merged['com.a'])].sort()).toEqual(['10am - 11am', '9am - 10am']);
    expect([...must(merged['com.b'])]).toEqual(['1pm - 2pm']);
  });
});

describe('buildHourlySubmission — every asked block gets an answer', () => {
  test('child-only apps and selected shared hours are the child; every other asked hour is no one', () => {
    const grouped = groupByHourly(
      [
        app('com.child', 'Child', '2024-01-15T09:00:00.000Z', '2024-01-15T14:00:00.000Z'),
        app('com.shared', 'Shared', '2024-01-15T09:00:00.000Z', '2024-01-15T10:00:00.000Z'),
        app('com.untouched', 'Untouched', '2024-01-15T11:00:00.000Z'),
      ],
      'UTC',
    );

    const submission = buildHourlySubmission(grouped, new Set(['com.child']), {
      'com.shared': new Set(['9am - 10am']),
    });

    const rows = submission.map((row) => `${row.appPackageName}@${row.blockStart}=${row.users.join('|')}`).sort();
    expect(rows).toEqual([
      `com.child@2024-01-15T09:00:00.000Z=${HOURLY_SURVEY_USER}`,
      `com.child@2024-01-15T14:00:00.000Z=${HOURLY_SURVEY_USER}`,
      `com.shared@2024-01-15T09:00:00.000Z=${HOURLY_SURVEY_USER}`,
      'com.shared@2024-01-15T10:00:00.000Z=',
      'com.untouched@2024-01-15T11:00:00.000Z=',
    ]);
  });

  test('an app that is both child-only and in shared selections is answered once per hour', () => {
    const grouped = groupByHourly(
      [app('com.dup', 'Dup', '2024-01-15T09:00:00.000Z', '2024-01-15T10:00:00.000Z')],
      'UTC',
    );
    const submission = buildHourlySubmission(grouped, new Set(['com.dup']), { 'com.dup': new Set(['9am - 10am']) });
    expect(submission).toHaveLength(2);
  });
});
