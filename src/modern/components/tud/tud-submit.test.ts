import { describe, expect, test } from 'bun:test';

import { DAY_SPAN_PAGE, type TudAnswers } from './tud-flow';
import { buildSubmission, localOffsetDateTime, type TimeUseDiaryResponse } from './tud-submit';

// deterministic formatter so datetimes don't depend on the test runner's zone
const utc = (date: string, time: string) => `${date}T${time}:00+00:00`;

function byCode(rows: TimeUseDiaryResponse[], code: string): TimeUseDiaryResponse[] {
  return rows.filter((r) => r.code === code);
}

function one(rows: TimeUseDiaryResponse[], code: string): TimeUseDiaryResponse {
  const matches = byCode(rows, code);
  expect(matches).toHaveLength(1);
  return matches[0] as TimeUseDiaryResponse;
}

describe('buildSubmission', () => {
  const answers: TudAnswers = {
    [DAY_SPAN_PAGE]: { dayEndTime: '19:00', dayStartTime: '07:00' },
    1: { dayOfWeek: 'Monday', typicalDay: 'Yes' },
    3: { activityEndTime: '10:00', activityStartTime: '07:00', primaryActivity: 'Eating/Drinking' },
    4: {
      activityEndTime: '10:00',
      activityStartTime: '07:00',
      careGiver: ['A parent or parental figure'],
      followUpCompleted: true,
      primaryActivity: 'Eating/Drinking',
    },
  };

  const rows = buildSubmission({
    activityDate: '2026-06-01',
    activityDay: 'yesterday',
    answers,
    familyId: 'fam-9',
    formatDateTime: utc,
    waveId: 'wave-1',
  });

  test('leads with activityDate and activityDay', () => {
    expect(rows[0]).toEqual({ code: 'activityDate', question: 'activityDate', response: ['2026-06-01'] });
    expect(rows[1]).toEqual({ code: 'activityDay', question: 'activityDay', response: ['yesterday'] });
  });

  test('trails with waveId then familyId only when present', () => {
    const tail = rows.slice(-2);
    expect(tail[0]).toEqual({ code: 'waveId', question: 'Wave Id', response: ['wave-1'] });
    expect(tail[1]).toEqual({ code: 'familyId', question: 'Family Id', response: ['fam-9'] });
    const noIds = buildSubmission({
      activityDate: '2026-06-01',
      activityDay: 'today',
      answers: {},
      formatDateTime: utc,
    });
    expect(byCode(noIds, 'waveId')).toHaveLength(0);
    expect(byCode(noIds, 'familyId')).toHaveLength(0);
  });

  test('the bare primary page contributes nothing (label + times all omitted)', () => {
    // primaryActivity from page 3 (no followUp) must not appear with page-3 identity;
    // the only primaryActivity row comes from the contextual page 4.
    expect(byCode(rows, 'primaryActivity')).toHaveLength(1);
    // page-3 fields activityStartTime/activityEndTime/primaryActivity are all dropped
    expect(byCode(rows, 'activityStartTime')).toHaveLength(0);
    expect(byCode(rows, 'activityEndTime')).toHaveLength(0);
  });

  test('the contextual page keeps the activity label + followups, with datetimes', () => {
    const activity = one(rows, 'primaryActivity');
    expect(activity.question).toBe('Primary activity');
    expect(activity.response).toEqual(['Eating/Drinking']);
    expect(activity.startDateTime).toBe('2026-06-01T07:00:00+00:00');
    expect(activity.endDateTime).toBe('2026-06-01T10:00:00+00:00');

    const caregiver = one(rows, 'careGiver');
    expect(caregiver.question).toBe('Caregiver');
    expect(caregiver.response).toEqual(['A parent or parental figure']);
    expect(caregiver.startDateTime).toBe('2026-06-01T07:00:00+00:00');
  });

  test('non-activity pages emit titled rows without datetimes', () => {
    const dow = one(rows, 'dayOfWeek');
    expect(dow.question).toBe('Day of week');
    expect(dow.response).toEqual(['Monday']);
    expect(dow.startDateTime).toBeUndefined();

    const typical = one(rows, 'typicalDay');
    expect(typical.question).toBe('Typical day');

    // day span times flow through as plain string responses, no datetimes
    const dayStart = one(rows, 'dayStartTime');
    expect(dayStart.response).toEqual(['07:00']);
    expect(dayStart.question).toBe('dayStartTime'); // not in title lookup -> code
    expect(dayStart.startDateTime).toBeUndefined();
  });

  test('omits internal carrier/flag fields entirely', () => {
    for (const code of ['followUpCompleted', 'activitySelectPage', 'otherActivity', 'clockFormat']) {
      expect(byCode(rows, code)).toHaveLength(0);
    }
  });

  test('drops empty/null/undefined values', () => {
    const sparse = buildSubmission({
      activityDate: '2026-06-01',
      activityDay: 'today',
      answers: { 1: { dayOfWeek: 'Monday', nonTypicalDayReason: '', typicalDay: null } },
      formatDateTime: utc,
    });
    expect(byCode(sparse, 'dayOfWeek')).toHaveLength(1);
    expect(byCode(sparse, 'nonTypicalDayReason')).toHaveLength(0);
    expect(byCode(sparse, 'typicalDay')).toHaveLength(0);
  });
});

describe('localOffsetDateTime', () => {
  test('produces an ISO offset datetime on the given date and time', () => {
    const out = localOffsetDateTime('2026-06-01', '08:30');
    expect(out).toMatch(/^2026-06-01T08:30:00[+-]\d{2}:\d{2}$/);
  });
});
