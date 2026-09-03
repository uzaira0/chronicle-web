import { describe, expect, test } from 'bun:test';

import { advancePage, dayEndMinutes, seedForPage, setAnswer, timeErrors } from './tud-engine';
import { type ActivityDay, FIELD, type PageAnswers, pageKind, type TudAnswers, type TudSettings } from './tud-flow';
import { buildSubmission, type TimeUseDiaryResponse } from './tud-submit';

const settings = (o: Partial<TudSettings> = {}): TudSettings => ({
  clockFormat: 12,
  clockFormatLocked: false,
  enableOsu: false,
  enableSherbrooke: false,
  ...o,
});

/**
 * Drive the wizard end-to-end exactly as the form does: at each page, fill the
 * scripted answers, then advance (which seeds the next page's carried fields), until
 * the summary. This is the seam test — it exercises the real seedForPage + merge that
 * *produces* the answer maps the flow/submit unit tests assume.
 */
function walk(
  activityDay: ActivityDay,
  cfg: TudSettings,
  scripts: Record<number, PageAnswers>,
): { answers: TudAnswers; lastPage: number } {
  let answers: TudAnswers = { 0: { [FIELD.CLOCK_FORMAT]: cfg.clockFormat } };
  let page = 0;
  for (let guard = 0; guard < 50; guard += 1) {
    for (const [code, value] of Object.entries(scripts[page] ?? {})) {
      answers = setAnswer(answers, page, code, value);
    }
    if (pageKind(answers, page, activityDay, cfg) === 'summary') return { answers, lastPage: page };
    const advanced = advancePage(answers, page, activityDay, cfg);
    answers = advanced.answers;
    page = advanced.page;
  }
  throw new Error('walk did not terminate');
}

function byCode(rows: TimeUseDiaryResponse[], code: string): TimeUseDiaryResponse | undefined {
  return rows.find((r) => r.code === code);
}

describe('full wizard walk — YESTERDAY (single activity to day end)', () => {
  const { answers, lastPage } = walk('yesterday', settings(), {
    1: { dayOfWeek: 'Monday', typicalDay: 'Yes' },
    2: { dayEndTime: '19:00', dayStartTime: '07:00', wakeUpTimeAfterActivityDay: '07:00' },
    3: { activityEndTime: '19:00', primaryActivity: 'Playing indoors' },
    4: {
      adultMedia: 'No',
      bgAudioDay: 'No',
      bgTvDay: 'No',
      careGiver: ['A parent or parental figure'],
      otherActivity: 'No',
    },
    5: {
      bgAudioNight: 'No',
      bgTvNight: 'No',
      sleepArrangement: "Co-sleeping in a parent's bed",
      typicalSleepPattern: 'Yes',
      wakeUpCount: "Didn't wake up",
    },
  });

  test('reaches the summary page', () => {
    expect(lastPage).toBe(6);
    expect(pageKind(answers, lastPage, 'yesterday', settings())).toBe('summary');
  });

  test('seedForPage carried the activity identity + times onto the contextual page', () => {
    const ctx = answers[4] ?? {};
    expect(ctx[FIELD.FOLLOWUP_COMPLETED]).toBe(true);
    expect(ctx[FIELD.PRIMARY_ACTIVITY]).toBe('Playing indoors');
    expect(ctx[FIELD.ACTIVITY_START_TIME]).toBe('07:00'); // seeded from dayStartTime
    expect(ctx[FIELD.ACTIVITY_END_TIME]).toBe('19:00');
  });

  test('the walked answers produce a faithful submission payload', () => {
    const rows = buildSubmission({
      activityDate: '2026-06-01',
      activityDay: 'yesterday',
      answers,
      formatDateTime: (d, t) => `${d}T${t}:00+00:00`,
    });
    expect(rows[0]?.code).toBe('activityDate');
    const activity = byCode(rows, 'primaryActivity');
    expect(activity?.response).toEqual(['Playing indoors']);
    expect(activity?.startDateTime).toBe('2026-06-01T07:00:00+00:00');
    expect(activity?.endDateTime).toBe('2026-06-01T19:00:00+00:00');
    expect(byCode(rows, 'careGiver')?.response).toEqual(['A parent or parental figure']);
    expect(byCode(rows, 'dayOfWeek')?.response).toEqual(['Monday']);
    expect(byCode(rows, 'typicalSleepPattern')?.question).toBe('Sleep pattern');
    // internal carriers never leak
    expect(byCode(rows, 'followUpCompleted')).toBeUndefined();
    expect(byCode(rows, 'activityStartTime')).toBeUndefined();
  });
});

