import { describe, expect, test } from 'bun:test';

import {
  type ActivityDay,
  DAY_SPAN_PAGE,
  getFirstActivityPage,
  isDayComplete,
  livePages,
  type PageKind,
  pageKind,
  type TudAnswers,
  type TudSettings,
  timeToMinutes,
} from './tud-flow';

const baseSettings = (overrides: Partial<TudSettings> = {}): TudSettings => ({
  clockFormat: 12,
  clockFormatLocked: false,
  enableOsu: false,
  enableSherbrooke: false,
  ...overrides,
});

// Walk pages 0..n and collect their kinds for a given fixture.
function kinds(answers: TudAnswers, day: ActivityDay, settings: TudSettings, upTo: number): PageKind[] {
  const out: PageKind[] = [];
  for (let p = 0; p <= upTo; p += 1) out.push(pageKind(answers, p, day, settings));
  return out;
}

describe('timeToMinutes', () => {
  test('parses canonical HH:MM 24h strings', () => {
    expect(timeToMinutes('07:00')).toBe(420);
    expect(timeToMinutes('19:30')).toBe(1170);
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('24:00')).toBe(1440);
  });
  test('rejects junk', () => {
    expect(timeToMinutes('7am')).toBeNull();
    expect(timeToMinutes('')).toBeNull();
    expect(timeToMinutes(undefined)).toBeNull();
    expect(timeToMinutes('25:00')).toBeNull();
  });
});

describe('getFirstActivityPage', () => {
  test('today starts the loop at 4 (night precedes it), yesterday at 3', () => {
    expect(getFirstActivityPage('today')).toBe(4);
    expect(getFirstActivityPage('yesterday')).toBe(3);
  });
});

describe('page flow — YESTERDAY, non-OSU', () => {
  // 2 activities: 07:00 wake .. 19:00 bed. activity1 08:00, activity2 19:00 (=day end).
  const answers: TudAnswers = {
    [DAY_SPAN_PAGE]: { dayEndTime: '19:00', dayStartTime: '07:00' },
    3: { activityEndTime: '08:00', primaryActivity: 'Napping/sleeping' },
    4: { activityEndTime: '08:00', followUpCompleted: true, primaryActivity: 'Napping/sleeping' },
    5: { activityEndTime: '19:00', primaryActivity: 'Playing indoors' },
    6: { activityEndTime: '19:00', followUpCompleted: true, primaryActivity: 'Playing indoors' },
  };
  const settings = baseSettings();

  test('emits intro→presurvey→dayspan→(primary,contextual)×2→night→summary', () => {
    expect(kinds(answers, 'yesterday', settings, 8)).toEqual([
      'intro',
      'presurvey',
      'dayspan',
      'primary',
      'contextual',
      'primary',
      'contextual',
      'night',
      'summary',
    ]);
  });

  test('day completes only on the contextual page whose end == day end', () => {
    expect(isDayComplete(answers, 5)).toBe(false); // primary page, no followup
    expect(isDayComplete(answers, 6)).toBe(true); // contextual, end==19:00
  });
});

describe('page flow — TODAY', () => {
  // night is the fixed page 3; loop starts at 4.
  const answers: TudAnswers = {
    [DAY_SPAN_PAGE]: { dayEndTime: '19:00', dayStartTime: '07:00' },
    3: {}, // night
    4: { activityEndTime: '10:00', primaryActivity: 'Eating/Drinking' },
    5: { activityEndTime: '10:00', followUpCompleted: true, primaryActivity: 'Eating/Drinking' },
    6: { activityEndTime: '19:00', primaryActivity: 'Playing outdoors' },
    7: { activityEndTime: '19:00', followUpCompleted: true, primaryActivity: 'Playing outdoors' },
  };
  const settings = baseSettings();

  test('emits intro→presurvey→dayspan→night→(primary,contextual)×2→summary', () => {
    expect(kinds(answers, 'today', settings, 8)).toEqual([
      'intro',
      'presurvey',
      'dayspan',
      'night',
      'primary',
      'contextual',
      'primary',
      'contextual',
      'summary',
    ]);
  });
});

describe('page flow — YESTERDAY + OSU (adds a wake-up page after night)', () => {
  // single activity all day, then night, then the OSU wake-up page, then summary.
  const answers: TudAnswers = {
    [DAY_SPAN_PAGE]: { dayEndTime: '19:00', dayStartTime: '07:00' },
    3: { activityEndTime: '19:00', primaryActivity: 'Attending school/childcare' },
    4: { activityEndTime: '19:00', followUpCompleted: true, primaryActivity: 'Attending school/childcare' },
  };
  const settings = baseSettings({ enableOsu: true });

  test('emits intro→presurvey→dayspan→primary→contextual→night→wakeup→summary', () => {
    expect(kinds(answers, 'yesterday', settings, 7)).toEqual([
      'intro',
      'presurvey',
      'dayspan',
      'primary',
      'contextual',
      'night',
      'wakeup',
      'summary',
    ]);
  });

  test('without OSU the same answers skip the wake-up page', () => {
    const noOsu = baseSettings();
    expect(pageKind(answers, 6, 'yesterday', noOsu)).toBe('summary');
    expect(pageKind(answers, 6, 'yesterday', settings)).toBe('wakeup');
  });
});

describe('loop does not terminate early', () => {
  test('an in-progress contextual page (end < day end) is contextual, not summary', () => {
    const answers: TudAnswers = {
      [DAY_SPAN_PAGE]: { dayEndTime: '19:00', dayStartTime: '07:00' },
      3: { activityEndTime: '09:00', primaryActivity: 'Eating/Drinking' },
      4: { activityEndTime: '09:00', followUpCompleted: true, primaryActivity: 'Eating/Drinking' },
    };
    expect(pageKind(answers, 4, 'yesterday', baseSettings())).toBe('contextual');
    expect(pageKind(answers, 5, 'yesterday', baseSettings())).toBe('primary');
  });
});

describe('livePages — the live flow excludes orphaned pages', () => {
  // A single live activity fills the day (p3 primary, p4 contextual at day end), so the
  // flow is intro→…→contextual→night→summary. p6+ are orphans left over from a longer
  // earlier walk that the participant shortened by going back.
  const answers: TudAnswers = {
    0: { clockFormat: 12 },
    1: { dayOfWeek: 'Monday', typicalDay: 'Yes' },
    [DAY_SPAN_PAGE]: { dayEndTime: '19:00', dayStartTime: '07:00', wakeUpTimeAfterActivityDay: '07:00' },
    3: { activityEndTime: '19:00', activityStartTime: '07:00', primaryActivity: 'Playing indoors' },
    4: {
      activityEndTime: '19:00',
      activityStartTime: '07:00',
      careGiver: ['A parent or parental figure'],
      followUpCompleted: true,
      primaryActivity: 'Playing indoors',
    },
    5: { typicalSleepPattern: 'Yes', wakeUpCount: "Didn't wake up" }, // night
    6: { activityEndTime: '20:00', followUpCompleted: true, primaryActivity: 'ORPHAN' }, // beyond summary
    7: { activityEndTime: '21:00', followUpCompleted: true, primaryActivity: 'ALSO ORPHAN' },
  };

  test('walks pre-survey..night and stops before the first summary page', () => {
    const live = livePages(answers, 'yesterday', baseSettings());
    expect(live.map((entry) => entry.page)).toEqual([1, 2, 3, 4, 5]);
    expect(live.find((entry) => entry.page === 5)?.kind).toBe('night');
    expect(live.some((entry) => entry.page >= 6)).toBe(false);
  });
});
