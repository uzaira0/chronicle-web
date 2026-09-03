// Pure answer-evolution engine for the wizard: the functions that *produce* the
// per-page answer maps the rest of the feature consumes. These were extracted from
// the form component so the full intro→…→summary walk is testable without React
// (tud-engine.test.ts drives them end-to-end per mode), closing the seam between
// "parts verified" and "form verified".
import {
  type ActivityDay,
  DAY_SPAN_PAGE,
  FIELD,
  type PageAnswers,
  type PageKind,
  pageKind,
  type TudAnswers,
  type TudSettings,
  timeToMinutes,
} from './tud-flow';

/** The carrier fields a contextual page inherits from its primary page. */
export function seedForPage(
  answers: TudAnswers,
  nextPage: number,
  activityDay: ActivityDay,
  settings: TudSettings,
): PageAnswers {
  const nextKind = pageKind(answers, nextPage, activityDay, settings);
  const prev = answers[nextPage - 1] ?? {};
  if (nextKind === 'contextual') {
    return {
      [FIELD.ACTIVITY_END_TIME]: prev[FIELD.ACTIVITY_END_TIME],
      [FIELD.ACTIVITY_START_TIME]: prev[FIELD.ACTIVITY_START_TIME],
      [FIELD.FOLLOWUP_COMPLETED]: true,
      [FIELD.PRIMARY_ACTIVITY]: prev[FIELD.PRIMARY_ACTIVITY],
    };
  }
  if (nextKind === 'primary') {
    const prevKind = pageKind(answers, nextPage - 1, activityDay, settings);
    const start =
      prevKind === 'contextual' ? prev[FIELD.ACTIVITY_END_TIME] : answers[DAY_SPAN_PAGE]?.[FIELD.DAY_START_TIME];
    return { [FIELD.ACTIVITY_START_TIME]: start };
  }
  return {};
}

/** Immutably set one answer value (the onChange evolution). */
export function setAnswer(answers: TudAnswers, page: number, code: string, value: unknown): TudAnswers {
  return { ...answers, [page]: { ...answers[page], [code]: value } };
}

/** Advance to the next page, seeding its carried fields (the non-validating part of Next). */
export function advancePage(
  answers: TudAnswers,
  page: number,
  activityDay: ActivityDay,
  settings: TudSettings,
): { answers: TudAnswers; page: number } {
  const next = page + 1;
  const seed = seedForPage(answers, next, activityDay, settings);
  return { answers: { ...answers, [next]: { ...answers[next], ...seed } }, page: next };
}

/**
 * Cross-field time validation, ported from upstream `applyCustomValidation`: an end
 * time must be after its start, and an activity must not end past the day's end time.
 * Returned codes are flagged invalid and block Next (parity the bare required-check lacked).
 */
export function timeErrors(kind: PageKind, pageAnswers: PageAnswers, dayEndMinutes: number | null): Set<string> {
  const errors = new Set<string>();
  if (kind === 'dayspan') {
    const start = timeToMinutes(pageAnswers[FIELD.DAY_START_TIME]);
    const end = timeToMinutes(pageAnswers[FIELD.DAY_END_TIME]);
    if (start !== null && end !== null && end <= start) errors.add(FIELD.DAY_END_TIME);
    return errors;
  }
  if (kind === 'primary') {
    const start = timeToMinutes(pageAnswers[FIELD.ACTIVITY_START_TIME]);
    const end = timeToMinutes(pageAnswers[FIELD.ACTIVITY_END_TIME]);
    if (start !== null && end !== null && end <= start) errors.add(FIELD.ACTIVITY_END_TIME);
    if (end !== null && dayEndMinutes !== null && end > dayEndMinutes) errors.add(FIELD.ACTIVITY_END_TIME);
  }
  return errors;
}

export function dayEndMinutes(answers: TudAnswers): number | null {
  return timeToMinutes(answers[DAY_SPAN_PAGE]?.[FIELD.DAY_END_TIME]);
}
