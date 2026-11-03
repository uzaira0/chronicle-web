import type { AppUsageAnswer, AppUsageDayApp } from '@/state/study-operations-api';

/**
 * Pure core for the HOURLY app-usage survey (parity with upstream methodic-labs
 * `HourlyAppUsageSurvey`). The participant marks, per app, the study-zone hours their child used it;
 * every asked hour is answered: `users: ['Target Child']` when marked, else no one (`[]`).
 *
 * All wizard correctness (bucketing, step transitions, submission shape) lives here so it can be
 * unit-tested without rendering — mirroring the TUD feature's pure-core discipline.
 */

/** Upstream stamps every hourly-survey record's `users` with this single literal. */
export const HOURLY_SURVEY_USER = 'Target Child';

export type HourlyApp = {
  appLabel: string;
  /** hour-range label (e.g. "9am - 10am") -> the start of the server block it asks about */
  buckets: Record<string, string>;
};
/** keyed by appPackageName */
export type HourlyGrouped = Record<string, HourlyApp>;

function hourInZone(timestamp: string, timeZone: string): number {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 0;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).formatToParts(date);
    const raw = parts.find((p) => p.type === 'hour')?.value ?? '0';
    const hour = Number.parseInt(raw, 10);
    // hour12:false can yield "24" at midnight in some engines — map it back to 0.
    return Number.isNaN(hour) ? 0 : hour % 24;
  } catch {
    return date.getUTCHours();
  }
}

function formatHour(hour: number): string {
  const normalized = ((hour % 24) + 24) % 24;
  const twelve = normalized % 12 === 0 ? 12 : normalized % 12;
  return `${twelve}${normalized < 12 ? 'am' : 'pm'}`;
}

/**
 * The hour-of-day bucket label for a usage record, computed in the record's own timezone, e.g.
 * `"9am - 10am"` (hour-aligned, 1-hour window, lowercase am/pm). Matches upstream's `getTimeRange`.
 */
export function getTimeRange(timestamp: string, timezone: string): string {
  const start = hourInZone(timestamp, timezone || 'UTC');
  return `${formatHour(start)} - ${formatHour(start + 1)}`;
}

function utcOffset(timestamp: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(
      new Date(timestamp),
    );
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * The unanswered blocks of each app, by hour label in the study zone. The hour repeated when daylight saving ends
 * gets its UTC offset appended, so both hours are asked.
 */
export function groupByHourly(apps: AppUsageDayApp[], timeZone: string): HourlyGrouped {
  const grouped: HourlyGrouped = {};
  for (const app of apps) {
    const buckets: Record<string, string> = {};
    for (const block of app.blocks) {
      if (block.users != null) continue;
      const range = getTimeRange(block.start, timeZone);
      buckets[range in buckets ? `${range} (${utcOffset(block.start, timeZone)})` : range] = block.start;
    }
    if (Object.keys(buckets).length > 0)
      grouped[app.appPackageName] = { appLabel: app.appLabel || app.appPackageName, buckets };
  }
  return grouped;
}

function rangeStartHour(range: string): number {
  const startLabel = range.split(' - ')[0] ?? '';
  // Every bucket key starts with formatHour(hourInZone(...)), an integer hour, so the label always matches.
  const match = startLabel.match(/^(\d+)(am|pm)$/);
  const base = Number.parseInt(match?.[1] ?? '0', 10) % 12;
  return match?.[2] === 'pm' ? base + 12 : base;
}

/** Bucket labels for an app, sorted chronologically (upstream sorted lexically — "10am" < "9am" — a bug). */
export function sortedBucketRanges(app: HourlyApp): string[] {
  return Object.keys(app.buckets).sort((a, b) => rangeStartHour(a) - rangeStartHour(b));
}

/** Bucket labels of `app` not already chosen in `selected` — the "remaining times" resolve pass. */
export function remainingRanges(app: HourlyApp, selected: ReadonlySet<string>): string[] {
  return sortedBucketRanges(app).filter((range) => !selected.has(range));
}

export type HourlyStep = 'intro' | 'selectChildApps' | 'selectSharedApps' | 'resolveSharedApps' | 'resolveOtherApps';

const HOURLY_STEP_ORDER: readonly HourlyStep[] = [
  'intro',
  'selectChildApps',
  'selectSharedApps',
  'resolveSharedApps',
  'resolveOtherApps',
];

/** Next step, or `null` when the current step is terminal (submit). Skips the resolve steps when no app is shared. */
export function hourlyNextStep(step: HourlyStep, hasSharedApps: boolean): HourlyStep | null {
  switch (step) {
    case 'intro':
      return 'selectChildApps';
    case 'selectChildApps':
      return 'selectSharedApps';
    case 'selectSharedApps':
      return hasSharedApps ? 'resolveSharedApps' : null;
    case 'resolveSharedApps':
      return 'resolveOtherApps';
    case 'resolveOtherApps':
      return null;
  }
}

export function hourlyPrevStep(step: HourlyStep): HourlyStep | null {
  const index = HOURLY_STEP_ORDER.indexOf(step);
  return index > 0 ? (HOURLY_STEP_ORDER[index - 1] ?? null) : null;
}

/** True when "Next" should submit (terminal step, excluding the intro). */
export function isHourlyFinalStep(step: HourlyStep, hasSharedApps: boolean): boolean {
  return step !== 'intro' && hourlyNextStep(step, hasSharedApps) === null;
}

/** Per-app union of two selection maps (used to merge the primary + remaining resolve passes). */
export function mergeSelections(
  a: Readonly<Record<string, ReadonlySet<string>>>,
  b: Readonly<Record<string, ReadonlySet<string>>>,
): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const [pkg, ranges] of Object.entries(a)) {
    out[pkg] = new Set(ranges);
  }
  for (const [pkg, ranges] of Object.entries(b)) {
    let target = out[pkg];
    if (!target) {
      target = new Set<string>();
      out[pkg] = target;
    }
    for (const range of ranges) {
      target.add(range);
    }
  }
  return out;
}

/**
 * Build the HOURLY submission: an answer for every asked block, `users: ['Target Child']` for a child-only app and
 * for each selected hour of a shared app, else `[]`. `sharedSelections` is the merged primary+remaining selection.
 * Upstream `createHourlySurveySubmissionData` sent only the child's hours; here every hour is answered, so the day
 * is complete.
 */
export function buildHourlySubmission(
  grouped: HourlyGrouped,
  childOnlyApps: ReadonlySet<string>,
  sharedSelections: Readonly<Record<string, ReadonlySet<string>>>,
): AppUsageAnswer[] {
  return Object.entries(grouped).flatMap(([pkg, app]) =>
    Object.entries(app.buckets).map(([range, blockStart]) => ({
      appPackageName: pkg,
      blockStart,
      users: childOnlyApps.has(pkg) || sharedSelections[pkg]?.has(range) ? [HOURLY_SURVEY_USER] : [],
    })),
  );
}