describe('full wizard walk — TODAY (night precedes the activity loop)', () => {
  const { answers, lastPage } = walk('today', settings(), {
    1: { dayOfWeek: 'Tuesday', typicalDay: 'Yes' },
    2: { bedTimeBeforeActivityDay: '19:00', dayEndTime: '19:00', dayStartTime: '07:00' },
    3: {
      bgAudioNight: 'No',
      bgTvNight: 'No',
      sleepArrangement: "Co-sleeping in a parent's bed",
      typicalSleepPattern: 'Yes',
      wakeUpCount: '1 time',
    },
    4: { activityEndTime: '19:00', primaryActivity: 'Eating/Drinking' },
    5: { adultMedia: 'No', bgAudioDay: 'No', bgTvDay: 'No', careGiver: ['A grandparent'], otherActivity: 'No' },
  });

  test('night is page 3 and the walk reaches summary', () => {
    expect(pageKind(answers, 3, 'today', settings())).toBe('night');
    expect(pageKind(answers, lastPage, 'today', settings())).toBe('summary');
    expect(lastPage).toBe(6);
  });

  test('the single activity submits with the chosen label', () => {
    const rows = buildSubmission({
      activityDate: '2026-06-02',
      activityDay: 'today',
      answers,
      formatDateTime: (d, t) => `${d}T${t}`,
    });
    expect(byCode(rows, 'primaryActivity')?.response).toEqual(['Eating/Drinking']);
  });
});

describe('full wizard walk — YESTERDAY + OSU (adds the wake-up page)', () => {
  const cfg = settings({ enableOsu: true });
  const { answers, lastPage } = walk('yesterday', cfg, {
    1: { dayOfWeek: 'Wednesday', typicalDay: 'Yes' },
    2: { dayEndTime: '19:00', dayStartTime: '07:00' },
    3: { activityEndTime: '19:00', primaryActivity: 'Playing indoors' },
    4: { collaborator: 'No one, engaging independently', otherActivity: 'No' },
    5: { typicalSleepPattern: 'Yes', wakeUpCount: "Didn't wake up" },
    6: { wakeUpTimeAfterActivityDay: '07:00' },
  });

  test('the OSU wake-up page sits between night and summary', () => {
    expect(pageKind(answers, 5, 'yesterday', cfg)).toBe('night');
    expect(pageKind(answers, 6, 'yesterday', cfg)).toBe('wakeup');
    expect(pageKind(answers, lastPage, 'yesterday', cfg)).toBe('summary');
    expect(lastPage).toBe(7);
  });

  test('OSU uses collaborator instead of caregiver, and it submits', () => {
    const rows = buildSubmission({
      activityDate: '2026-06-03',
      activityDay: 'yesterday',
      answers,
      formatDateTime: (d, t) => `${d}T${t}`,
    });
    expect(byCode(rows, 'collaborator')?.response).toEqual(['No one, engaging independently']);
    expect(byCode(rows, 'careGiver')).toBeUndefined();
  });
});

describe('seedForPage in isolation', () => {
  const base: TudAnswers = {
    2: { dayEndTime: '19:00', dayStartTime: '07:00' },
    3: { activityEndTime: '09:00', primaryActivity: 'Napping/sleeping' },
  };

  test('seeds a contextual page with the prior activity carriers', () => {
    const seed = seedForPage(base, 4, 'yesterday', settings());
    expect(seed).toEqual({
      activityEndTime: '09:00',
      activityStartTime: undefined,
      followUpCompleted: true,
      primaryActivity: 'Napping/sleeping',
    });
  });

  test('seeds a follow-on primary page with the previous end as its start', () => {
    const withCtx: TudAnswers = {
      ...base,
      4: { activityEndTime: '09:00', followUpCompleted: true, primaryActivity: 'Napping/sleeping' },
    };
    const seed = seedForPage(withCtx, 5, 'yesterday', settings());
    expect(seed[FIELD.ACTIVITY_START_TIME]).toBe('09:00');
  });
});

describe('timeErrors — cross-field validation (parity with applyCustomValidation)', () => {
  test('day span: end must be after start', () => {
    expect(timeErrors('dayspan', { dayEndTime: '06:00', dayStartTime: '07:00' }, null).has('dayEndTime')).toBe(true);
    expect(timeErrors('dayspan', { dayEndTime: '19:00', dayStartTime: '07:00' }, null).size).toBe(0);
  });

  test('activity: end must be after start and not past the day end', () => {
    expect(
      timeErrors('primary', { activityEndTime: '06:00', activityStartTime: '07:00' }, 1140).has('activityEndTime'),
    ).toBe(true);
    expect(
      timeErrors('primary', { activityEndTime: '20:00', activityStartTime: '08:00' }, 1140).has('activityEndTime'),
    ).toBe(true);
    // ending exactly at day end is allowed (that is what terminates the loop)
    expect(timeErrors('primary', { activityEndTime: '19:00', activityStartTime: '08:00' }, 1140).size).toBe(0);
  });

  test('dayEndMinutes reads the day-span end time', () => {
    expect(dayEndMinutes({ 2: { dayEndTime: '19:00' } })).toBe(1140);
    expect(dayEndMinutes({})).toBeNull();
  });
});
