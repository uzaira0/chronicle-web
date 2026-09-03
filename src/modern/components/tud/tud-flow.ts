// Pure page-flow state machine for the Time Use Diary, ported from the upstream
// `src/containers/tud/utils/is*Page.js` + `getFirstActivityPage.js` + `isDayComplete.js`
// predicates. This is the correctness core of the form: every branch (today vs
// yesterday, the Ohio-State variant, the activity loop and its termination) lives
// here as a pure function of (page, answers, settings) and is exhaustively unit-tested
// in tud-flow.test.ts. The renderer is a thin shell over these decisions.

export type ActivityDay = 'today' | 'yesterday';

export interface TudSettings {
  clockFormat: 12 | 24;
  clockFormatLocked: boolean;
  /** Ohio State University study variant (enableChangesForOhioStateUniversity). */
  enableOsu: boolean;
  /** Sherbrooke University study variant (enableChangesForSherbrookeUniversity). */
  enableSherbrooke: boolean;
}

export type PageAnswers = Record<string, unknown>;
/** Answers keyed by page index, mirroring the upstream per-page section model. */
export type TudAnswers = Record<number, PageAnswers>;

export type PageKind = 'intro' | 'presurvey' | 'dayspan' | 'primary' | 'contextual' | 'night' | 'wakeup' | 'summary';

export const INTRO_PAGE = 0;
export const PRE_SURVEY_PAGE = 1;
export const DAY_SPAN_PAGE = 2;

export const FIELD = Object.freeze({
  ACTIVITY_DATE: 'activityDate',
  ACTIVITY_DAY: 'activityDay',
  ACTIVITY_END_TIME: 'activityEndTime',
  ACTIVITY_START_TIME: 'activityStartTime',
  CLOCK_FORMAT: 'clockFormat',
  DAY_END_TIME: 'dayEndTime',
  DAY_START_TIME: 'dayStartTime',
  FOLLOWUP_COMPLETED: 'followUpCompleted',
  PRIMARY_ACTIVITY: 'primaryActivity',
});

/** Parse a canonical "HH:MM" 24-hour time string to minutes-since-midnight. */
export function timeToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function pageData(answers: TudAnswers, page: number): PageAnswers {
  return answers[page] ?? {};
}

/** First page of the activity loop: 4 for "today" (night precedes it), else 3. */
export function getFirstActivityPage(activityDay: ActivityDay): number {
  return activityDay === 'today' ? 4 : 3;
}

/** A contextual page carries followUpCompleted; a bare primary page does not. */
export function pageHasFollowUp(answers: TudAnswers, page: number): boolean {
  return Boolean(pageData(answers, page)[FIELD.FOLLOWUP_COMPLETED]);
}

function endMinutes(answers: TudAnswers, page: number): number | null {
  return timeToMinutes(pageData(answers, page)[FIELD.ACTIVITY_END_TIME]);
}

function dayEndMinutes(answers: TudAnswers): number | null {
  return timeToMinutes(pageData(answers, DAY_SPAN_PAGE)[FIELD.DAY_END_TIME]);
}

/**
 * The diary day is complete once a *contextual* page's activity end time reaches
 * the configured day end time. The followUpCompleted guard means this can only fire
 * on a contextual page, never on a bare primary one.
 */
export function isDayComplete(answers: TudAnswers, page: number): boolean {
  const end = endMinutes(answers, page);
  const dayEnd = dayEndMinutes(answers);
  return end !== null && dayEnd !== null && end === dayEnd && pageHasFollowUp(answers, page);
}

export function isNightPage(answers: TudAnswers, page: number, activityDay: ActivityDay): boolean {
  if (activityDay === 'today') return page === 3;
  return isDayComplete(answers, page - 1);
}

export function isWakeUpPage(
  answers: TudAnswers,
  page: number,
  activityDay: ActivityDay,
  settings: TudSettings,
): boolean {
  if (activityDay === 'today' || !settings.enableOsu) return false;
  return isNightPage(answers, page - 1, activityDay);
}

export function isSummaryPage(
  answers: TudAnswers,
  page: number,
  activityDay: ActivityDay,
  settings: TudSettings,
): boolean {
  if (activityDay === 'yesterday') {
    return settings.enableOsu
      ? isWakeUpPage(answers, page - 1, activityDay, settings)
      : isNightPage(answers, page - 1, activityDay);
  }
  return isDayComplete(answers, page - 1);
}

/** Within the activity region, true => render the contextual followup page. */
export function shouldDisplayFollowup(answers: TudAnswers, page: number, activityDay: ActivityDay): boolean {
  const first = getFirstActivityPage(activityDay);
  if (page <= first) return false;
  const prevActivity = pageData(answers, page - 1)[FIELD.PRIMARY_ACTIVITY];
  if (!prevActivity) return false;
  return !pageHasFollowUp(answers, page - 1);
}

/**
 * Classify a page into its kind. This is the single source of truth the renderer
 * and the Next/Back controls consult; it composes the predicates above in the same
 * order as the upstream container.
 */
export function pageKind(answers: TudAnswers, page: number, activityDay: ActivityDay, settings: TudSettings): PageKind {
  if (page === INTRO_PAGE) return 'intro';
  if (page === PRE_SURVEY_PAGE) return 'presurvey';
  if (page === DAY_SPAN_PAGE) return 'dayspan';
  if (isSummaryPage(answers, page, activityDay, settings)) return 'summary';
  if (isWakeUpPage(answers, page, activityDay, settings)) return 'wakeup';
  if (isNightPage(answers, page, activityDay)) return 'night';
  return shouldDisplayFollowup(answers, page, activityDay) ? 'contextual' : 'primary';
}

/** The primary activity carried into a contextual page (from the page before it). */
export function carriedActivity(answers: TudAnswers, page: number): string | undefined {
  const value = pageData(answers, page - 1)[FIELD.PRIMARY_ACTIVITY];
  return typeof value === 'string' ? value : undefined;
}

/**
 * The pages the participant actually traverses for the current answers: the
 * contiguous walk from the pre-survey page up to (but excluding) the first summary
 * page. Going back and shortening the day leaves higher-indexed pages from the
 * longer previous walk orphaned beyond this live terminus; iterating `livePages`
 * instead of every key in `answers` is what keeps those orphans (and the stale
 * activity carriers on a page since demoted to night) out of the submission.
 * `maxPages` is a runaway guard for incomplete answers that never reach summary.
 */
export function livePages(
  answers: TudAnswers,
  activityDay: ActivityDay,
  settings: TudSettings,
  maxPages = 60,
): Array<{ page: number; kind: PageKind }> {
  const out: Array<{ page: number; kind: PageKind }> = [];
  for (let page = PRE_SURVEY_PAGE; page < PRE_SURVEY_PAGE + maxPages; page += 1) {
    const kind = pageKind(answers, page, activityDay, settings);
    if (kind === 'summary') break;
    out.push({ page, kind });
  }
  return out;
}
