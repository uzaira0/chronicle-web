import { describe, expect, test } from 'bun:test';

import { createTranslator } from '@/i18n/translator';
import type { TudSettings } from './tud-flow';
import type { OptionContext } from './tud-options';
import { buildPage, type FieldDef, type PageParams } from './tud-schema';

const ctx: OptionContext = {
  effectiveCode: 'en',
  enTranslator: createTranslator('en'),
  translator: createTranslator('en'),
};

const settings = (o: Partial<TudSettings> = {}): TudSettings => ({
  clockFormat: 12,
  clockFormatLocked: false,
  enableOsu: false,
  enableSherbrooke: false,
  ...o,
});

const params = (o: Partial<PageParams> = {}): PageParams => ({
  activityDay: 'yesterday',
  ctx,
  isFirstActivity: true,
  pageAnswers: {},
  settings: settings(),
  ...o,
});

const codes = (fields: FieldDef[]) => fields.map((f) => f.code);

describe('pre-survey page', () => {
  test('shows dayOfWeek + typicalDay; reveals nonTypicalDayReason only when typicalDay = No', () => {
    expect(codes(buildPage('presurvey', params()).fields)).toEqual(['dayOfWeek', 'typicalDay']);
    const withReason = buildPage('presurvey', params({ pageAnswers: { typicalDay: 'No' } }));
    expect(codes(withReason.fields)).toContain('nonTypicalDayReason');
  });

  test('typicalDay options store english Yes/No but show the choice sentences', () => {
    const typical = buildPage('presurvey', params()).fields.find((f) => f.code === 'typicalDay');
    expect(typical?.options?.map((o) => o.value)).toEqual(['Yes', 'No']);
    expect(typical?.options?.[0]?.label).toContain('was typical');
  });
});

describe('day-span page', () => {
  test('today includes the pre-day bedtime, yesterday(non-OSU) the post-day wake-up', () => {
    expect(codes(buildPage('dayspan', params({ activityDay: 'today' })).fields)).toEqual([
      'bedTimeBeforeActivityDay',
      'dayStartTime',
      'dayEndTime',
    ]);
    expect(codes(buildPage('dayspan', params({ activityDay: 'yesterday' })).fields)).toEqual([
      'dayStartTime',
      'dayEndTime',
      'wakeUpTimeAfterActivityDay',
    ]);
  });

  test('yesterday + OSU drops both extra time fields', () => {
    expect(
      codes(buildPage('dayspan', params({ activityDay: 'yesterday', settings: settings({ enableOsu: true }) })).fields),
    ).toEqual(['dayStartTime', 'dayEndTime']);
  });
});

describe('primary activity page', () => {
  test('options are the english activity strings', () => {
    const primary = buildPage('primary', params()).fields.find((f) => f.code === 'primaryActivity');
    const values = primary?.options?.map((o) => o.value) ?? [];
    expect(values).toContain('Napping/sleeping');
    expect(values).toContain('Using screen media (videos, apps, chat, etc.)');
  });
});

describe('contextual page', () => {
  const media = 'Using screen media (videos, apps, chat, etc.)';
  const reading = 'Reading or listening to a story (paper book, eBook, audiobook, etc.)';

  test('non-OSU shows caregiver + background media; OSU shows collaborator instead', () => {
    const nonOsu = codes(buildPage('contextual', params({ carriedActivity: 'Playing indoors' })).fields);
    expect(nonOsu).toContain('careGiver');
    expect(nonOsu).toContain('bgTvDay');
    expect(nonOsu).not.toContain('collaborator');
    const osu = codes(
      buildPage('contextual', params({ carriedActivity: 'Playing indoors', settings: settings({ enableOsu: true }) }))
        .fields,
    );
    expect(osu).toContain('collaborator');
    expect(osu).not.toContain('careGiver');
    expect(osu).not.toContain('bgTvDay');
  });

  test('reading activity reveals book followups', () => {
    const fields = codes(buildPage('contextual', params({ carriedActivity: reading })).fields);
    expect(fields).toContain('primaryBookType');
    expect(fields).toContain('primaryBookTitle');
  });

  test('media activity reveals media followups', () => {
    const fields = codes(buildPage('contextual', params({ carriedActivity: media })).fields);
    expect(fields).toContain('primaryMediaActivity');
    expect(fields).toContain('primaryMediaAge');
  });

  test('secondary activity block appears only when otherActivity = Yes', () => {
    const without = codes(buildPage('contextual', params({ carriedActivity: 'Playing indoors' })).fields);
    expect(without).toContain('otherActivity');
    expect(without).not.toContain('secondaryActivity');
    const withSecondary = codes(
      buildPage('contextual', params({ carriedActivity: 'Playing indoors', pageAnswers: { otherActivity: 'Yes' } }))
        .fields,
    );
    expect(withSecondary).toContain('secondaryActivity');
  });
});

describe('night page', () => {
  test('non-OSU has sleep arrangement + night background media', () => {
    const fields = codes(buildPage('night', params()).fields);
    expect(fields).toEqual(['typicalSleepPattern', 'sleepArrangement', 'wakeUpCount', 'bgTvNight', 'bgAudioNight']);
  });

  test('OSU night is reduced to sleep pattern + wake-up count', () => {
    const fields = codes(buildPage('night', params({ settings: settings({ enableOsu: true }) })).fields);
    expect(fields).toEqual(['typicalSleepPattern', 'wakeUpCount']);
  });

  test('non-typical sleep reveals the reason field', () => {
    const fields = codes(buildPage('night', params({ pageAnswers: { typicalSleepPattern: 'No' } })).fields);
    expect(fields).toContain('nonTypicalSleepReason');
  });

  test('Sherbrooke relabels Crib/cot/bed to Bed', () => {
    const arr = buildPage('night', params({ settings: settings({ enableSherbrooke: true }) })).fields.find(
      (f) => f.code === 'sleepArrangement',
    );
    expect(arr?.options?.every((o) => !o.value.includes('Crib/cot/bed'))).toBe(true);
    expect(arr?.options?.some((o) => o.value.startsWith('Bed'))).toBe(true);
  });
});

describe('page title', () => {
  test('night page carries the Nighttime Activity heading', () => {
    expect(buildPage('night', params()).title).toBe('Nighttime Activity');
  });
});
