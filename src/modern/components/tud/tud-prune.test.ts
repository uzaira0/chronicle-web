import { describe, expect, test } from 'bun:test';

import { createTranslator } from '@/i18n/translator';
import type { ActivityDay, TudAnswers, TudSettings } from './tud-flow';
import type { OptionContext } from './tud-options';
import { buildLiveSubmission } from './tud-prune';

const ctx: OptionContext = {
  effectiveCode: 'en',
  enTranslator: createTranslator('en'),
  translator: createTranslator('en'),
};

const settings: TudSettings = { clockFormat: 12, clockFormatLocked: false, enableOsu: false, enableSherbrooke: false };
const day: ActivityDay = 'yesterday';

function submit(answers: TudAnswers) {
  return buildLiveSubmission({
    activityDate: '2026-06-01',
    activityDay: day,
    answers,
    ctx,
    formatDateTime: (d, t) => `${d}T${t}`,
    settings,
  });
}

describe('buildLiveSubmission — a shortened day does not leak orphaned activities', () => {
  // The exact post-edit state of the real footgun: the participant walked three
  // activities (act1→act2→act3→night→summary), then went BACK to activity #2 and set
  // its end to the day end, making it the last activity. The `answers` map still holds
  // every page from the longer walk: page 7 — formerly act3's *primary* page — is now
  // the night page (and carries act3's stale carriers, minus followUpCompleted); page 8
  // — formerly act3's *contextual* page — and page 9 (the old night) are orphans beyond
  // the new summary. Iterating every key would re-emit act3 as a phantom activity and
  // double the night section; the live-page walk + carrier gating must not.
  const shortened: TudAnswers = {
    0: { clockFormat: 12 },
    1: { dayOfWeek: 'Monday', typicalDay: 'Yes' },
    2: { dayEndTime: '19:00', dayStartTime: '07:00', wakeUpTimeAfterActivityDay: '07:00' },
    3: { activityEndTime: '10:00', activityStartTime: '07:00', primaryActivity: 'Playing indoors' },
    4: {
      activityEndTime: '10:00',
      activityStartTime: '07:00',
      adultMedia: 'No',
      bgAudioDay: 'No',
      bgTvDay: 'No',
      careGiver: ['A parent or parental figure'],
      followUpCompleted: true,
      otherActivity: 'No',
      primaryActivity: 'Playing indoors',
    },
    // activity #2, end edited to the day end — now the final activity
    5: { activityEndTime: '19:00', activityStartTime: '10:00', primaryActivity: 'Eating/Drinking' },
    6: {
      activityEndTime: '19:00',
      activityStartTime: '10:00',
      adultMedia: 'No',
      bgAudioDay: 'No',
      bgTvDay: 'No',
      careGiver: ['A grandparent'],
      followUpCompleted: true,
      otherActivity: 'No',
      primaryActivity: 'Eating/Drinking',
    },
    // page 7: was act3's PRIMARY page, now the night page — stale act3 carriers + sleep fields
    7: {
      activityEndTime: '21:00',
      activityStartTime: '19:00',
      bgAudioNight: 'No',
      bgTvNight: 'No',
      primaryActivity: 'Reading',
      sleepArrangement: "Co-sleeping in a parent's bed",
      typicalSleepPattern: 'Yes',
      wakeUpCount: "Didn't wake up",
    },
    // page 8: orphan — was act3's CONTEXTUAL page (the would-be phantom activity)
    8: {
      activityEndTime: '21:00',
      activityStartTime: '19:00',
      careGiver: ['Another adult'],
      followUpCompleted: true,
      primaryActivity: 'Reading',
    },
    // page 9: orphan — the old night page (the would-be duplicate sleep section)
    9: { typicalSleepPattern: 'Yes', wakeUpCount: '1 time' },
  };

  const rows = submit(shortened);
  const activities = rows.filter((row) => row.code === 'primaryActivity');

  test('emits exactly the two live activities, never the orphaned act3', () => {
    expect(activities.map((row) => row.response[0])).toEqual(['Playing indoors', 'Eating/Drinking']);
    expect(rows.some((row) => row.response.includes('Reading'))).toBe(false);
  });

  test('the live activities keep their datetimes', () => {
    expect(activities[0]?.startDateTime).toBe('2026-06-01T07:00');
    expect(activities[0]?.endDateTime).toBe('2026-06-01T10:00');
    expect(activities[1]?.endDateTime).toBe('2026-06-01T19:00');
  });

  test('the night section appears once, with no activity datetimes attached', () => {
    const sleep = rows.filter((row) => row.code === 'typicalSleepPattern');
    expect(sleep).toHaveLength(1);
    expect(sleep[0]?.startDateTime).toBeUndefined();
  });
});
