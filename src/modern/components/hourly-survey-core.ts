import type { AppUsageEntry } from '@/state/study-operations-api';

/**
 * Pure core for the HOURLY app-usage survey (parity with upstream methodic-labs
 * `HourlyAppUsageSurvey`). The participant marks, per app, the hour-of-day buckets their child
 * used it; the submission stamps every selected bucket's usage records with `users: ['Target Child']`.
 *
 * All wizard correctness (bucketing, step transitions, submission shape) lives here so it can be
 * unit-tested without rendering — mirroring the TUD feature's pure-core discipline.
 */

/** Upstream stamps every hourly-survey record's `users` with this single literal. */
export const HOURLY_SURVEY_USER = 'Target Child';

export type HourlyApp = {
  appLabel: string;
  /** hour-range label (e.g. "9am - 10am") -> the usage records that fall in that bucket */
  buckets: Record<string, AppUsageEntry[]>;
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

/** Group flat usage records into `appPackageName -> { appLabel, buckets: { timeRange -> records } }`. */
export function groupByHourly(entries: AppUsageEntry[]): HourlyGrouped {
  const grouped: HourlyGrouped = {};
  for (const entry of entries) {
    const pkg = entry.appPackageName;
    const range = getTimeRange(entry.timestamp, entry.timezone || 'UTC');
    const app = grouped[pkg] ?? { appLabel: entry.appLabel || pkg, buckets: {} };
    if (entry.appLabel) {
      app.appLabel = entry.appLabel;
    }
    const bucket = app.buckets[range] ?? [];
    bucket.push(entry);
    app.buckets[range] = bucket;
    grouped[pkg] = app;
  }
  return grouped;
}

function rangeStartHour(range: string): number {
  const startLabel = range.split(' - ')[0] ?? '';
  const match = startLabel.match(/^(\d+)(am|pm)$/);
  if (!match) {
    return 0;
  }
  const base = Number.parseInt(match[1] ?? '0', 10) % 12;
  return match[2] === 'pm' ? base + 12 : base;
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

export const HOURLY_STEP_ORDER: readonly HourlyStep[] = [
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
 * Build the HOURLY submission: every child-only app's records (all buckets) plus the selected
 * buckets of each shared app, each record stamped `users: ['Target Child']`. `sharedSelections`
 * is the merged primary+remaining selection. Matches upstream `createHourlySurveySubmissionData`.
 */
/** Append every record of `app` in `ranges`, stamped `users: ['Target Child']`, to `out`. */
function emitBuckets(app: HourlyApp, ranges: Iterable<string>, out: AppUsageEntry[]): void {
  for (const range of ranges) {
    for (const entry of app.buckets[range] ?? []) {
      out.push({ ...entry, users: [HOURLY_SURVEY_USER] });
    }
  }
}

export function buildHourlySubmission(
  grouped: HourlyGrouped,
  childOnlyApps: ReadonlySet<string>,
  sharedSelections: Readonly<Record<string, ReadonlySet<string>>>,
): AppUsageEntry[] {
  const out: AppUsageEntry[] = [];
  for (const pkg of childOnlyApps) {
    const app = grouped[pkg];
    if (app) {
      emitBuckets(app, Object.keys(app.buckets), out);
    }
  }
  for (const [pkg, ranges] of Object.entries(sharedSelections)) {
    const app = grouped[pkg];
    // A child-only app already emitted all of its buckets above; never emit it twice.
    if (app && !childOnlyApps.has(pkg)) {
      emitBuckets(app, ranges, out);
    }
  }
  return out;
}
