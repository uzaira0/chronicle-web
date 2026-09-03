import { describe, expect, test } from 'bun:test';

import type { AppUsageEntry } from '@/state/study-operations-api';
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

const entry = (pkg: string, label: string, isoUtc: string): AppUsageEntry => ({
  appLabel: label,
  appPackageName: pkg,
  eventType: 1,
  timestamp: isoUtc,
  timezone: 'UTC',
  uploadedAt: null,
  users: [],
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
  test('groups by package, hoists the label, buckets by hour, and sorts chronologically', () => {
    const grouped = groupByHourly([
      entry('com.a', 'A', '2024-01-15T10:00:00.000Z'),
      entry('com.a', 'A', '2024-01-15T09:00:00.000Z'),
      entry('com.b', 'B', '2024-01-15T21:00:00.000Z'),
    ]);
    expect(Object.keys(grouped).sort()).toEqual(['com.a', 'com.b']);
    expect(grouped['com.a']?.appLabel).toBe('A');
    // chronological, not lexical ("10am" must not sort before "9am")
    expect(sortedBucketRanges(must(grouped['com.a']))).toEqual(['9am - 10am', '10am - 11am']);
    expect(sortedBucketRanges(must(grouped['com.b']))).toEqual(['9pm - 10pm']);
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
    const grouped = groupByHourly([
      entry('com.a', 'A', '2024-01-15T09:00:00.000Z'),
      entry('com.a', 'A', '2024-01-15T10:00:00.000Z'),
      entry('com.a', 'A', '2024-01-15T11:00:00.000Z'),
    ]);
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

describe('buildHourlySubmission — child-only all buckets + shared selected buckets', () => {
  test('emits every child-only record and only selected shared buckets, stamped Target Child', () => {
    const grouped = groupByHourly([
      entry('com.child', 'Child', '2024-01-15T09:30:00.000Z'),
      entry('com.child', 'Child', '2024-01-15T14:30:00.000Z'),
      entry('com.shared', 'Shared', '2024-01-15T09:30:00.000Z'),
      entry('com.shared', 'Shared', '2024-01-15T10:30:00.000Z'),
      entry('com.untouched', 'Untouched', '2024-01-15T11:30:00.000Z'),
    ]);

    const submission = buildHourlySubmission(grouped, new Set(['com.child']), {
      'com.shared': new Set(['9am - 10am']),
    });

    // child-only: both records; shared: only the 9am bucket; untouched + shared 10am excluded.
    expect(submission).toHaveLength(3);
    expect(submission.every((e) => e.users.length === 1 && e.users[0] === HOURLY_SURVEY_USER)).toBe(true);
    const stamped = submission.map((e) => `${e.appPackageName}@${e.timestamp}`).sort();
    expect(stamped).toEqual([
      'com.child@2024-01-15T09:30:00.000Z',
      'com.child@2024-01-15T14:30:00.000Z',
      'com.shared@2024-01-15T09:30:00.000Z',
    ]);
    // the orphaned app and the unselected shared bucket never appear
    expect(submission.some((e) => e.appPackageName === 'com.untouched')).toBe(false);
    expect(submission.some((e) => e.timestamp === '2024-01-15T10:30:00.000Z')).toBe(false);
  });

  test('an app that is both child-only and present in shared selections is emitted once', () => {
    const grouped = groupByHourly([
      entry('com.dup', 'Dup', '2024-01-15T09:30:00.000Z'),
      entry('com.dup', 'Dup', '2024-01-15T10:30:00.000Z'),
    ]);
    const submission = buildHourlySubmission(grouped, new Set(['com.dup']), {
      'com.dup': new Set(['9am - 10am']),
    });
    expect(submission).toHaveLength(2);
  });

  test('does not mutate the source entries', () => {
    const grouped = groupByHourly([entry('com.child', 'Child', '2024-01-15T09:30:00.000Z')]);
    buildHourlySubmission(grouped, new Set(['com.child']), {});
    expect(grouped['com.child']?.buckets['9am - 10am']?.[0]?.users).toEqual([]);
  });
});
