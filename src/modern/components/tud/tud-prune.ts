// The pure submission path for the wizard: live-page selection → per-page pruning →
// payload build. The form component calls exactly these functions, so the shipped
// submission is the same code tud-prune.test.ts exercises (no tested/shipped drift).
//
// Two things this guards against, both rooted in `answers` accumulating pages from a
// longer earlier walk when the participant goes back and shortens the day:
//   * orphaned pages beyond the new summary — excluded by walking only `livePages`;
//   * stale activity carriers (primaryActivity / times / followUpCompleted) left on a
//     page since demoted to the night page — dropped by gating CARRIER_CODES to
//     activity (primary/contextual) pages only.
import {
  type ActivityDay,
  carriedActivity,
  FIELD,
  getFirstActivityPage,
  livePages,
  type PageAnswers,
  type PageKind,
  type TudAnswers,
  type TudSettings,
} from './tud-flow';
import type { OptionContext } from './tud-options';
import { buildPage, type PageParams } from './tud-schema';
import { type BuildSubmissionInput, buildSubmission, type TimeUseDiaryResponse } from './tud-submit';

// Carried between an activity's primary page and its contextual follow-up; only an
// activity page is allowed to keep these, so a demoted night page can't emit them.
const CARRIER_CODES: string[] = [
  FIELD.ACTIVITY_START_TIME,
  FIELD.ACTIVITY_END_TIME,
  FIELD.FOLLOWUP_COMPLETED,
  FIELD.PRIMARY_ACTIVITY,
];

function isActivityKind(kind: PageKind): boolean {
  return kind === 'primary' || kind === 'contextual';
}

function prunePageAnswers(stored: PageAnswers, visibleCodes: Set<string>, keepCarriers: boolean): PageAnswers {
  const kept: PageAnswers = {};
  for (const [code, value] of Object.entries(stored)) {
    if (visibleCodes.has(code) || (keepCarriers && CARRIER_CODES.includes(code))) kept[code] = value;
  }
  return kept;
}

// Field-resolution params for a page. Only the *codes* of the resolved fields matter
// for pruning, so the localized label slots are left blank — the conditional field
// set depends on the english canonical answers and carried activity, not on wording.
function pruneParams(
  answers: TudAnswers,
  page: number,
  stored: PageAnswers,
  activityDay: ActivityDay,
  settings: TudSettings,
  ctx: OptionContext,
): PageParams {
  const own = stored[FIELD.PRIMARY_ACTIVITY];
  const prev = carriedActivity(answers, page);
  return {
    activityDay,
    carriedActivity: (typeof own === 'string' ? own : prev) ?? '',
    ctx,
    isFirstActivity: page === getFirstActivityPage(activityDay),
    pageAnswers: stored,
    prevActivityLabel: '',
    settings,
    startTimeLabel: '',
  };
}

/**
 * The live answer map: only pages on the current flow, each pruned to its visible
 * fields (plus activity carriers on activity pages). Used both to build the
 * submission and to render the summary, so the two never disagree.
 */
export function livePrunedAnswers(
  answers: TudAnswers,
  activityDay: ActivityDay,
  settings: TudSettings,
  ctx: OptionContext,
): TudAnswers {
  const out: TudAnswers = {};
  for (const { page, kind } of livePages(answers, activityDay, settings)) {
    const stored = answers[page] ?? {};
    const visible = new Set(
      buildPage(kind, pruneParams(answers, page, stored, activityDay, settings, ctx)).fields.map((f) => f.code),
    );
    out[page] = prunePageAnswers(stored, visible, isActivityKind(kind));
  }
  return out;
}

export interface LiveSubmissionInput {
  answers: TudAnswers;
  activityDay: ActivityDay;
  settings: TudSettings;
  ctx: OptionContext;
  activityDate: string;
  familyId?: string | null;
  waveId?: string | null;
  formatDateTime?: (date: string, time: string) => string;
}

/** Build the wire payload from the live, pruned answers. */
export function buildLiveSubmission(input: LiveSubmissionInput): TimeUseDiaryResponse[] {
  const pruned = livePrunedAnswers(input.answers, input.activityDay, input.settings, input.ctx);
  const submission: BuildSubmissionInput = {
    activityDate: input.activityDate,
    activityDay: input.activityDay,
    answers: pruned,
    familyId: input.familyId ?? null,
    waveId: input.waveId ?? null,
  };
  if (input.formatDateTime) submission.formatDateTime = input.formatDateTime;
  return buildSubmission(submission);
}
